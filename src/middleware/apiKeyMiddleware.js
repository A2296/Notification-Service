const ApiKey = require("../models/apiKeySchema");
const { secretMatches } = require("../utils/apiKeys");

// Server-to-server authentication for businesses:
//   X-API-Key: ns_pk_...
//   X-API-Secret: ns_sk_...
const apiKeyMiddleware = async (req, res, next) => {
  const keyId = req.get("x-api-key");
  const secret = req.get("x-api-secret");

  if (!keyId || !secret) {
    return res.status(401).json({
      success: false,
      message: "X-API-Key and X-API-Secret headers are required",
    });
  }

  const apiKey = await ApiKey.findOne({ keyId, revokedAt: null }).populate(
    "business"
  );

  if (!apiKey || !apiKey.business || !secretMatches(secret, apiKey.secretHash)) {
    return res.status(401).json({
      success: false,
      message: "Invalid API credentials",
    });
  }

  if (apiKey.business.status !== "ACTIVE") {
    return res.status(403).json({
      success: false,
      message: "Business account is suspended",
    });
  }

  req.business = apiKey.business;
  req.apiKey = apiKey;
  req.authMethod = "apiKey";

  // Usage tracking should never block or fail the request
  ApiKey.updateOne({ _id: apiKey._id }, { lastUsedAt: new Date() }).catch(
    () => {}
  );

  next();
};

module.exports = apiKeyMiddleware;
