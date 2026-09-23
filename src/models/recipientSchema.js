const mongoose = require("mongoose");

// An end user of a business. externalId is the business's own ID for that user.
const recipientSchema = new mongoose.Schema(
  {
    business: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Business",
      required: true,
    },

    externalId: {
      type: String,
      required: true,
      trim: true,
    },

    name: {
      type: String,
      trim: true,
    },

    email: {
      type: String,
      lowercase: true,
      trim: true,
    },

    phone: {
      type: String,
      trim: true,
    },

    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
  },
  {
    timestamps: true,
    minimize: false,
    toJSON: {
      transform: (doc, ret) => {
        ret.id = ret._id;
        delete ret._id;
        delete ret.__v;
        delete ret.business;
        return ret;
      },
    },
  }
);

recipientSchema.index({ business: 1, externalId: 1 }, { unique: true });

const Recipient = mongoose.model("Recipient", recipientSchema);

module.exports = Recipient;
