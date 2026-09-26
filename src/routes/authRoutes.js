const express = require("express");

const router = express.Router();

const validate = require("../middleware/validate");
const authMiddleware = require("../middleware/authMiddleware");
const { authLimiter } = require("../middleware/rateLimiters");
const { registerBody, loginBody } = require("../validators/schemas");
const {
  registerBusiness,
  loginUser,
  getMe,
  logoutUser,
} = require("../controllers/authController");

router.post("/register", authLimiter, validate({ body: registerBody }), registerBusiness);

router.post("/login", authLimiter, validate({ body: loginBody }), loginUser);

router.get("/me", authMiddleware, getMe);

router.post("/logout", authMiddleware, logoutUser);

module.exports = router;
