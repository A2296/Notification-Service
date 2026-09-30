const { z } = require("zod");
const { CHANNELS, STATUSES } = require("../models/notificationSchema");
const { PLAN_IDS } = require("../models/businessSchema");
const { FREQUENCIES, isValidTimeZone } = require("../utils/recurrence");

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

// A 6-digit authenticator code or a recovery code ("3f9a1-c07b2")
const mfaCode = z.string().trim().min(6).max(20);
const currentPassword = z.string().min(1, "Enter your current password").max(128);

const mfaLoginBody = z.object({
  mfaToken: z.string().min(1).max(2000),
  code: mfaCode,
});

// ---- Account (the signed-in user) ----
const updateProfileBody = z.object({
  name: text(100),
});

const changePasswordBody = z
  .object({
    currentPassword,
    newPassword: z.string().min(8, "Password must be at least 8 characters").max(128),
  })
  .refine((body) => body.currentPassword !== body.newPassword, {
    path: ["newPassword"],
    message: "Choose a password you have not used here before",
  });

const confirmPasswordBody = z.object({ password: currentPassword });

const mfaConfirmBody = z.object({ code: mfaCode });

const mfaDisableBody = z.object({ password: currentPassword, code: mfaCode });

const businessSettingsBody = z
  .object({
    name: text(100).optional(),
    email: email.optional(),
  })
  .refine((body) => body.name !== undefined || body.email !== undefined, {
    message: "Provide a name or email to update",
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

// ---- Schedules (recurring notifications) ----
const scheduleRepeat = z
  .object({
    frequency: z.string().trim().toUpperCase().pipe(z.enum(FREQUENCIES)),
    time: z
      .string()
      .trim()
      .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use 24-hour HH:MM, e.g. 09:00"),
    daysOfWeek: z
      .array(z.number().int().min(0).max(6))
      .min(1, "Pick at least one day (0 = Sunday ... 6 = Saturday)")
      .max(7)
      .optional(),
    dayOfMonth: z.number().int().min(1).max(31).optional(),
    timezone: z
      .string()
      .trim()
      .max(100)
      .default("UTC")
      .refine(isValidTimeZone, 'Unknown timezone; use an IANA name such as "Africa/Lagos"'),
  })
  .superRefine((repeat, ctx) => {
    if (repeat.frequency === "WEEKLY" && !repeat.daysOfWeek) {
      ctx.addIssue({
        code: "custom",
        path: ["daysOfWeek"],
        message: "daysOfWeek is required for WEEKLY (0 = Sunday ... 6 = Saturday)",
      });
    }

    if (repeat.frequency === "MONTHLY" && !repeat.dayOfMonth) {
      ctx.addIssue({
        code: "custom",
        path: ["dayOfMonth"],
        message: "dayOfMonth (1-31) is required for MONTHLY",
      });
    }
  })
  // Keep only the fields the frequency uses
  .transform(({ frequency, time, timezone, daysOfWeek, dayOfMonth }) => ({
    frequency,
    time,
    timezone,
    ...(frequency === "WEEKLY" && {
      daysOfWeek: [...new Set(daysOfWeek)].sort((a, b) => a - b),
    }),
    ...(frequency === "MONTHLY" && { dayOfMonth }),
  }));

// The message is checked once per recipient with the single-send rules (channel, subject,
// address format...), and errors point at the recipient: "recipients.2.email".
const scheduleBody = z
  .object({
    name: text(100),
    ...Object.fromEntries(
      ["channel", "subject", "message", "metadata"].map((field) => [field, z.unknown().optional()])
    ),
    recipients: z
      .array(z.record(z.string(), z.unknown()))
      .min(1, "Add at least one recipient")
      .max(MAX_BULK_NOTIFICATIONS, `At most ${MAX_BULK_NOTIFICATIONS} recipients per schedule`),
    repeat: scheduleRepeat,
    status: z.enum(["ACTIVE", "PAUSED"]).default("ACTIVE"),
  })
  .transform((body, ctx) => {
    const { channel, subject, message, metadata } = body;
    const recipients = [];
    const reported = new Set();
    let notification;

    body.recipients.forEach((recipient, index) => {
      const result = createNotificationBody.safeParse({ channel, subject, message, metadata, recipient });

      if (result.success) {
        recipients.push(result.data.recipient);
        notification = notification || result.data;
        return;
      }

      for (const issue of result.error.issues) {
        const [first, ...rest] = issue.path;
        const path = first === "recipient" ? ["recipients", index, ...rest] : issue.path;
        const key = `${path.join(".")}|${issue.message}`;

        // A problem with the shared message (e.g. missing subject) is reported once
        if (!reported.has(key)) {
          reported.add(key);
          ctx.addIssue({ code: "custom", path, message: issue.message });
        }
      }
    });

    if (reported.size > 0) {
      return z.NEVER;
    }

    return {
      name: body.name,
      channel: notification.channel,
      subject: notification.subject,
      message: notification.message,
      metadata: notification.metadata ?? {},
      recipients,
      repeat: body.repeat,
      status: body.status,
    };
  });

// PATCH: any subset of the fields; merged with the stored schedule, then checked with scheduleBody
const updateScheduleBody = z.object({
  ...Object.fromEntries(
    ["name", "channel", "subject", "message", "metadata", "recipients", "status"].map((field) => [
      field,
      z.unknown().optional(),
    ])
  ),
  repeat: z.record(z.string(), z.unknown()).optional(),
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
  plan: z.enum(PLAN_IDS).optional(),
});

const updateBusinessBody = z
  .object({
    status: z.enum(["ACTIVE", "SUSPENDED"]).optional(),
    plan: z.enum(PLAN_IDS).optional(),
  })
  .refine((body) => body.status !== undefined || body.plan !== undefined, {
    message: "Provide status, plan or both",
  });

const adminNotificationsQuery = listNotificationsQuery.extend({
  businessId: objectId.optional(),
});

module.exports = {
  registerBody,
  loginBody,
  mfaLoginBody,
  updateProfileBody,
  changePasswordBody,
  confirmPasswordBody,
  mfaConfirmBody,
  mfaDisableBody,
  businessSettingsBody,
  createApiKeyBody,
  createRecipientBody,
  updateRecipientBody,
  externalIdParams,
  listRecipientsQuery,
  createNotificationBody,
  bulkNotificationBody,
  MAX_BULK_NOTIFICATIONS,
  scheduleBody,
  updateScheduleBody,
  listNotificationsQuery,
  inboxQuery,
  idParams,
  listBusinessesQuery,
  updateBusinessBody,
  adminNotificationsQuery,
};
