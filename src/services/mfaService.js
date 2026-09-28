const crypto = require("node:crypto");
const QRCode = require("qrcode");
const User = require("../models/userSchema");
const HttpError = require("../utils/httpError");
const config = require("../config");
const totp = require("../utils/totp");
const { seal, open } = require("../utils/secretBox");

const RECOVERY_CODE_COUNT = 10;

// Recovery codes look like "3f9a1-c07b2"; spaces, dashes and case are ignored when entered
const normalizeRecoveryCode = (code) => code.replace(/[\s-]/g, "").toLowerCase();
const hashRecoveryCode = (code) =>
  crypto.createHash("sha256").update(normalizeRecoveryCode(code)).digest("hex");

const newRecoveryCodes = () =>
  Array.from({ length: RECOVERY_CODE_COUNT }, () => {
    const raw = crypto.randomBytes(5).toString("hex");
    return `${raw.slice(0, 5)}-${raw.slice(5)}`;
  });

// Step 1 of enabling 2FA: a new secret, shown as a QR code and as text
const startSetup = async (user) => {
  if (user.mfa?.enabled) {
    throw new HttpError(409, "Two-factor authentication is already on");
  }

  const secret = totp.generateSecret();
  user.mfa.pendingSecret = seal(secret);
  await user.save();

  const url = totp.otpauthUrl({ secret, account: user.email, issuer: config.mfa.issuer });
  const svg = await QRCode.toString(url, { type: "svg", margin: 1 });

  return {
    secret,
    otpauthUrl: url,
    qrCode: `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`,
  };
};

// Step 2: the first code proves the app is set up. Returns the recovery codes (shown once).
const confirmSetup = async (user, code) => {
  if (!user.mfa?.pendingSecret) {
    throw new HttpError(400, "Start two-factor setup first");
  }

  const step = totp.verifyCode(open(user.mfa.pendingSecret), String(code).trim());
  if (step === null) {
    throw new HttpError(400, "That code is not valid. Check the time on your phone and try again.");
  }

  const recoveryCodes = newRecoveryCodes();

  user.mfa.enabled = true;
  user.mfa.secret = user.mfa.pendingSecret;
  user.mfa.pendingSecret = null;
  user.mfa.lastUsedStep = step;
  user.mfa.recoveryCodes = recoveryCodes.map(hashRecoveryCode);
  user.mfa.enabledAt = new Date();
  user.mfa.failedAttempts = 0;
  user.mfa.lockedUntil = null;
  await user.save();

  return recoveryCodes;
};

// Checks an authenticator code or a recovery code. Both work only once: the time step or
// recovery code is consumed with an atomic update, so two requests cannot use the same code.
// Returns "totp", "recovery" or null.
const consumeCode = async (user, code) => {
  const input = String(code).trim();

  if (/^\d{6}$/.test(input)) {
    const step = totp.verifyCode(open(user.mfa.secret), input, { afterStep: user.mfa.lastUsedStep });
    if (step === null) {
      return null;
    }

    const { modifiedCount } = await User.updateOne(
      { _id: user._id, "mfa.lastUsedStep": { $lt: step } },
      { $set: { "mfa.lastUsedStep": step } }
    );
    return modifiedCount === 1 ? "totp" : null;
  }

  const hash = hashRecoveryCode(input);
  const { modifiedCount } = await User.updateOne(
    { _id: user._id, "mfa.recoveryCodes": hash },
    { $pull: { "mfa.recoveryCodes": hash } }
  );
  return modifiedCount === 1 ? "recovery" : null;
};

// Sign-in with a code, with a temporary lock after repeated wrong codes
const verifyLoginCode = async (user, code) => {
  if (user.mfa.lockedUntil && user.mfa.lockedUntil > new Date()) {
    throw new HttpError(429, "Too many wrong codes. Try again in a few minutes.");
  }

  const method = await consumeCode(user, code);

  if (method) {
    await User.updateOne({ _id: user._id }, { $set: { "mfa.failedAttempts": 0, "mfa.lockedUntil": null } });
    return method;
  }

  const { maxFailedAttempts, lockMinutes } = config.mfa;
  const updated = await User.findOneAndUpdate(
    { _id: user._id },
    { $inc: { "mfa.failedAttempts": 1 } },
    { returnDocument: "after" }
  );

  if (updated.mfa.failedAttempts >= maxFailedAttempts) {
    await User.updateOne(
      { _id: user._id },
      { $set: { "mfa.failedAttempts": 0, "mfa.lockedUntil": new Date(Date.now() + lockMinutes * 60 * 1000) } }
    );
  }

  return null;
};

const disable = async (user) => {
  user.mfa = {
    enabled: false,
    secret: null,
    pendingSecret: null,
    lastUsedStep: -1,
    recoveryCodes: [],
    enabledAt: null,
    failedAttempts: 0,
    lockedUntil: null,
  };
  await user.save();
};

module.exports = {
  startSetup,
  confirmSetup,
  consumeCode,
  verifyLoginCode,
  disable,
};
