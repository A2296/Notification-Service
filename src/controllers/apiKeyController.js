const ApiKey = require("../models/apiKeySchema");
const HttpError = require("../utils/httpError");
const { generateApiKey } = require("../utils/apiKeys");

const createApiKey = async (req, res) => {
  const { keyId, secret, secretHash, secretLast4 } = generateApiKey();

  const apiKey = await ApiKey.create({
    business: req.business._id,
    name: req.validated.body.name,
    keyId,
    secretHash,
    secretLast4,
  });

  res.status(201).json({
    success: true,
    message: "Store the secret now. It will not be shown again.",
    apiKey: {
      id: apiKey._id,
      name: apiKey.name,
      apiKey: keyId,
      apiSecret: secret,
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
