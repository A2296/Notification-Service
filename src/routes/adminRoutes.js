const express = require("express");

const router = express.Router();

const authMiddleware = require("../middleware/authMiddleware");
const roleMiddleware = require("../middleware/roleMiddleware");

const {
  getAllNotifications,
} = require("../controllers/notificationController");

router.get(
  "/notifications",
  authMiddleware,
  roleMiddleware(["ADMIN"]),
  getAllNotifications
);

module.exports = router;