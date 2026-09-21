const notificationService = require("../services/notificationService");

const createNotification = async (req, res, next) => {
  try {
    const { recipient, channel, subject, message } = req.body;

    if (!recipient || !channel || !message) {
      return res.status(400).json({
        success: false,
        message: "Recipient, channel and message are required",
      });
    }

    const normalizedChannel = channel.toUpperCase();

    const allowedChannels = ["EMAIL", "SMS", "IN_APP"];

    if (!allowedChannels.includes(normalizedChannel)) {
      return res.status(400).json({
        success: false,
        message: "Channel must be EMAIL, SMS, or IN_APP",
      });
    }

    const notification = await notificationService.createNotification({
      userId: req.user.id,
      recipient,
      channel: normalizedChannel,
      subject,
      message,
    });

    res.status(201).json({
      success: true,
      message: "Notification created successfully",
      notification,
    });
  } catch (error) {
    next(error);
  }
};

const getUserNotifications = async (req, res, next) => {
  try {
    const {
      search,
      channel,
      status,
      page,
      limit,
    } = req.query;

    const allowedStatuses = ["PENDING", "SENT", "FAILED"];

    if (status && !allowedStatuses.includes(status.toUpperCase())) {
      return res.status(400).json({
        success: false,
        message: "Status must be PENDING, SENT, or FAILED",
      });
    }

    if (page && (Number.isNaN(Number(page)) || Number(page) < 1)) {
      return res.status(400).json({
        success: false,
        message: "Page must be a positive number",
      });
    }

    if (limit && (Number.isNaN(Number(limit)) || Number(limit) < 1)) {
      return res.status(400).json({
        success: false,
        message: "Limit must be a positive number",
      });
    }

    const result = await notificationService.getUserNotifications(
      req.user.id,
      search,
      channel,
      status,
      page,
      limit,
    );

    res.status(200).json({
      success: true,
      ...result,
    });
  } catch (error) {
    next(error);
  }
};

const getNotificationById = async (req, res, next) => {
  try {
    const notification = await notificationService.getNotificationById(
      req.params.id,
      req.user.id,
    );

    if (!notification) {
      return res.status(404).json({
        success: false,
        message: "Notification not found",
      });
    }

    res.status(200).json({
      success: true,
      notification,
    });
  } catch (error) {
    next(error);
  }
};

const getAllNotifications = async (req, res, next) => {
  try {
    const notifications = await notificationService.getAllNotifications();

    res.status(200).json({
      success: true,
      notifications,
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  createNotification,
  getUserNotifications,
  getNotificationById,
  getAllNotifications,
};