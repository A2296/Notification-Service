const express = require("express");

const router = express.Router();

const businessAuth = require("../middleware/businessAuth");
const { businessLimiter } = require("../middleware/rateLimiters");

// Public + dashboard
router.use("/auth", require("./authRoutes"));
router.use("/api-keys", require("./apiKeyRoutes"));

// Integration API: API key (server-to-server) or dashboard JWT, rate limited per business
router.use("/recipients", businessAuth, businessLimiter, require("./recipientRoutes"));
router.use("/notifications", businessAuth, businessLimiter, require("./notificationRoutes"));

// Platform operators
router.use("/admin", require("./adminRoutes"));

// Provider callbacks (authenticated by provider signature)
router.use("/webhooks", require("./webhookRoutes"));

module.exports = router;
