const rateLimit = require("express-rate-limit");
const config = require("../config");

const tooManyRequests = {
  success: false,
  message: "Too many requests, please try again later.",
};

// Per IP on all of /api: runs before authentication, so floods of
// requests with invalid credentials cannot hammer the database
const ipLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: config.rateLimit.ipMaxPerMinute,
  message: tooManyRequests,
});

// Per IP: protects login/register from brute force
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: config.rateLimit.authMax,
  message: tooManyRequests,
});

// Per business: one noisy tenant cannot starve the others.
// Must run after businessAuth so req.business is set.
const businessLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: config.rateLimit.apiMaxPerMinute,
  keyGenerator: (req) => `business:${req.business._id}`,
  message: tooManyRequests,
});

module.exports = {
  ipLimiter,
  authLimiter,
  businessLimiter,
};
