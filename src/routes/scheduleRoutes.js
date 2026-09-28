const express = require("express");

const router = express.Router();

const validate = require("../middleware/validate");
const { bulkLimiter } = require("../middleware/rateLimiters");
const { scheduleBody, updateScheduleBody, idParams } = require("../validators/schemas");
const {
  createSchedule,
  listSchedules,
  getSchedule,
  updateSchedule,
  deleteSchedule,
  runScheduleNow,
} = require("../controllers/scheduleController");

// Mounted behind businessAuth (API key or dashboard JWT)

router.post("/", validate({ body: scheduleBody }), createSchedule);

router.get("/", listSchedules);

router.get("/:id", validate({ params: idParams }), getSchedule);

router.patch("/:id", validate({ params: idParams, body: updateScheduleBody }), updateSchedule);

router.delete("/:id", validate({ params: idParams }), deleteSchedule);

// Sends to every recipient right away, so it shares the bulk-send rate limit
router.post("/:id/run", bulkLimiter, validate({ params: idParams }), runScheduleNow);

module.exports = router;
