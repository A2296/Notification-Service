const mongoose = require("mongoose");
const { CHANNELS } = require("./notificationSchema");
const { FREQUENCIES } = require("../utils/recurrence");

// A recurring notification: the same message to the same recipients on a repeat rule.
// The delivery worker creates the notifications whenever nextRunAt is reached.
const scheduleSchema = new mongoose.Schema(
  {
    business: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Business",
      required: true,
    },

    name: {
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

    // Validated recipient objects ({ id, name, email, phone }), 1-100 of them
    recipients: {
      type: [mongoose.Schema.Types.Mixed],
      default: [],
    },

    repeat: {
      frequency: { type: String, enum: FREQUENCIES, required: true },
      // "HH:MM", 24-hour, wall-clock time in `timezone`
      time: { type: String, required: true },
      // WEEKLY: 0 = Sunday ... 6 = Saturday
      daysOfWeek: { type: [Number], default: undefined },
      // MONTHLY: 1-31 (29-31 run on the last day of shorter months)
      dayOfMonth: { type: Number, default: undefined },
      timezone: { type: String, default: "UTC" },
    },

    status: {
      type: String,
      enum: ["ACTIVE", "PAUSED"],
      default: "ACTIVE",
    },

    // null while paused
    nextRunAt: {
      type: Date,
      default: null,
    },

    // { at, dueAt, manual, accepted, failed, skipped }
    lastRun: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },

    runCount: {
      type: Number,
      default: 0,
    },

    // Worker bookkeeping, so only one worker runs a schedule at a time
    lockedAt: {
      type: Date,
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
        return ret;
      },
    },
  }
);

scheduleSchema.index({ status: 1, nextRunAt: 1 });
scheduleSchema.index({ business: 1, createdAt: -1 });

const Schedule = mongoose.model("Schedule", scheduleSchema);

module.exports = Schedule;
