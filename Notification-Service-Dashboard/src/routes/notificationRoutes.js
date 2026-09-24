const express = require("express");

const router = express.Router();

const validate = require("../middleware/validate");
const {
  createNotificationBody,
  listNotificationsQuery,
  idParams,
} = require("../validators/schemas");
const {
  createNotification,
  listNotifications,
  getNotificationById,
  markAsRead,
  retryNotification,
  getStats,
} = require("../controllers/notificationController");

// Mounted behind businessAuth (API key or dashboard JWT)

router.post("/", validate({ body: createNotificationBody }), createNotification);

router.get("/", validate({ query: listNotificationsQuery }), listNotifications);

router.get("/stats", getStats);

router.get("/:id", validate({ params: idParams }), getNotificationById);

router.patch("/:id/read", validate({ params: idParams }), markAsRead);

router.post("/:id/retry", validate({ params: idParams }), retryNotification);

module.exports = router;
