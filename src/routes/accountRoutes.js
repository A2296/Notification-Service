const express = require("express");

const router = express.Router();

const validate = require("../middleware/validate");
const authMiddleware = require("../middleware/authMiddleware");
const { authLimiter } = require("../middleware/rateLimiters");
const {
  updateProfileBody,
  changePasswordBody,
  confirmPasswordBody,
  mfaConfirmBody,
  mfaDisableBody,
  businessSettingsBody,
  deleteAccountBody,
} = require("../validators/schemas");
const {
  updateProfile,
  changePassword,
  startMfaSetup,
  confirmMfaSetup,
  disableMfa,
  updateBusiness,
  getSettings,
  exportAccountData,
  deleteAccount,
} = require("../controllers/accountController");

// The signed-in user's own account (dashboard session or Bearer token, never an API key).
// Anything that checks a password or code is rate limited like login.
router.use(authMiddleware);

router.patch("/", validate({ body: updateProfileBody }), updateProfile);

router.post("/password", authLimiter, validate({ body: changePasswordBody }), changePassword);

router.post("/mfa/setup", authLimiter, validate({ body: confirmPasswordBody }), startMfaSetup);

router.post("/mfa/enable", authLimiter, validate({ body: mfaConfirmBody }), confirmMfaSetup);

router.post("/mfa/disable", authLimiter, validate({ body: mfaDisableBody }), disableMfa);

router.patch("/business", validate({ body: businessSettingsBody }), updateBusiness);

router.get("/settings", getSettings);

router.get("/export", exportAccountData);

router.delete("/", authLimiter, validate({ body: deleteAccountBody }), deleteAccount);

module.exports = router;
