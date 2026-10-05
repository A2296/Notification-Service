const bcrypt = require("bcryptjs");
const crypto = require("node:crypto");
const jwt = require("jsonwebtoken");
const mongoose = require("mongoose");
const User = require("../models/userSchema");
const Business = require("../models/businessSchema");
const HttpError = require("../utils/httpError");
const config = require("../config");
const audit = require("../utils/audit");
const mfaService = require("../services/mfaService");
const passwordResetEmail = require("../services/passwordResetEmail");
const { setSessionCookie, clearSessionCookie } = require("../utils/session");

const signToken = (user) =>
  jwt.sign({ id: user._id, role: user.role, tv: user.tokenVersion }, process.env.JWT_SECRET, {
    algorithm: config.jwt.algorithm,
    expiresIn: config.jwt.expiresIn,
    issuer: config.jwt.issuer,
    audience: config.jwt.audience,
  });

// Proves the password step passed; only accepted by POST /auth/login/mfa, never as a session
const signMfaToken = (user) =>
  jwt.sign({ id: user._id, tv: user.tokenVersion }, process.env.JWT_SECRET, {
    algorithm: config.jwt.algorithm,
    expiresIn: config.jwt.mfaExpiresIn,
    issuer: config.jwt.issuer,
    audience: config.jwt.mfaAudience,
  });

// Issues a token as an HttpOnly cookie (dashboard) and returns it (API clients)
const startSession = (req, res, user) => {
  const token = signToken(user);
  setSessionCookie(req, res, token, new Date(jwt.decode(token).exp * 1000));
  return token;
};

const userResponse = (user, business) => ({
  id: user._id,
  name: user.name,
  email: user.email,
  role: user.role,
  business: business || null,
  mfaEnabled: Boolean(user.mfa?.enabled),
  recoveryCodesLeft: user.mfa?.enabled ? user.mfa.recoveryCodes.length : 0,
  lastLoginAt: user.lastLoginAt || null,
  createdAt: user.createdAt,
});

const completeLogin = async (req, res, user) => {
  user.lastLoginAt = new Date();
  await User.updateOne({ _id: user._id }, { lastLoginAt: user.lastLoginAt });

  res.status(200).json({
    success: true,
    message: "Login successful",
    token: startSession(req, res, user),
    user: userResponse(user, user.business),
  });
};

// Onboard a new business together with its first dashboard user
const registerBusiness = async (req, res) => {
  const { businessName, name, email, password } = req.validated.body;

  if (await User.exists({ email })) {
    throw new HttpError(409, "An account with this email already exists");
  }

  const business = await Business.create({ name: businessName, email });

  let user;
  try {
    user = await User.create({
      name,
      email,
      password: await bcrypt.hash(password, 10),
      business: business._id,
      lastLoginAt: new Date(),
    });
  } catch (error) {
    // No multi-document transactions on a standalone MongoDB, so clean up manually
    await Business.deleteOne({ _id: business._id });
    if (error.code === 11000) {
      throw new HttpError(409, "An account with this email already exists");
    }
    throw error;
  }

  audit("auth.register", req, { userId: user._id, businessId: business._id });

  res.status(201).json({
    success: true,
    message: "Business registered successfully. Create an API key to start sending notifications.",
    token: startSession(req, res, user),
    user: userResponse(user, business),
  });
};

const loginUser = async (req, res) => {
  const { email, password } = req.validated.body;

  const user = await User.findOne({ email }).populate("business");

  if (!user || !(await bcrypt.compare(password, user.password))) {
    audit("auth.login.failure", req, { email });
    throw new HttpError(401, "Invalid email or password");
  }

  if (user.business && user.business.status !== "ACTIVE") {
    audit("auth.login.blocked", req, { userId: user._id, reason: "business suspended" });
    throw new HttpError(403, "Business account is suspended");
  }

  // Two-factor: no session yet, just proof that the password was right
  if (user.mfa?.enabled) {
    audit("auth.login.mfa_required", req, { userId: user._id });

    return res.status(200).json({
      success: true,
      message: "Enter the code from your authenticator app",
      mfaRequired: true,
      mfaToken: signMfaToken(user),
    });
  }

  audit("auth.login.success", req, { userId: user._id });
  await completeLogin(req, res, user);
};

