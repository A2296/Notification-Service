const express = require("express");

const router = express.Router();

const validate = require("../middleware/validate");
const authMiddleware = require("../middleware/authMiddleware");
const { authLimiter } = require("../middleware/rateLimiters");
const {
  registerBody,
  loginBody,
  passwordResetRequestBody,
  passwordResetConfirmBody,
  mfaLoginBody,
} = require("../validators/schemas");
const {
  registerBusiness,
  loginUser,
  requestPasswordReset,
  confirmPasswordReset,
  loginWithMfa,
  getMe,
  logoutUser,
} = require("../controllers/authController");

router.post("/register", authLimiter, validate({ body: registerBody }), registerBusiness);

router.post("/login", authLimiter, validate({ body: loginBody }), loginUser);

router.post(
  "/password-reset/request",
  authLimiter,
  validate({ body: passwordResetRequestBody }),
  requestPasswordReset
);

router.post(
  "/password-reset/confirm",
  authLimiter,
  validate({ body: passwordResetConfirmBody }),
  confirmPasswordReset
);

router.post("/login/mfa", authLimiter, validate({ body: mfaLoginBody }), loginWithMfa);

router.get("/me", authMiddleware, getMe);

router.post("/logout", authMiddleware, logoutUser);

module.exports = router;
