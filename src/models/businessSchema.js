const mongoose = require("mongoose");
const config = require("../config");

const PLAN_IDS = Object.keys(config.plans);

// A business (tenant) that integrates with the platform to notify its own users
const businessSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },

    email: {
      type: String,
      required: true,
      lowercase: true,
      trim: true,
    },

    status: {
      type: String,
      enum: ["ACTIVE", "SUSPENDED"],
      default: "ACTIVE",
    },

    // Subscription plan (see config.plans); sets the monthly notification limit
    plan: {
      type: String,
      enum: PLAN_IDS,
      default: "FREE",
    },
  },
  {
    timestamps: true,
    toJSON: {
      transform: (doc, ret) => {
        ret.id = ret._id;
        delete ret._id;
        delete ret.__v;
        return ret;
      },
    },
  }
);

const Business = mongoose.model("Business", businessSchema);

module.exports = Business;
module.exports.PLAN_IDS = PLAN_IDS;
