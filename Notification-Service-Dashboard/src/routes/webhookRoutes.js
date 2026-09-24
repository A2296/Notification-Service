const express = require("express");

const router = express.Router();

const { twilioStatusCallback } = require("../controllers/webhookController");

// Twilio posts form-encoded bodies
router.post(
  "/twilio/status",
  express.urlencoded({ extended: false }),
  twilioStatusCallback
);

module.exports = router;
