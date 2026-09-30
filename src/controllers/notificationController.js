const notificationService = require("../services/notificationService");
const usageService = require("../services/usageService");
const { z } = require("zod");

const idempotencyKeySchema = z.string().trim().min(1).max(255);

// Returns { idempotencyKey } (possibly undefined), or null after sending a 400
const readIdempotencyKey = (req, res) => {
  const header = req.get("idempotency-key");
  const idempotencyKey =
    header === undefined ? undefined : idempotencyKeySchema.safeParse(header).data;

  if (header !== undefined && !idempotencyKey) {
    res.status(400).json({
      success: false,
      message: "Idempotency-Key must be 1-255 characters",
    });
    return null;
  }

  return { idempotencyKey };
};

const createNotification = async (req, res) => {
  const header = readIdempotencyKey(req, res);
  if (!header) {
    return;
  }
  const { idempotencyKey } = header;

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

// Up to 100 notifications in one request. Items that cannot be created (for example a
// stored recipient with no address for the channel) are reported without failing the rest.
const createBulkNotifications = async (req, res) => {
  const header = readIdempotencyKey(req, res);
  if (!header) {
    return;
  }

  const results = await notificationService.createNotifications({
    businessId: req.business._id,
    inputs: req.validated.body.notifications,
    idempotencyKey: header.idempotencyKey,
  });

  const accepted = results.filter((result) => result.notification).length;
  const failed = results.length - accepted;

  res.status(accepted > 0 ? 202 : 422).json({
    success: accepted > 0,
    message:
      failed === 0
        ? `${accepted} notifications accepted for delivery`
        : `${accepted} accepted, ${failed} could not be created`,
    accepted,
    failed,
    results,
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

// This month's usage against the business's plan limit
const getUsage = async (req, res) => {
  const usage = await usageService.getUsage(req.business._id);

  res.status(200).json({
    success: true,
    usage,
  });
};

module.exports = {
  createNotification,
  createBulkNotifications,
  listNotifications,
  getNotificationById,
  markAsRead,
  retryNotification,
  getStats,
  getUsage,
};