const requestPasswordReset = async (req, res) => {
  if (
    config.email.provider !== "smtp" ||
    !config.email.smtp.host ||
    !config.publicBaseUrl ||
    !/^https?:\/\//i.test(config.publicBaseUrl)
  ) {
    throw new HttpError(503, "Password reset email is not configured. Contact support.");
  }

  const { email } = req.validated.body;
  const user = await User.findOne({ email });

  if (user) {
    const token = crypto.randomBytes(32).toString("hex");
    const tokenHash = crypto.createHash("sha256").update(token).digest("hex");

    await User.updateOne(
      { _id: user._id },
      {
        passwordResetTokenHash: tokenHash,
        passwordResetExpiresAt: new Date(Date.now() + 30 * 60 * 1000),
      }
    );

    try {
      await passwordResetEmail({
        email: user.email,
        token,
        baseUrl: config.publicBaseUrl,
        emailConfig: config.email,
      });
    } catch (error) {
      await User.updateOne(
        { _id: user._id, passwordResetTokenHash: tokenHash },
        { $unset: { passwordResetTokenHash: 1, passwordResetExpiresAt: 1 } }
      );
      console.error(
        JSON.stringify({
          type: "error",
          event: "auth.password_reset.email_failed",
          code: error.code || "SMTP_ERROR",
        })
      );
    }
  }

  res.status(202).json({
    success: true,
    message: "If an account exists for that email, password reset instructions will be sent.",
  });
};

const confirmPasswordReset = async (req, res) => {
  const { email, token, newPassword } = req.validated.body;
  const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
  const user = await User.findOne({
    email,
    passwordResetTokenHash: tokenHash,
    passwordResetExpiresAt: { $gt: new Date() },
  }).select("+passwordResetTokenHash +passwordResetExpiresAt");

  if (!user) {
    throw new HttpError(400, "This password reset link is invalid or has expired.");
  }

  user.password = await bcrypt.hash(newPassword, 10);
  user.tokenVersion += 1;
  user.passwordResetTokenHash = null;
  user.passwordResetExpiresAt = null;
  await user.save();

  clearSessionCookie(req, res);
  audit("auth.password_reset.complete", req, { userId: user._id });

  res.status(200).json({
    success: true,
    message: "Password reset. Sign in with your new password.",
  });
};

// Second step of sign-in when two-factor authentication is on
const loginWithMfa = async (req, res) => {
  const { mfaToken, code } = req.validated.body;
  const expired = new HttpError(401, "Your sign-in expired. Enter your email and password again.");

  let decoded;
  try {
    decoded = jwt.verify(mfaToken, process.env.JWT_SECRET, {
      algorithms: [config.jwt.algorithm],
      issuer: config.jwt.issuer,
      audience: config.jwt.mfaAudience,
    });
  } catch {
    throw expired;
  }

  const user = mongoose.isValidObjectId(decoded.id)
    ? await User.findById(decoded.id).populate("business")
    : null;

  if (!user || !user.mfa?.enabled || decoded.tv !== user.tokenVersion) {
    throw expired;
  }

  if (user.business && user.business.status !== "ACTIVE") {
    throw new HttpError(403, "Business account is suspended");
  }

  const method = await mfaService.verifyLoginCode(user, code);

  if (!method) {
    audit("auth.login.mfa_failure", req, { userId: user._id });
    throw new HttpError(401, "That code is not valid");
  }

  audit("auth.login.success", req, { userId: user._id, mfa: method });

  // Reload so the response shows the recovery codes left after this sign-in
  const fresh = await User.findById(user._id).populate("business");
  await completeLogin(req, res, fresh);
};

const getMe = async (req, res) => {
  const user = await User.findById(req.user.id);

  res.status(200).json({
    success: true,
    user: userResponse(user, req.business),
  });
};

// Ends every session of the user: all previously issued tokens stop working at once
const logoutUser = async (req, res) => {
  await User.updateOne({ _id: req.user.id }, { $inc: { tokenVersion: 1 } });
  clearSessionCookie(req, res);
  audit("auth.logout", req, { userId: req.user.id });

  res.status(200).json({
    success: true,
    message: "Logged out",
  });
};

module.exports = {
  registerBusiness,
  loginUser,
  requestPasswordReset,
  confirmPasswordReset,
  loginWithMfa,
  getMe,
  logoutUser,
  startSession,
  userResponse,
};
