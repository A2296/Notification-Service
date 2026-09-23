const mongoose = require("mongoose");

const CHANNELS = ["EMAIL", "SMS", "IN_APP"];
const STATUSES = ["PENDING", "PROCESSING", "SENT", "DELIVERED", "FAILED"];

const eventSchema = new mongoose.Schema(
  {
    status: {
      type: String,
      enum: STATUSES,
      required: true,
    },
    at: {
      type: Date,
      default: Date.now,
    },
    detail: {
      type: String,
    },
  },
  { _id: false }
);

const notificationSchema = new mongoose.Schema(
  {
    business: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Business",
      required: true,
    },

    recipient: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Recipient",
      default: null,
    },

    // The business's own ID for the recipient (needed for IN_APP inboxes)
    recipientExternalId: {
      type: String,
      default: null,
    },

    // Resolved delivery address: email for EMAIL, phone for SMS, externalId for IN_APP
    to: {
      type: String,
      required: true,
      trim: true,
    },

    channel: {
      type: String,
      enum: CHANNELS,
      required: true,
    },

    subject: {
      type: String,
      trim: true,
    },

    message: {
      type: String,
      required: true,
      trim: true,
    },

    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },

    status: {
      type: String,
      enum: STATUSES,
      default: "PENDING",
    },

    events: {
      type: [eventSchema],
      default: [],
    },

    idempotencyKey: {
      type: String,
      default: undefined,
    },

    scheduledAt: {
      type: Date,
      default: null,
    },

    // Delivery worker bookkeeping
    attempts: {
      type: Number,
      default: 0,
    },

    maxAttempts: {
      type: Number,
      default: 3,
    },

    nextAttemptAt: {
      type: Date,
      default: Date.now,
    },

    lockedAt: {
      type: Date,
      default: null,
    },

    provider: {
      type: String,
      default: null,
    },

    providerMessageId: {
      type: String,
      default: null,
    },

    sentAt: {
      type: Date,
      default: null,
    },

    deliveredAt: {
      type: Date,
      default: null,
    },

    failedAt: {
      type: Date,
      default: null,
    },

    readAt: {
      type: Date,
      default: null,
    },

    failureReason: {
      type: String,
      default: null,
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
        delete ret.lockedAt;
        delete ret.nextAttemptAt;
        return ret;
      },
    },
  }
);

notificationSchema.index({ business: 1, createdAt: -1 });
notificationSchema.index({ business: 1, recipientExternalId: 1, channel: 1, createdAt: -1 });
notificationSchema.index({ status: 1, nextAttemptAt: 1 });
notificationSchema.index({ providerMessageId: 1 }, { sparse: true });
notificationSchema.index(
  { business: 1, idempotencyKey: 1 },
  {
    unique: true,
    partialFilterExpression: { idempotencyKey: { $type: "string" } },
  }
);

notificationSchema.methods.addEvent = function (status, detail) {
  this.status = status;
  this.events.push({ status, at: new Date(), detail });
};

const Notification = mongoose.model("Notification", notificationSchema);

module.exports = Notification;
module.exports.CHANNELS = CHANNELS;
module.exports.STATUSES = STATUSES;
