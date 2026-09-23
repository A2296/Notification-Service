const apiKeyMiddleware = require("./apiKeyMiddleware");
const authMiddleware = require("./authMiddleware");

// Accepts either API key credentials (integrations) or a dashboard JWT,
// and requires that the caller belongs to a business.
const businessAuth = (req, res, next) => {
  const authenticate = req.get("x-api-key") ? apiKeyMiddleware : authMiddleware;

  return authenticate(req, res, (error) => {
    if (error) {
      return next(error);
    }

    if (!req.business) {
      return res.status(403).json({
        success: false,
        message: "This endpoint requires a business account",
      });
    }

    next();
  });
};

module.exports = businessAuth;
