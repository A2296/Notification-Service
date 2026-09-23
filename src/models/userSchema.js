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
  },
  {
    timestamps: true,
  }
);

const User = mongoose.model("User", userSchema);

module.exports = User;
