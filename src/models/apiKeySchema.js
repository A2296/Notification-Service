const mongoose = require("mongoose");

// Credentials a business uses for server-to-server calls.
// Only a SHA-256 hash of the secret is stored; the secret is shown once at creation.
const apiKeySchema = new mongoose.Schema(
  {
    business: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Business",
      required: true,
      index: true,
    },

    name: {
      type: String,
      required: true,
      trim: true,
    },

    keyId: {
      type: String,
      required: true,
      unique: true,
    },

    secretHash: {
      type: String,
      required: true,
    },

    secretLast4: {
      type: String,
      required: true,
    },

    lastUsedAt: {
      type: Date,
      default: null,
    },

    revokedAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
    toJSON: {
      transform: (doc, ret) => {
        ret.id = ret._id;
        delete ret._id;
        delete ret.__v;
        delete ret.secretHash;
        return ret;
      },
    },
  }
);

const ApiKey = mongoose.model("ApiKey", apiKeySchema);

module.exports = ApiKey;
