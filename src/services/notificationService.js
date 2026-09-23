const Notification = require("../models/notificationSchema");
const Recipient = require("../models/recipientSchema");
const HttpError = require("../utils/httpError");
const config = require("../config");

const escapeRegex = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, String.raw`\$&`);

const paginate = (page, limit, total) => ({
  currentPage: page,
  itemsPerPage: limit,
  totalItems: total,
  totalPages: Math.ceil(total / limit),
});

// Find the business's recipient by their own ID, creating it on first use
const upsertRecipient = (businessId, externalId, contact) =>
  Recipient.findOneAndUpdate(
    { business: businessId, externalId },
    { $setOnInsert: contact },
    { upsert: true, returnDocument: "after", runValidators: true }
  );

const resolveAddress = (channel, recipientInput, recipientDoc) => {
  if (channel === "IN_APP") {
    return recipientInput.id;
  }

  const field = channel === "EMAIL" ? "email" : "phone";
  const address = recipientInput[field] || recipientDoc?.[field];

  if (!address) {
    throw new HttpError(
      422,
      `Recipient "${recipientInput.id}" has no ${field} on file. Provide recipient.${field} or update the recipient.`
    );
  }

  return address;
};

// Only copy contact fields the caller actually provided
const pickContact = (recipient) =>
  Object.fromEntries(
    ["name", "email", "phone"]
      .filter((field) => recipient[field])
      .map((field) => [field, recipient[field]])
  );

// When the worker should first pick the notification up, and how to describe it
const initialSchedule = (scheduledAt) => {
  const now = new Date();

  if (scheduledAt && scheduledAt > now) {
    return {
      nextAttemptAt: scheduledAt,
      detail: `Scheduled for ${scheduledAt.toISOString()}`,
    };
  }

  return { nextAttemptAt: now, detail: "Queued for delivery" };
};

const findByIdempotencyKey = (businessId, idempotencyKey) =>
  Notification.findOne({ business: businessId, idempotencyKey });

const createNotification = async ({ businessId, input, idempotencyKey }) => {
  if (idempotencyKey) {
    const existing = await findByIdempotencyKey(businessId, idempotencyKey);
    if (existing) {
      return { notification: existing, created: false };
    }
  }

  const { recipient } = input;
  const recipientDoc = recipient.id
    ? await upsertRecipient(businessId, recipient.id, pickContact(recipient))
    : null;

  const to = resolveAddress(input.channel, recipient, recipientDoc);
  const { nextAttemptAt, detail } = initialSchedule(input.scheduledAt);

  try {
    const notification = await Notification.create({
      business: businessId,
      recipient: recipientDoc?._id ?? null,
      recipientExternalId: recipient.id ?? null,
      to,
      channel: input.channel,
      subject: input.subject,
      message: input.message,
      metadata: input.metadata ?? {},
      idempotencyKey,
      scheduledAt: input.scheduledAt ?? null,
      nextAttemptAt,
      maxAttempts: config.worker.maxAttempts,
      events: [{ status: "PENDING", detail }],
    });

    return { notification, created: true };
  } catch (error) {
    // Two requests with the same Idempotency-Key raced; return the winner
    if (error.code === 11000 && idempotencyKey) {
      const existing = await findByIdempotencyKey(businessId, idempotencyKey);
      return { notification: existing, created: false };
    }
    throw error;
  }
};

const buildNotificationQuery = (baseQuery, filters) => {
  const query = { ...baseQuery };

  if (filters.channel) {
    query.channel = filters.channel;
  }

  if (filters.status) {
    query.status = filters.status;
  }

  if (filters.recipientId) {
    query.recipientExternalId = filters.recipientId;
  }

  if (filters.from || filters.to) {
    query.createdAt = {};
    if (filters.from) query.createdAt.$gte = filters.from;
    if (filters.to) query.createdAt.$lte = filters.to;
  }

  if (filters.search) {
    // Escaped so user input is matched literally (no regex injection / ReDoS)
    const pattern = new RegExp(escapeRegex(filters.search), "i");
    query.$or = [{ to: pattern }, { subject: pattern }, { message: pattern }];
  }

  return query;
};

const listNotifications = async (baseQuery, filters) => {
  const query = buildNotificationQuery(baseQuery, filters);
  const { page, limit } = filters;

  const [notifications, total] = await Promise.all([
    Notification.find(query)
      .select("-events")
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit),
    Notification.countDocuments(query),
  ]);

  return {
    notifications,
    pagination: paginate(page, limit, total),
  };
};

const getNotification = async (businessId, id) => {
  const notification = await Notification.findOne({ _id: id, business: businessId });

  if (!notification) {
    throw new HttpError(404, "Notification not found");
  }

  return notification;
};

const getInbox = async (businessId, externalId, { page, limit, unread }) => {
  const baseQuery = {
    business: businessId,
    recipientExternalId: externalId,
    channel: "IN_APP",
    status: "DELIVERED",
  };
  const query = unread === "true" ? { ...baseQuery, readAt: null } : baseQuery;

  const [notifications, total, unreadCount] = await Promise.all([
    Notification.find(query)
      .select("-events")
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit),
    Notification.countDocuments(query),
    Notification.countDocuments({ ...baseQuery, readAt: null }),
  ]);

  return {
    unreadCount,
    notifications,
    pagination: paginate(page, limit, total),
  };
};

const markAsRead = async (businessId, id) => {
  const notification = await getNotification(businessId, id);

  if (notification.channel !== "IN_APP") {
    throw new HttpError(400, "Only IN_APP notifications can be marked as read");
  }

  if (!notification.readAt) {
    notification.readAt = new Date();
    await notification.save();
  }

  return notification;
};

const retryNotification = async (businessId, id) => {
  const notification = await getNotification(businessId, id);

  if (notification.status !== "FAILED") {
    throw new HttpError(409, "Only FAILED notifications can be retried");
  }

  notification.attempts = 0;
  notification.nextAttemptAt = new Date();
  notification.failedAt = null;
  notification.addEvent("PENDING", "Manual retry requested");
  await notification.save();

  return notification;
};

const getStats = async (matchQuery) => {
  const [byStatus, byChannel] = await Promise.all([
    Notification.aggregate([
      { $match: matchQuery },
      { $group: { _id: "$status", count: { $sum: 1 } } },
    ]),
    Notification.aggregate([
      { $match: matchQuery },
      { $group: { _id: "$channel", count: { $sum: 1 } } },
    ]),
  ]);

  const toObject = (rows) =>
    Object.fromEntries(rows.map((row) => [row._id, row.count]));

  const statuses = toObject(byStatus);

  return {
    total: Object.values(statuses).reduce((sum, count) => sum + count, 0),
    byStatus: statuses,
    byChannel: toObject(byChannel),
  };
};

module.exports = {
  createNotification,
  listNotifications,
  getNotification,
  getInbox,
  markAsRead,
  retryNotification,
  getStats,
};
