const Schedule = require("../models/scheduleSchema");
const Business = require("../models/businessSchema");
const notificationService = require("./notificationService");
const usageService = require("./usageService");
const { nextRunAfter } = require("../utils/recurrence");

// A worker that crashed mid-run leaves lockedAt set; the schedule is picked up again after this
const LOCK_TIMEOUT_MS = 5 * 60 * 1000;

// `reason` is the first error, e.g. the monthly limit ran out part-way through the run
const summarize = (results) => {
  const accepted = results.filter((result) => result.notification).length;
  const failure = results.find((result) => result.error);

  return {
    accepted,
    failed: results.length - accepted,
    ...(failure ? { reason: failure.error } : {}),
  };
};

// Creates this run's notifications. Each one is tagged with the schedule in metadata.
const send = async (schedule, idempotencyKey) => {
  const scheduleTag = { scheduleId: String(schedule._id), scheduleName: schedule.name };
  const inputs = schedule.recipients.map((recipient) => ({
    channel: schedule.channel,
    subject: schedule.subject,
    message: schedule.message,
    metadata: { ...schedule.metadata, ...scheduleTag },
    recipient,
  }));

  const results = await notificationService.createNotifications({
    businessId: schedule.business,
    inputs,
    idempotencyKey,
  });

  return summarize(results);
};

const claimDueSchedule = (now) =>
  Schedule.findOneAndUpdate(
    {
      status: "ACTIVE",
      nextRunAt: { $lte: now },
      $or: [{ lockedAt: null }, { lockedAt: { $lte: new Date(now.getTime() - LOCK_TIMEOUT_MS) } }],
    },
    { $set: { lockedAt: now } },
    { sort: { nextRunAt: 1 }, returnDocument: "after" }
  );

const runDueSchedule = async (schedule, now) => {
  const dueAt = schedule.nextRunAt;
  const business = await Business.findById(schedule.business);
  let summary;

  if (business?.status !== "ACTIVE") {
    summary = { accepted: 0, failed: 0, skipped: "Business account is suspended" };
  } else if ((await usageService.getUsage(business._id)).remaining <= 0) {
    summary = { accepted: 0, failed: 0, skipped: "Monthly notification limit reached" };
  } else {
    // Keyed by the due time, so a run repeated after a crash never sends twice
    summary = await send(schedule, `schedule:${schedule._id}:${dueAt.toISOString()}`);
    schedule.runCount += 1;
  }

  schedule.lastRun = { at: now, dueAt, manual: false, ...summary };
  // Counted from now, not from dueAt: after downtime (e.g. a sleeping free-tier server)
  // a schedule runs once, instead of once for every run it missed
  schedule.nextRunAt = nextRunAfter(schedule.repeat, now);
  schedule.lockedAt = null;
  await schedule.save();
};

// Called by the delivery worker. Returns how many schedules ran.
const runDueSchedules = async (now = new Date(), max = 50) => {
  let processed = 0;

  while (processed < max) {
    const schedule = await claimDueSchedule(now);

    if (!schedule) {
      break;
    }

    await runDueSchedule(schedule, now);
    processed += 1;
  }

  return processed;
};

// "Run now" from the API or dashboard; the regular timetable is unchanged
const runNow = async (schedule) => {
  const usage = await usageService.getUsage(schedule.business);
  if (usage.remaining <= 0) {
    throw usageService.limitReachedError(usage);
  }

  const summary = await send(schedule);

  schedule.lastRun = { at: new Date(), dueAt: null, manual: true, ...summary };
  schedule.runCount += 1;
  await schedule.save();

  return summary;
};

// nextRunAt for a schedule that was just created or changed
const nextRunFor = ({ status, repeat }) => (status === "ACTIVE" ? nextRunAfter(repeat) : null);

module.exports = {
  runDueSchedules,
  runNow,
  nextRunFor,
};
