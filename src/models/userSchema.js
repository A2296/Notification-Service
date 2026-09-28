const mongoose = require("mongoose");

// A person who logs in to manage a business account (USER)
// or to operate the whole platform (ADMIN)
const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },

    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },

    password: {
      type: String,
      required: true,
    },

    role: {
      type: String,
      enum: ["USER", "ADMIN"],
      default: "USER",
    },

    business: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Business",
      default: null,
    },

    // Embedded in every token; incrementing it (logout) invalidates all of the user's tokens
    tokenVersion: {
      type: Number,
      default: 0,
    },

    lastLoginAt: {
      type: Date,
      default: null,
    },

    // Two-factor authentication with an authenticator app (TOTP).
    // Secrets are encrypted (utils/secretBox); recovery codes are stored as SHA-256 hashes.
    mfa: {
      enabled: { type: Boolean, default: false },
      secret: { type: String, default: null },
      // Set during setup, until the user confirms a first code
      pendingSecret: { type: String, default: null },
      // Last time step used, so a code cannot be used twice
      lastUsedStep: { type: Number, default: -1 },
      recoveryCodes: { type: [String], default: [] },
      enabledAt: { type: Date, default: null },
      // Brute-force protection for the code step of sign-in
      failedAttempts: { type: Number, default: 0 },
      lockedUntil: { type: Date, default: null },
    },
  },
  {
    timestamps: true,
  }
);

const User = mongoose.model("User", userSchema);

module.exports = User;
