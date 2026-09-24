const express = require("express");

const router = express.Router();

const validate = require("../middleware/validate");
const authMiddleware = require("../middleware/authMiddleware");
const { createApiKeyBody, idParams } = require("../validators/schemas");
const {
  createApiKey,
  listApiKeys,
  revokeApiKey,
} = require("../controllers/apiKeyController");

// Keys are managed from the dashboard (JWT) only, never with another API key
const requireBusinessUser = (req, res, next) => {
  if (!req.business) {
    return res.status(403).json({
      success: false,
      message: "This endpoint requires a business account",
    });
  }
  next();
};

router.use(authMiddleware, requireBusinessUser);

router.post("/", validate({ body: createApiKeyBody }), createApiKey);

router.get("/", listApiKeys);

router.delete("/:id", validate({ params: idParams }), revokeApiKey);

module.exports = router;
