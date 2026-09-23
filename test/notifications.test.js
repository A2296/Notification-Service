const { test, before, after, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
const { app, request, connect, disconnect, createBusiness } = require("./helpers");
const Notification = require("../src/models/notificationSchema");
const deliveryWorker = require("../src/services/deliveryWorker");
const { getProvider, setProvider } = require("../src/services/providers");
const DeliveryError = require("../src/services/providers/deliveryError");

const consoleEmail = getProvider("EMAIL");
const consoleSms = getProvider("SMS");

let acme;
let globex;

before(async () => {
  await connect(__filename);
  acme = await createBusiness("Acme");
  globex = await createBusiness("Globex");
});

after(disconnect);

beforeEach(() => {
  setProvider("EMAIL", consoleEmail);
  setProvider("SMS", consoleSms);
});

const send = (business, body, headers = {}) =>
  request(app)
    .post("/api/v1/notifications")
    .set(business.apiHeaders)
    .set(headers)
    .send(body);

const emailBody = (overrides = {}) => ({
  channel: "email",
  recipient: { id: "user_1", email: "ada@example.com", name: "Ada" },
  subject: "Your order has shipped",
  message: "Order #1001 is on its way.",
  metadata: { orderId: "1001" },
  ...overrides,
});

// ---- Sending & delivery ----

test("EMAIL is accepted as PENDING, then delivered by the worker as SENT", async () => {
  const res = await send(acme, emailBody());

  assert.equal(res.status, 202);
  assert.equal(res.body.notification.status, "PENDING");
  assert.equal(res.body.notification.channel, "EMAIL");
  assert.equal(res.body.notification.to, "ada@example.com");
  assert.equal(res.body.notification.business, undefined);

  await deliveryWorker.processPending();

  const detail = await request(app)
    .get(`/api/v1/notifications/${res.body.notification.id}`)
    .set(acme.apiHeaders);

  assert.equal(detail.status, 200);
  const notification = detail.body.notification;
  assert.equal(notification.status, "SENT");
  assert.equal(notification.provider, "console");
  assert.equal(notification.attempts, 1);
  assert.ok(notification.sentAt);
  assert.deepEqual(notification.metadata, { orderId: "1001" });
  assert.deepEqual(
    notification.events.map((event) => event.status),
    ["PENDING", "SENT"]
  );
});

test("SMS is delivered to an E.164 phone number", async () => {
  const res = await send(acme, {
    channel: "SMS",
    recipient: { phone: "+2348012345678" },
    message: "Your code is 123456",
  });
  assert.equal(res.status, 202);

  await deliveryWorker.processPending();

  const stored = await Notification.findById(res.body.notification.id);
  assert.equal(stored.status, "SENT");
  assert.equal(stored.to, "+2348012345678");
});

test("IN_APP is DELIVERED into the recipient's inbox and can be marked read", async () => {
  const res = await send(acme, {
    channel: "IN_APP",
    recipient: { id: "inbox_user" },
    subject: "Welcome",
    message: "Thanks for joining!",
  });
  assert.equal(res.status, 202);

  await deliveryWorker.processPending();

  const inbox = await request(app)
    .get("/api/v1/recipients/inbox_user/inbox")
    .set(acme.apiHeaders);
  assert.equal(inbox.status, 200);
  assert.equal(inbox.body.unreadCount, 1);
  assert.equal(inbox.body.notifications[0].status, "DELIVERED");

  const read = await request(app)
    .patch(`/api/v1/notifications/${res.body.notification.id}/read`)
    .set(acme.apiHeaders);
  assert.equal(read.status, 200);
  assert.ok(read.body.notification.readAt);

  const unread = await request(app)
    .get("/api/v1/recipients/inbox_user/inbox?unread=true")
    .set(acme.apiHeaders);
  assert.equal(unread.body.unreadCount, 0);
  assert.equal(unread.body.notifications.length, 0);
});

test("only IN_APP notifications can be marked read", async () => {
  const res = await send(acme, emailBody());

  const read = await request(app)
    .patch(`/api/v1/notifications/${res.body.notification.id}/read`)
    .set(acme.apiHeaders);
  assert.equal(read.status, 400);
});

test("dashboard users (JWT) can also send and list notifications", async () => {
  const res = await request(app)
    .post("/api/v1/notifications")
    .set(acme.jwtHeaders)
    .send(emailBody({ recipient: { email: "jwt@example.com" } }));
  assert.equal(res.status, 202);

  const list = await request(app)
    .get("/api/v1/notifications?search=jwt@example.com")
    .set(acme.jwtHeaders);
  assert.equal(list.body.notifications.length, 1);
});

// ---- Recipients ----

test("sending to a new recipient id creates the recipient", async () => {
  await send(acme, emailBody({ recipient: { id: "new_user", email: "new@example.com" } }));

  const res = await request(app).get("/api/v1/recipients/new_user").set(acme.apiHeaders);
  assert.equal(res.status, 200);
  assert.equal(res.body.recipient.email, "new@example.com");
});

test("a stored recipient's contact details are used when not provided", async () => {
  await request(app)
    .post("/api/v1/recipients")
    .set(acme.apiHeaders)
    .send({ externalId: "stored_user", email: "stored@example.com", phone: "+14155550100" })
    .expect(201);

  const sms = await send(acme, {
    channel: "SMS",
    recipient: { id: "stored_user" },
    message: "Hi",
  });
  assert.equal(sms.status, 202);
  assert.equal(sms.body.notification.to, "+14155550100");
});

test("sending to a recipient with no address for the channel returns 422", async () => {
  await send(acme, emailBody({ recipient: { id: "email_only", email: "e@example.com" } }));

  const res = await send(acme, {
    channel: "SMS",
    recipient: { id: "email_only" },
    message: "Hi",
  });
  assert.equal(res.status, 422);
});

test("recipients can be updated, listed and deleted", async () => {
  const update = await request(app)
    .patch("/api/v1/recipients/stored_user")
    .set(acme.apiHeaders)
    .send({ name: "Stored User" });
  assert.equal(update.status, 200);
  assert.equal(update.body.recipient.name, "Stored User");

  const upsert = await request(app)
    .post("/api/v1/recipients")
    .set(acme.apiHeaders)
    .send({ externalId: "stored_user", phone: "+14155550199" });
  assert.equal(upsert.status, 200);
  assert.equal(upsert.body.recipient.phone, "+14155550199");
  assert.equal(upsert.body.recipient.email, "stored@example.com");

  const list = await request(app)
    .get("/api/v1/recipients?search=stored")
    .set(acme.apiHeaders);
  assert.equal(list.body.recipients.length, 1);

  const del = await request(app).delete("/api/v1/recipients/stored_user").set(acme.apiHeaders);
  assert.equal(del.status, 200);

  const gone = await request(app).get("/api/v1/recipients/stored_user").set(acme.apiHeaders);
  assert.equal(gone.status, 404);
});

// ---- Validation ----

test("request validation rejects bad input with field-level errors", async () => {
  const cases = [
    [{ ...emailBody(), channel: "FAX" }, "channel"],
    [{ ...emailBody(), channel: 5 }, "channel"],
    [{ ...emailBody(), subject: undefined }, "subject"],
    [{ ...emailBody(), recipient: { email: "not-an-email" } }, "recipient.email"],
    [{ channel: "SMS", recipient: { phone: "08012345678" }, message: "x" }, "recipient.phone"],
    [{ channel: "SMS", recipient: { phone: "+2348012345678" }, message: "x".repeat(1601) }, "message"],
    [{ channel: "IN_APP", recipient: {}, message: "x" }, "recipient.id"],
    [{ ...emailBody(), message: "" }, "message"],
    [{ ...emailBody(), recipient: { id: { $ne: null } } }, "recipient.id"],
    [{ ...emailBody(), metadata: { nested: { $gt: 1 } } }, "metadata"],
    [{ ...emailBody(), metadata: { "a.b": 1 } }, "metadata"],
  ];

  for (const [body, field] of cases) {
    const res = await send(acme, body);
    assert.equal(res.status, 400, `expected 400 for ${field}`);
    assert.ok(
      res.body.errors.some((error) => error.field === field),
      `expected an error on ${field}, got ${JSON.stringify(res.body.errors)}`
    );
  }
});

test("malformed ids and repeated query params return 400", async () => {
  const badId = await request(app).get("/api/v1/notifications/not-an-id").set(acme.apiHeaders);
  assert.equal(badId.status, 400);

  const repeated = await request(app)
    .get("/api/v1/notifications?status=SENT&status=FAILED")
    .set(acme.apiHeaders);
  assert.equal(repeated.status, 400);
});

// ---- Idempotency ----

test("the same Idempotency-Key returns the original notification", async () => {
  const headers = { "Idempotency-Key": "order-1001-shipped" };

  const first = await send(acme, emailBody(), headers);
  const second = await send(acme, emailBody(), headers);

  assert.equal(first.status, 202);
  assert.equal(second.status, 200);
  assert.equal(second.body.notification.id, first.body.notification.id);
  assert.equal(await Notification.countDocuments({ idempotencyKey: "order-1001-shipped" }), 1);
});

test("Idempotency-Keys are scoped per business", async () => {
  const headers = { "Idempotency-Key": "shared-key" };

  const a = await send(acme, emailBody(), headers);
  const b = await send(globex, emailBody(), headers);

  assert.equal(a.status, 202);
  assert.equal(b.status, 202);
  assert.notEqual(a.body.notification.id, b.body.notification.id);
});

// ---- Tenant isolation ----

test("businesses cannot see each other's notifications, recipients or inboxes", async () => {
  const res = await send(acme, {
    channel: "IN_APP",
    recipient: { id: "private_user" },
    message: "Acme only",
  });
  await deliveryWorker.processPending();
  const id = res.body.notification.id;

  const byId = await request(app).get(`/api/v1/notifications/${id}`).set(globex.apiHeaders);
  assert.equal(byId.status, 404);

  const read = await request(app).patch(`/api/v1/notifications/${id}/read`).set(globex.apiHeaders);
  assert.equal(read.status, 404);

  const list = await request(app)
    .get("/api/v1/notifications?search=Acme only")
    .set(globex.apiHeaders);
  assert.equal(list.body.notifications.length, 0);

  const recipient = await request(app).get("/api/v1/recipients/private_user").set(globex.apiHeaders);
  assert.equal(recipient.status, 404);

  const inbox = await request(app).get("/api/v1/recipients/private_user/inbox").set(globex.apiHeaders);
  assert.equal(inbox.body.notifications.length, 0);
});

// ---- Listing ----

test("list supports filters, literal search and pagination", async () => {
  const biz = await createBusiness("Lister");

  for (let i = 0; i < 3; i += 1) {
    await send(biz, emailBody({ recipient: { id: "list_user", email: "l@example.com" }, message: `Welcome ${i}` }));
  }
  await send(biz, { channel: "SMS", recipient: { phone: "+14155550123" }, message: "Code (123)" });
  await deliveryWorker.processPending();

  const page = await request(app)
    .get("/api/v1/notifications?channel=email&status=sent&recipientId=list_user&page=2&limit=2")
    .set(biz.apiHeaders);
  assert.equal(page.status, 200);
  assert.equal(page.body.notifications.length, 1);
  assert.deepEqual(page.body.pagination, {
    currentPage: 2,
    itemsPerPage: 2,
    totalItems: 3,
    totalPages: 2,
  });
  assert.equal(page.body.notifications[0].events, undefined);

  const literal = await request(app)
    .get(`/api/v1/notifications?search=${encodeURIComponent("(123)")}`)
    .set(biz.apiHeaders);
  assert.equal(literal.status, 200);
  assert.equal(literal.body.notifications.length, 1);

  const stats = await request(app).get("/api/v1/notifications/stats").set(biz.apiHeaders);
  assert.deepEqual(stats.body.stats, {
    total: 4,
    byStatus: { SENT: 4 },
    byChannel: { EMAIL: 3, SMS: 1 },
  });
});

test("per-business rate limit headers are returned", async () => {
  const res = await request(app).get("/api/v1/notifications").set(acme.apiHeaders);
  assert.equal(res.headers["x-ratelimit-limit"], "1000");
});

// ---- Retries, failures, scheduling ----

test("temporary provider failures are retried, then FAILED, then manually retried", async () => {
  let calls = 0;
  setProvider("EMAIL", {
    name: "flaky",
    send: async () => {
      calls += 1;
      throw new DeliveryError("SMTP timeout");
    },
  });

  const res = await send(acme, emailBody());
  const id = res.body.notification.id;

  await deliveryWorker.processPending();
  let stored = await Notification.findById(id);
  assert.equal(stored.status, "PENDING");
  assert.equal(stored.attempts, 1);
  assert.ok(stored.nextAttemptAt > new Date(), "retry is scheduled with backoff");

  // Fast-forward through the remaining attempts
  for (let attempt = 2; attempt <= 3; attempt += 1) {
    await Notification.updateOne({ _id: id }, { nextAttemptAt: new Date() });
    await deliveryWorker.processPending();
  }

  stored = await Notification.findById(id);
  assert.equal(stored.status, "FAILED");
  assert.equal(stored.attempts, 3);
  assert.equal(stored.failureReason, "SMTP timeout");
  assert.equal(calls, 3);

  setProvider("EMAIL", consoleEmail);

  const retry = await request(app)
    .post(`/api/v1/notifications/${id}/retry`)
    .set(acme.apiHeaders);
  assert.equal(retry.status, 202);

  await deliveryWorker.processPending();
  stored = await Notification.findById(id);
  assert.equal(stored.status, "SENT");
  assert.equal(stored.failureReason, null);

  const retrySent = await request(app)
    .post(`/api/v1/notifications/${id}/retry`)
    .set(acme.apiHeaders);
  assert.equal(retrySent.status, 409);
});

test("permanent provider failures are not retried", async () => {
  setProvider("SMS", {
    name: "rejecting",
    send: async () => {
      throw new DeliveryError("Invalid 'To' phone number", { permanent: true });
    },
  });

  const res = await send(acme, {
    channel: "SMS",
    recipient: { phone: "+14155550000" },
    message: "Hi",
  });

  await deliveryWorker.processPending();
  const stored = await Notification.findById(res.body.notification.id);
  assert.equal(stored.status, "FAILED");
  assert.equal(stored.attempts, 1);
});

test("scheduled notifications wait until their scheduled time", async () => {
  const scheduledAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();
  const res = await send(acme, emailBody({ scheduledAt }));
  const id = res.body.notification.id;

  assert.equal(res.status, 202);
  assert.equal(res.body.notification.scheduledAt, scheduledAt);

  await deliveryWorker.processPending();
  assert.equal((await Notification.findById(id)).status, "PENDING");

  await Notification.updateOne({ _id: id }, { nextAttemptAt: new Date() });
  await deliveryWorker.processPending();
  assert.equal((await Notification.findById(id)).status, "SENT");
});

test("notifications stuck PROCESSING after a crash are picked up again", async () => {
  const res = await send(acme, emailBody());
  const id = res.body.notification.id;

  await Notification.updateOne(
    { _id: id },
    { status: "PROCESSING", lockedAt: new Date(Date.now() - 10 * 60 * 1000), attempts: 1 }
  );

  await deliveryWorker.processPending();
  const stored = await Notification.findById(id);
  assert.equal(stored.status, "SENT");
  assert.equal(stored.attempts, 2);
});
