const config = require("../config");

// Public: shown on the dashboard's Help page, including to visitors who cannot sign in.
// Only well-formed values are returned, so a mistyped setting never becomes a link.

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const safeEmail = (value) => (value && EMAIL_PATTERN.test(value) ? value : null);

const safeUrl = (value) => {
  try {
    const url = new URL(value);
    return ["https:", "http:"].includes(url.protocol) ? url.href : null;
  } catch {
    return null;
  }
};

const getSupport = (req, res) => {
  res.status(200).json({
    success: true,
    support: {
      email: safeEmail(config.support.email),
      url: safeUrl(config.support.url),
    },
  });
};

module.exports = {
  getSupport,
};
