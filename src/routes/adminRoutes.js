const express = require("express");

const router = express.Router();

const validate = require("../middleware/validate");
const authMiddleware = require("../middleware/authMiddleware");
const roleMiddleware = require("../middleware/roleMiddleware");
const {
  listBusinessesQuery,
  updateBusinessBody,
  adminNotificationsQuery,
  idParams,
} = require("../validators/schemas");
const {
  listBusinesses,
  updateBusinessStatus,
  getAllNotifications,
  getPlatformStats,
  getBusinessStats,
} = require("../controllers/adminController");

router.use(authMiddleware, roleMiddleware(["ADMIN"]));

router.get("/businesses", validate({ query: listBusinessesQuery }), listBusinesses);

router.patch(
  "/businesses/:id",
  validate({ params: idParams, body: updateBusinessBody }),
  updateBusinessStatus
);

router.get("/businesses/:id/stats", validate({ params: idParams }), getBusinessStats);

router.get("/notifications", validate({ query: adminNotificationsQuery }), getAllNotifications);

router.get("/stats", getPlatformStats);

module.exports = router;
