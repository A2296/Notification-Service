const express = require("express");

const router = express.Router();

const authMiddleware = require("../middleware/authMiddleware");

const {
  createNotification,
  getUserNotifications,
  getNotificationById,
} = require("../controllers/notificationController");

router.post("/", authMiddleware, createNotification);

router.get("/", authMiddleware, getUserNotifications);

router.get("/:id", authMiddleware, getNotificationById);

module.exports = router;
