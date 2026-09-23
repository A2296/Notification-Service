const DeliveryError = require("./deliveryError");

// Sends SMS through Twilio's REST API (no SDK needed).
// When PUBLIC_BASE_URL is set, Twilio reports delivery back to
// POST /api/v1/webhooks/twilio/status, which marks the notification DELIVERED.
const createTwilioProvider = (smsConfig, publicBaseUrl) => {
  const { accountSid, authToken, from, messagingServiceSid } = smsConfig.twilio;

  if (!accountSid || !authToken || (!from && !messagingServiceSid)) {
    throw new Error(
      "SMS_PROVIDER=twilio requires TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN and TWILIO_FROM_NUMBER or TWILIO_MESSAGING_SERVICE_SID"
    );
  }

  const url = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`;
  const authorization = `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString("base64")}`;

  return {
    name: "twilio",

    send: async (notification) => {
      const form = new URLSearchParams({
        To: notification.to,
        Body: notification.message,
      });

      if (messagingServiceSid) {
        form.set("MessagingServiceSid", messagingServiceSid);
      } else {
        form.set("From", from);
      }

      if (publicBaseUrl) {
        form.set("StatusCallback", `${publicBaseUrl}/api/v1/webhooks/twilio/status`);
      }

      let response;
      try {
        response = await fetch(url, {
          method: "POST",
          headers: {
            Authorization: authorization,
            "Content-Type": "application/x-www-form-urlencoded",
          },
          body: form,
          signal: AbortSignal.timeout(10000),
        });
      } catch (error) {
        throw new DeliveryError(`Twilio request failed: ${error.message}`);
      }

      const body = await response.json().catch(() => ({}));

      if (!response.ok) {
        // 4xx = bad request (invalid number, unverified number on trial) - retrying won't help
        // 429 is the exception: rate limited, so retry later
        const permanent = response.status >= 400 && response.status < 500 && response.status !== 429;
        throw new DeliveryError(body.message || `Twilio responded ${response.status}`, { permanent });
      }

      return {
        status: "SENT",
        providerMessageId: body.sid,
      };
    },
  };
};

module.exports = createTwilioProvider;
