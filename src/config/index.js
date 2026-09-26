// Central place for runtime configuration read from environment variables
const config = {
  port: Number(process.env.PORT) || 5000,
  publicBaseUrl: (process.env.PUBLIC_BASE_URL || "").replace(/\/$/, ""),
  isProduction: process.env.NODE_ENV === "production",

  jwt: {
    expiresIn: process.env.JWT_EXPIRES_IN || "1d",
    // Tokens are only accepted with exactly this algorithm, issuer and audience
    algorithm: "HS256",
    issuer: "notification-service",
    audience: "notification-service-dashboard",
  },

  apiKeys: {
    // Active (non-revoked) keys a business may hold at once
    maxActivePerBusiness: Number(process.env.MAX_ACTIVE_API_KEYS) || 10,
  },

  rateLimit: {
    // per IP per minute on everything under /api (first line of defence)
    ipMaxPerMinute: Number(process.env.IP_RATE_LIMIT_MAX) || 600,
    // per IP on /api/v1/auth (login/register brute-force protection)
    authMax: Number(process.env.AUTH_RATE_LIMIT_MAX) || 20,
    // per business (API key or dashboard user) per minute on the rest of the API
    apiMaxPerMinute: Number(process.env.RATE_LIMIT_MAX) || 300,
  },

  worker: {
    enabled: process.env.WORKER_ENABLED !== "false",
    pollIntervalMs: Number(process.env.WORKER_POLL_INTERVAL_MS) || 1000,
    maxAttempts: Number(process.env.DELIVERY_MAX_ATTEMPTS) || 3,
    lockTimeoutMs: 5 * 60 * 1000,
  },

  email: {
    provider: process.env.EMAIL_PROVIDER || "console",
    from: process.env.EMAIL_FROM || "no-reply@notification-service.local",
    smtp: {
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT) || 587,
      secure: process.env.SMTP_SECURE === "true",
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  },

  sms: {
    provider: process.env.SMS_PROVIDER || "console",
    twilio: {
      accountSid: process.env.TWILIO_ACCOUNT_SID,
      authToken: process.env.TWILIO_AUTH_TOKEN,
      from: process.env.TWILIO_FROM_NUMBER,
      messagingServiceSid: process.env.TWILIO_MESSAGING_SERVICE_SID,
    },
  },
};

module.exports = config;
