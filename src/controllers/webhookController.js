const crypto = require("node:crypto");
const Notification = require("../models/notificationSchema");
const config = require("../config");

// Twilio signs each callback: base64(HMAC-SHA1(authToken, url + sorted params))
// https://www.twilio.com/docs/usage/webhooks/webhooks-security
const isValidTwilioSignature = (req) => {
  const signature = req.get("x-twilio-signature");
  const { authToken } = config.sms.twilio;

  if (!signature || !authToken || !config.publicBaseUrl) {
    return false;
  }

  const url = config.publicBaseUrl + req.originalUrl;
  const params = req.body || {};
  // Twilio sorts by raw character code (not locale order), so compare code units
  const byCodeUnit = (a, b) => (a < b ? -1 : Number(a > b));
  const payload = Object.keys(params)
    .sort(byCodeUnit)
    .reduce((acc, key) => acc + key + params[key], url);

  const expected = crypto
    .createHmac("sha1", authToken)
    .update(payload)
    .digest("base64");

  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
};

const twilioStatusCallback = async (req, res) => {
  if (!isValidTwilioSignature(req)) {
    return res.status(403).json({
      success: false,
      message: "Invalid signature",
    });
  }

  const { MessageSid, MessageStatus, ErrorCode } = req.body;

  // Repeated form fields arrive as arrays; only plain strings may reach the query
  if (typeof MessageSid !== "string" || typeof MessageStatus !== "string") {
    return res.status(400).json({
      success: false,
      message: "MessageSid and MessageStatus are required",
    });
  }

  const notification = await Notification.findOne({
    provider: "twilio",
    providerMessageId: { $eq: String(MessageSid) },
  });

  // Always 2xx for unknown messages so Twilio does not keep retrying
  if (!notification) {
    return res.status(204).end();
  }

  if (MessageStatus === "delivered" && notification.status !== "DELIVERED") {
    notification.deliveredAt = new Date();
    notification.addEvent("DELIVERED", "Delivery confirmed by twilio");
    await notification.save();
  }

  if (["failed", "undelivered"].includes(MessageStatus) && notification.status !== "FAILED") {
    notification.failedAt = new Date();
    const errorSuffix = ErrorCode ? ` (error ${ErrorCode})` : "";
    notification.failureReason = `Twilio status ${MessageStatus}${errorSuffix}`;
    notification.addEvent("FAILED", notification.failureReason);
    await notification.save();
  }

  res.status(204).end();
};

module.exports = {
  twilioStatusCallback,
};
