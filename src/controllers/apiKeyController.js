const ApiKey = require("../models/apiKeySchema");
const HttpError = require("../utils/httpError");
const audit = require("../utils/audit");
const config = require("../config");
const { generateApiKey } = require("../utils/apiKeys");

const createApiKey = async (req, res) => {
  const { maxActivePerBusiness } = config.apiKeys;
  const activeKeys = await ApiKey.countDocuments({
    business: req.business._id,
    revokedAt: null,
  });

  if (activeKeys >= maxActivePerBusiness) {
    throw new HttpError(
      409,
      `A business can have at most ${maxActivePerBusiness} active API keys. Revoke an unused key first.`
    );
  }

  const { keyId, secret, secretHash, secretLast4 } = generateApiKey();

  const apiKey = await ApiKey.create({
    business: req.business._id,
    name: req.validated.body.name,
    keyId,
    secretHash,
    secretLast4,
  });

  audit("apiKey.create", req, {
    userId: req.user.id,
    businessId: req.business._id,
    apiKeyId: apiKey._id,
    keyId,
  });

  res.status(201).json({
    success: true,
    message: "Store the secret now. It will not be shown again.",
    apiKey: {
      id: apiKey._id,
      name: apiKey.name,
      apiKey: keyId,
      apiSecret: secret,
      secretLast4,
      createdAt: apiKey.createdAt,
    },
  });
};

const listApiKeys = async (req, res) => {
  const apiKeys = await ApiKey.find({ business: req.business._id }).sort({
    createdAt: -1,
  });

  res.status(200).json({
    success: true,
    apiKeys,
  });
};

const revokeApiKey = async (req, res) => {
  const apiKey = await ApiKey.findOneAndUpdate(
    { _id: req.validated.params.id, business: req.business._id, revokedAt: null },
    { revokedAt: new Date() },
    { returnDocument: "after" }
  );

  if (!apiKey) {
    throw new HttpError(404, "API key not found");
  }

  audit("apiKey.revoke", req, {
    userId: req.user.id,
    businessId: req.business._id,
    apiKeyId: apiKey._id,
    keyId: apiKey.keyId,
  });

  res.status(200).json({
    success: true,
    message: "API key revoked",
    apiKey,
  });
};

module.exports = {
  createApiKey,
  listApiKeys,
  revokeApiKey,
};
