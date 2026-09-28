const { z } = require("zod");
const { CHANNELS, STATUSES } = require("../models/notificationSchema");

const text = (max) => z.string().trim().min(1).max(max);
const email = z.string().trim().toLowerCase().pipe(z.email());
// E.164 format, e.g. +2348012345678
const phone = z
  .string()
  .trim()
  .regex(/^\+[1-9]\d{7,14}$/, "Phone must be in E.164 format, e.g. +2348012345678");
const externalId = text(100);
// Keys starting with "$" or containing "." have special meaning in MongoDB
const hasUnsafeKeys = (value) =>
  value !== null &&
  typeof value === "object" &&
  Object.entries(value).some(
    ([key, nested]) => key.startsWith("$") || key.includes(".") || hasUnsafeKeys(nested)
  );
const metadata = z
  .record(z.string(), z.unknown())
  .refine((value) => !hasUnsafeKeys(value), {
    message: 'Metadata keys cannot start with "$" or contain "."',
  });
const channel = z.string().trim().toUpperCase().pipe(z.enum(CHANNELS));
const status = z.string().trim().toUpperCase().pipe(z.enum(STATUSES));
const objectId = z.string().regex(/^[a-f\d]{24}$/i, "Invalid id");

const pagination = {
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
};

// ---- Auth ----
const registerBody = z.object({
  businessName: text(100),
  name: text(100),
  email,
  password: z.string().min(8, "Password must be at least 8 characters").max(128),
});

const loginBody = z.object({
  email,
  password: z.string().min(1).max(128),
});

// ---- API keys ----
const createApiKeyBody = z.object({
  name: text(100).default("Default key"),
});

// ---- Recipients ----
const recipientFields = {
  name: text(100).optional(),
  email: email.optional(),
  phone: phone.optional(),
  metadata: metadata.optional(),
};

const createRecipientBody = z.object({
  externalId,
  ...recipientFields,
});

const updateRecipientBody = z.object(recipientFields);

const externalIdParams = z.object({ externalId });

const listRecipientsQuery = z.object({
  ...pagination,
  search: text(100).optional(),
});

// ---- Notifications ----
const createNotificationBody = z
  .object({
    channel,
    recipient: z.object({
      id: externalId.optional(),
      name: text(100).optional(),
      email: email.optional(),
      phone: phone.optional(),
    }),
    subject: text(200).optional(),
    message: text(5000),
    metadata: metadata.optional(),
    scheduledAt: z.coerce.date().optional(),
  })
  .superRefine((body, ctx) => {
    const { recipient } = body;

    if (body.channel === "IN_APP" && !recipient.id) {
      ctx.addIssue({
        code: "custom",
        path: ["recipient", "id"],
        message: "recipient.id is required for IN_APP notifications",
      });
    }

    if (body.channel === "EMAIL" && !recipient.email && !recipient.id) {
      ctx.addIssue({
        code: "custom",
        path: ["recipient"],
        message: "recipient.email or recipient.id is required for EMAIL",
      });
    }

    if (body.channel === "EMAIL" && !body.subject) {
      ctx.addIssue({
        code: "custom",
        path: ["subject"],
        message: "subject is required for EMAIL notifications",
      });
    }

    if (body.channel === "SMS" && !recipient.phone && !recipient.id) {
      ctx.addIssue({
        code: "custom",
        path: ["recipient"],
        message: "recipient.phone or recipient.id is required for SMS",
      });
    }

    if (body.channel === "SMS" && body.message.length > 1600) {
      ctx.addIssue({
        code: "custom",
        path: ["message"],
        message: "SMS messages are limited to 1600 characters",
      });
    }
  });

const MAX_BULK_NOTIFICATIONS = 100;
const SHARED_NOTIFICATION_FIELDS = ["channel", "subject", "message", "metadata", "scheduledAt"];

// Bulk send: shared fields apply to every item and an item's own fields override them,
// so "same message to many recipients" only lists each recipient once. Each merged item
// is then validated exactly like a single notification.
const bulkNotificationBody = z
  .object({
    ...Object.fromEntries(SHARED_NOTIFICATION_FIELDS.map((field) => [field, z.unknown().optional()])),
    notifications: z
      .array(z.record(z.string(), z.unknown()))
      .min(1, "Provide at least one notification")
      .max(MAX_BULK_NOTIFICATIONS, `At most ${MAX_BULK_NOTIFICATIONS} notifications per request`),
  })
  .transform((body, ctx) => {
    const shared = Object.fromEntries(
      SHARED_NOTIFICATION_FIELDS.filter((field) => body[field] !== undefined).map((field) => [
        field,
        body[field],
      ])
    );
    const notifications = [];
    let valid = true;

    body.notifications.forEach((item, index) => {
      const result = createNotificationBody.safeParse({ ...shared, ...item });

      if (result.success) {
        notifications.push(result.data);
        return;
      }

      valid = false;
      for (const issue of result.error.issues) {
        ctx.addIssue({
          code: "custom",
          path: ["notifications", index, ...issue.path],
          message: issue.message,
        });
      }
    });

    return valid ? { notifications } : z.NEVER;
  });

const listNotificationsQuery = z.object({
  ...pagination,
  search: text(100).optional(),
  channel: channel.optional(),
  status: status.optional(),
  recipientId: externalId.optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
});

const inboxQuery = z.object({
  ...pagination,
  unread: z.enum(["true", "false"]).optional(),
});

const idParams = z.object({ id: objectId });

// ---- Admin ----
const listBusinessesQuery = z.object({
  ...pagination,
  status: z.enum(["ACTIVE", "SUSPENDED"]).optional(),
});

const updateBusinessBody = z.object({
  status: z.enum(["ACTIVE", "SUSPENDED"]),
});

const adminNotificationsQuery = listNotificationsQuery.extend({
  businessId: objectId.optional(),
});

module.exports = {
  registerBody,
  loginBody,
  createApiKeyBody,
  createRecipientBody,
  updateRecipientBody,
  externalIdParams,
  listRecipientsQuery,
  createNotificationBody,
  bulkNotificationBody,
  MAX_BULK_NOTIFICATIONS,
  listNotificationsQuery,
  inboxQuery,
  idParams,
  listBusinessesQuery,
  updateBusinessBody,
  adminNotificationsQuery,
};
