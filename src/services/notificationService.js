const Notification = require("../models/notificationSchema");
const { sendEmail } = require("./emailService");
const { sendSMS } = require("./smsService");
const { sendInAppNotification } = require("./inAppService");

const escapeRegex = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const createNotification = async ({
  userId,
  recipient,
  channel,
  subject,
  message,
}) => {
  const notification = await Notification.create({
    user: userId,
    recipient,
    channel,
    subject,
    message,
    status: "PENDING",
  });

  try {
    if (channel === "EMAIL") {
      await sendEmail({
        recipient,
        subject,
        message,
      });
    }

    if (channel === "SMS") {
      await sendSMS({
        recipient,
        message,
      });
    }

    if (channel === "IN_APP") {
      await sendInAppNotification({
        recipient,
        subject,
        message,
      });
    }

    if (
      channel === "EMAIL" ||
      channel === "SMS" ||
      channel === "IN_APP"
    ) {
      notification.status = "SENT";
      notification.sentAt = new Date();

      await notification.save();
    }
  } catch (error) {
    notification.status = "FAILED";
    notification.failureReason = error.message;

    await notification.save();
  }

  return notification;
};

const getUserNotifications = async (
  userId,
  search,
  channel,
  status,
  page,
  limit,
) => {
  const query = {
    user: userId,
  };

  if (search) {
    // Escape regex metacharacters so user input is matched literally
    // (prevents crashes on input like "(" and regex DoS)
    const pattern = new RegExp(escapeRegex(search), "i");

    query.$or = [
      { recipient: pattern },
      { subject: pattern },
      { message: pattern },
    ];
  }

  if (channel) {
    query.channel = channel.toUpperCase();
  }

  if (status) {
    query.status = status.toUpperCase();
  }

  const currentPage = Number(page) || 1;
  const itemsPerPage = Math.min(Number(limit) || 10, 100);

  const skip = (currentPage - 1) * itemsPerPage;

  const notifications = await Notification.find(query)
    .sort({
      createdAt: -1,
    })
    .skip(skip)
    .limit(itemsPerPage);

  const totalNotifications = await Notification.countDocuments(query);

  const totalPages = Math.ceil(
    totalNotifications / itemsPerPage
  );

  return {
    notifications,
    pagination: {
      currentPage,
      itemsPerPage,
      totalNotifications,
      totalPages,
    },
  };
};

const getNotificationById = async (notificationId, userId) => {
  const notification = await Notification.findOne({
    _id: notificationId,
    user: userId,
  });

  return notification;
};

const getAllNotifications = async () => {
  const notifications = await Notification.find().sort({
    createdAt: -1,
  });

  return notifications;
};

module.exports = {
  createNotification,
  getUserNotifications,
  getNotificationById,
  getAllNotifications,
};