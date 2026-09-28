const Schedule = require("../models/scheduleSchema");
const HttpError = require("../utils/httpError");
const config = require("../config");
const scheduleService = require("../services/scheduleService");
const { scheduleBody } = require("../validators/schemas");
const { sendValidationErrors } = require("../middleware/validate");

const createSchedule = async (req, res) => {
  const { maxPerBusiness } = config.schedules;

  if ((await Schedule.countDocuments({ business: req.business._id })) >= maxPerBusiness) {
    throw new HttpError(409, `A business can have at most ${maxPerBusiness} schedules. Delete one first.`);
  }

  const fields = req.validated.body;
  const schedule = await Schedule.create({
    ...fields,
    business: req.business._id,
    nextRunAt: scheduleService.nextRunFor(fields),
  });

  res.status(201).json({
    success: true,
    message: "Schedule created",
    schedule,
  });
};

const listSchedules = async (req, res) => {
  const schedules = await Schedule.find({ business: req.business._id }).sort({ createdAt: -1 });

  res.status(200).json({
    success: true,
    schedules,
  });
};

const findSchedule = async (req) => {
  const schedule = await Schedule.findOne({ _id: req.validated.params.id, business: req.business._id });

  if (!schedule) {
    throw new HttpError(404, "Schedule not found");
  }

  return schedule;
};

const getSchedule = async (req, res) => {
  res.status(200).json({
    success: true,
    schedule: await findSchedule(req),
  });
};

// Any subset of fields, e.g. { "status": "PAUSED" } or { "repeat": { "time": "10:30" } }.
// The result is validated as a whole, and the next run is recalculated.
const updateSchedule = async (req, res) => {
  const schedule = await findSchedule(req);
  const current = schedule.toObject();
  const changes = req.validated.body;

  const result = scheduleBody.safeParse({
    name: current.name,
    channel: current.channel,
    subject: current.subject,
    message: current.message,
    metadata: current.metadata,
    recipients: current.recipients,
    status: current.status,
    ...changes,
    repeat: { ...current.repeat, ...changes.repeat },
  });

  if (!result.success) {
    return sendValidationErrors(res, result.error);
  }

  schedule.set({ ...result.data, nextRunAt: scheduleService.nextRunFor(result.data) });
  await schedule.save();

  res.status(200).json({
    success: true,
    message: "Schedule updated",
    schedule,
  });
};

const deleteSchedule = async (req, res) => {
  const schedule = await findSchedule(req);
  await schedule.deleteOne();

  res.status(200).json({
    success: true,
    message: "Schedule deleted",
  });
};

const runScheduleNow = async (req, res) => {
  const schedule = await findSchedule(req);
  const { accepted, failed } = await scheduleService.runNow(schedule);

  res.status(accepted > 0 ? 202 : 422).json({
    success: accepted > 0,
    message: `${accepted} notifications accepted${failed ? `, ${failed} could not be created` : ""}`,
    accepted,
    failed,
    schedule,
  });
};

module.exports = {
  createSchedule,
  listSchedules,
  getSchedule,
  updateSchedule,
  deleteSchedule,
  runScheduleNow,
};
