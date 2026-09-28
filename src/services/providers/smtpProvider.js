const nodemailer = require("nodemailer");
const DeliveryError = require("./deliveryError");

// Works with any SMTP server: Gmail, SendGrid, Mailgun, Brevo, Mailpit (local), etc.
const createSmtpProvider = (emailConfig) => {
  const { host, port, secure, user, pass, timeoutMs = 10000 } = emailConfig.smtp;

  if (!host) {
    throw new Error("EMAIL_PROVIDER=smtp requires SMTP_HOST");
  }

  const transporter = nodemailer.createTransport({
    host,
    port,
    secure,
    auth: user ? { user, pass } : undefined,
    // The worker sends one notification at a time, so an unresponsive mail server
    // must fail fast (and be retried later) instead of stalling the whole queue.
    // Nodemailer's defaults are 2 minutes to connect and 10 minutes per socket.
    connectionTimeout: timeoutMs,
    greetingTimeout: timeoutMs,
    socketTimeout: timeoutMs * 2,
  });

  return {
    name: "smtp",

    send: async (notification, business) => {
      try {
        const info = await transporter.sendMail({
          // Show the business's name so end users recognise the sender
          from: { name: business ? business.name : "Notification Service", address: emailConfig.from },
          to: notification.to,
          subject: notification.subject,
          text: notification.message,
        });

        // SMTP only confirms the server accepted the message, not inbox delivery
        return {
          status: "SENT",
          providerMessageId: info.messageId,
        };
      } catch (error) {
        // 5xx SMTP responses (e.g. mailbox does not exist) will not succeed on retry
        const permanent = error.responseCode >= 500 && error.responseCode < 600;
        throw new DeliveryError(error.message, { permanent });
      }
    },
  };
};

module.exports = createSmtpProvider;
