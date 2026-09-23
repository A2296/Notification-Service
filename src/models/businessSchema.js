const mongoose = require("mongoose");

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
