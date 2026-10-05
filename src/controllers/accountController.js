const bcrypt = require("bcryptjs");
const User = require("../models/userSchema");
const Business = require("../models/businessSchema");
const ApiKey = require("../models/apiKeySchema");
const Notification = require("../models/notificationSchema");
const Recipient = require("../models/recipientSchema");
const Schedule = require("../models/scheduleSchema");
const HttpError = require("../utils/httpError");
const config = require("../config");
const audit = require("../utils/audit");
const mfaService = require("../services/mfaService");
const { MAX_BULK_NOTIFICATIONS } = require("../validators/schemas");
const { startSession, userResponse } = require("./authController");
const { clearSessionCookie } = require("../utils/session");

// The signed-in user's own account: profile, password, two-factor and business settings.
// Dashboard session (or Bearer token) only; API keys cannot reach these routes.

const loadUser = (req) => User.findById(req.user.id).populate("business");

const requirePassword = async (user, password) => {
  if (!(await bcrypt.compare(password, user.password))) {
    throw new HttpError(401, "Your current password is not correct");
  }
};

const accountResponse = (res, user, message) =>
  res.status(200).json({
    success: true,
    message,
    user: userResponse(user, user.business),
  });

const updateProfile = async (req, res) => {
  const user = await loadUser(req);
  user.name = req.validated.body.name;
  await user.save();

  accountResponse(res, user, "Profile updated");
};

// Signs out every other device; this one gets a fresh session
const changePassword = async (req, res) => {
  const { currentPassword, newPassword } = req.validated.body;
  const user = await loadUser(req);

  await requirePassword(user, currentPassword);

  user.password = await bcrypt.hash(newPassword, 10);
  user.tokenVersion += 1;
  user.passwordResetTokenHash = null;
  user.passwordResetExpiresAt = null;
  await user.save();

  audit("account.password.change", req, { userId: user._id });

  res.status(200).json({
    success: true,
    message: "Password changed. Other devices have been signed out.",
    token: startSession(req, res, user),
    user: userResponse(user, user.business),
  });
};

const startMfaSetup = async (req, res) => {
  const user = await loadUser(req);
  await requirePassword(user, req.validated.body.password);

  const setup = await mfaService.startSetup(user);

  res.status(200).json({
    success: true,
    message: "Scan the QR code with your authenticator app, then enter the 6-digit code it shows",
    ...setup,
  });
};

const confirmMfaSetup = async (req, res) => {
  const user = await loadUser(req);
  const recoveryCodes = await mfaService.confirmSetup(user, req.validated.body.code);

  audit("account.mfa.enable", req, { userId: user._id });

  res.status(200).json({
    success: true,
    message: "Two-factor authentication is on. Save your recovery codes somewhere safe.",
    recoveryCodes,
    user: userResponse(user, user.business),
  });
};

const disableMfa = async (req, res) => {
  const { password, code } = req.validated.body;
  const user = await loadUser(req);

  if (!user.mfa?.enabled) {
    throw new HttpError(409, "Two-factor authentication is already off");
  }

  await requirePassword(user, password);

  if (!(await mfaService.consumeCode(user, code))) {
    throw new HttpError(401, "That code is not valid");
  }

  await mfaService.disable(user);
  audit("account.mfa.disable", req, { userId: user._id });

  accountResponse(res, user, "Two-factor authentication is off");
};

const updateBusiness = async (req, res) => {
  if (!req.business) {
    throw new HttpError(403, "This endpoint requires a business account");
  }

  const business = await Business.findByIdAndUpdate(req.business._id, req.validated.body, {
    returnDocument: "after",
    runValidators: true,
  });

  audit("business.update", req, {
    userId: req.user.id,
    businessId: business._id,
    fields: Object.keys(req.validated.body),
  });

  res.status(200).json({
    success: true,
    message: "Business details saved",
    business,
  });
};

// What a business needs to know about this deployment. Never includes credentials.
const getSettings = async (req, res) => {
  const { email, sms, rateLimit, apiKeys, schedules, jwt, publicBaseUrl } = config;

  res.status(200).json({
    success: true,
    settings: {
      delivery: {
        email: {
          live: email.provider === "smtp",
          provider: email.provider,
          from: email.from,
        },
        sms: {
          live: sms.provider === "twilio",
          provider: sms.provider,
          deliveryReports: sms.provider === "twilio" && Boolean(publicBaseUrl),
        },
        inApp: { live: true },
      },
      limits: {
        requestsPerMinute: rateLimit.apiMaxPerMinute,
        bulkRequestsPerMinute: rateLimit.bulkMaxPerMinute,
        notificationsPerBulkRequest: MAX_BULK_NOTIFICATIONS,
        activeApiKeys: apiKeys.maxActivePerBusiness,
        schedules: schedules.maxPerBusiness,
        sessionLifetime: jwt.expiresIn,
      },
      publicBaseUrl: publicBaseUrl || null,
    },
  });
};

const exportAccountData = async (req, res) => {
  if (!req.business) {
    throw new HttpError(403, "A business account is required to export workspace data");
  }

  const businessId = req.business._id;
  const [user, apiKeys, notifications, recipients, schedules] = await Promise.all([
    User.findById(req.user.id)
      .select("name email role business createdAt updatedAt lastLoginAt")
      .lean(),
    ApiKey.find({ business: businessId }).select("-secretHash").lean(),
    Notification.find({ business: businessId }).lean(),
    Recipient.find({ business: businessId }).lean(),
    Schedule.find({ business: businessId }).lean(),
  ]);

  res.setHeader("Content-Disposition", 'attachment; filename="notifyflow-data-export.json"');
  res.status(200).json({
    formatVersion: 1,
    generatedAt: new Date().toISOString(),
    account: user,
    business: req.business.toJSON(),
    apiKeys,
    notifications,
    recipients,
    schedules,
  });
};

const deleteAccount = async (req, res) => {
  const { password } = req.validated.body;
  const user = await loadUser(req);

  if (user.role !== "USER" || !user.business) {
    throw new HttpError(403, "Only a business account can be deleted here");
  }

  await requirePassword(user, password);

  const otherUsers = await User.countDocuments({
    business: user.business._id,
    _id: { $ne: user._id },
  });

  if (otherUsers > 0) {
    throw new HttpError(
      409,
      "This workspace has other users. Contact support to request workspace deletion."
    );
  }

  const businessId = user.business._id;
  audit("account.delete", req, { userId: user._id, businessId });

  await Business.updateOne({ _id: businessId }, { status: "SUSPENDED" });
  await Promise.all([
    ApiKey.deleteMany({ business: businessId }),
    Notification.deleteMany({ business: businessId }),
    Recipient.deleteMany({ business: businessId }),
    Schedule.deleteMany({ business: businessId }),
  ]);
  await User.deleteOne({ _id: user._id });
  await Business.deleteOne({ _id: businessId });
  clearSessionCookie(req, res);

  res.status(200).json({
    success: true,
    message: "Your account and business workspace data have been deleted.",
  });
};

module.exports = {
  updateProfile,
  changePassword,
  startMfaSetup,
  confirmMfaSetup,
  disableMfa,
  updateBusiness,
  getSettings,
  exportAccountData,
  deleteAccount,
};
