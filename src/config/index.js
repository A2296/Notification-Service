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
    // Short-lived token between the password and the 2FA code; never accepted as a session
    mfaAudience: "notification-service-mfa",
    mfaExpiresIn: "5m",
  },

  mfa: {
    // Shown in authenticator apps next to the account
    issuer: process.env.MFA_ISSUER || "NotifyFlow",
    maxFailedAttempts: 5,
    lockMinutes: 15,
  },

  // Where businesses get help; both optional and shown publicly on the dashboard's Help page
  support: {
    email: process.env.SUPPORT_EMAIL || null,
    url: process.env.SUPPORT_URL || null,
  },

  // Subscription plans: notifications a business may create per calendar month (UTC).
  // Assigned by a platform admin (there are no payments); every business starts on FREE.
  plans: {
    FREE: {
      name: "Free",
      description: "For trying NotifyFlow and small projects",
      monthlyNotifications: Number(process.env.PLAN_FREE_MONTHLY_LIMIT) || 1000,
    },
    STARTER: {
      name: "Starter",
      description: "For growing products with regular traffic",
      monthlyNotifications: Number(process.env.PLAN_STARTER_MONTHLY_LIMIT) || 10000,
    },
    PRO: {
      name: "Pro",
      description: "For high-volume senders",
      monthlyNotifications: Number(process.env.PLAN_PRO_MONTHLY_LIMIT) || 100000,
    },
  },

  schedules: {
    // Recurring schedules a business may have (each sends to up to 100 recipients per run)
    maxPerBusiness: Number(process.env.MAX_SCHEDULES) || 20,
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
    // per business per minute on POST /notifications/bulk (up to 100 notifications each)
    bulkMaxPerMinute: Number(process.env.BULK_RATE_LIMIT_MAX) || 10,
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
