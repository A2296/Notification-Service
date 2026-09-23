const notificationService = require("../services/notificationService");
const { z } = require("zod");

const idempotencyKeySchema = z.string().trim().min(1).max(255);

const createNotification = async (req, res) => {
  const header = req.get("idempotency-key");
  const idempotencyKey =
    header === undefined ? undefined : idempotencyKeySchema.safeParse(header).data;

  if (header !== undefined && !idempotencyKey) {
    return res.status(400).json({
      success: false,
      message: "Idempotency-Key must be 1-255 characters",
    });
  }

  const { notification, created } = await notificationService.createNotification({
    businessId: req.business._id,
    input: req.validated.body,
    idempotencyKey,
  });

  // 202: accepted for delivery; poll GET /notifications/:id for the final status
  res.status(created ? 202 : 200).json({
    success: true,
    message: created
      ? "Notification accepted for delivery"
      : "Duplicate request: returning the original notification",
    notification,
  });
};

const listNotifications = async (req, res) => {
  const result = await notificationService.listNotifications(
    { business: req.business._id },
    req.validated.query
  );

  res.status(200).json({
    success: true,
    ...result,
  });
};

const getNotificationById = async (req, res) => {
  const notification = await notificationService.getNotification(
    req.business._id,
    req.validated.params.id
  );

  res.status(200).json({
    success: true,
    notification,
  });
};

const markAsRead = async (req, res) => {
  const notification = await notificationService.markAsRead(
    req.business._id,
    req.validated.params.id
  );

  res.status(200).json({
    success: true,
    notification,
  });
};

const retryNotification = async (req, res) => {
  const notification = await notificationService.retryNotification(
    req.business._id,
    req.validated.params.id
  );

  res.status(202).json({
    success: true,
    message: "Notification queued for retry",
    notification,
  });
};

const getStats = async (req, res) => {
  const stats = await notificationService.getStats({ business: req.business._id });

  res.status(200).json({
    success: true,
    stats,
  });
};

module.exports = {
  createNotification,
  listNotifications,
  getNotificationById,
  markAsRead,
  retryNotification,
  getStats,
};
