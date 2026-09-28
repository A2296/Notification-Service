const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { app, request, connect, disconnect, createBusiness } = require("./helpers");
const Notification = require("../src/models/notificationSchema");
const deliveryWorker = require("../src/services/deliveryWorker");

let acme;
let globex;

before(async () => {
  await connect(__filename);
  acme = await createBusiness("Acme");
  globex = await createBusiness("Globex");
});

after(disconnect);

const sendBulk = (business, body, headers = {}) =>
  request(app)
    .post("/api/v1/notifications/bulk")
    .set(business.apiHeaders)
    .set(headers)
    .send(body);

const announcement = (emails) => ({
  channel: "EMAIL",
  subject: "We have moved",
  message: "Our office has a new address.",
  notifications: emails.map((email) => ({ recipient: { email } })),
});

test("a bulk send queues one notification per recipient using the shared fields", async () => {
  const emails = ["a@example.com", "b@example.com", "c@example.com"];

  const res = await sendBulk(acme, announcement(emails));

  assert.equal(res.status, 202);
  assert.equal(res.body.accepted, 3);
  assert.equal(res.body.failed, 0);
  assert.deepEqual(
    res.body.results.map((result) => [result.index, result.notification.to]),
    emails.map((email, index) => [index, email])
  );
  res.body.results.forEach((result) => {
    assert.equal(result.notification.subject, "We have moved");
    assert.equal(result.notification.status, "PENDING");
  });

  await deliveryWorker.processPending();
  const sent = await Notification.find({ to: { $in: emails } });
  assert.equal(sent.length, 3);
  assert.ok(sent.every((notification) => notification.status === "SENT"));

  // Only the sending business can see them
  const other = await request(app)
    .get("/api/v1/notifications?search=moved")
    .set(globex.apiHeaders);
  assert.equal(other.body.notifications.length, 0);
});

test("items can override shared fields, including the channel", async () => {
  const res = await sendBulk(acme, {
    channel: "EMAIL",
    subject: "Hello",
    message: "Shared message",
    notifications: [
      { recipient: { email: "shared@example.com" } },
      { channel: "SMS", recipient: { phone: "+14155550100" }, message: "Short SMS" },
      { channel: "in_app", recipient: { id: "user_42" } },
    ],
  });

  assert.equal(res.status, 202);
  const [email, sms, inApp] = res.body.results.map((result) => result.notification);
  assert.equal(email.channel, "EMAIL");
  assert.equal(email.message, "Shared message");
  assert.equal(sms.channel, "SMS");
  assert.equal(sms.message, "Short SMS");
  assert.equal(inApp.channel, "IN_APP");
  assert.equal(inApp.to, "user_42");
});

test("an invalid item rejects the whole request, names its position, and queues nothing", async () => {
  const before = await Notification.countDocuments();

  const res = await sendBulk(acme, announcement(["ok@example.com", "not-an-email"]));

  assert.equal(res.status, 400);
  assert.ok(res.body.errors.some((error) => error.field === "notifications.1.recipient.email"));
  assert.equal(await Notification.countDocuments(), before);
});

test("a bulk request needs 1 to 100 notifications", async () => {
  const empty = await sendBulk(acme, announcement([]));
  assert.equal(empty.status, 400);

  const tooMany = Array.from({ length: 101 }, (_, index) => `user${index}@example.com`);
  const large = await sendBulk(acme, announcement(tooMany));
  assert.equal(large.status, 400);
  assert.equal(large.body.errors[0].field, "notifications");

  const exactly100 = await sendBulk(acme, announcement(tooMany.slice(0, 100)));
  assert.equal(exactly100.status, 202);
  assert.equal(exactly100.body.accepted, 100);
});

test("items that cannot be created are reported without blocking the rest", async () => {
  // A stored recipient with an email address but no phone number
  await request(app)
    .post("/api/v1/recipients")
    .set(acme.apiHeaders)
    .send({ externalId: "email_only", email: "only@example.com" });

  const res = await sendBulk(acme, {
    channel: "SMS",
    message: "Your code is 1234",
    notifications: [
      { recipient: { id: "email_only" } },
      { recipient: { phone: "+14155550101" } },
    ],
  });

  assert.equal(res.status, 202);
  assert.equal(res.body.accepted, 1);
  assert.equal(res.body.failed, 1);
  assert.equal(res.body.results[0].index, 0);
  assert.match(res.body.results[0].error, /no phone on file/);
  assert.equal(res.body.results[1].notification.to, "+14155550101");

  const allFailed = await sendBulk(acme, {
    channel: "SMS",
    message: "Your code is 1234",
    notifications: [{ recipient: { id: "email_only" } }],
  });
  assert.equal(allFailed.status, 422);
  assert.equal(allFailed.body.success, false);
});

test("repeating a bulk request with the same Idempotency-Key does not send twice", async () => {
  const headers = { "Idempotency-Key": "newsletter-2026-09" };
  const body = announcement(["x@example.com", "y@example.com"]);

  const first = await sendBulk(acme, body, headers);
  const second = await sendBulk(acme, body, headers);

  assert.equal(first.status, 202);
  assert.ok(first.body.results.every((result) => result.created));
  assert.ok(second.body.results.every((result) => result.created === false));
  assert.deepEqual(
    second.body.results.map((result) => result.notification.id),
    first.body.results.map((result) => result.notification.id)
  );
  assert.equal(
    await Notification.countDocuments({ idempotencyKey: /^newsletter-2026-09:/ }),
    2
  );
});

test("dashboard users can send in bulk with their session", async () => {
  const res = await request(app)
    .post("/api/v1/notifications/bulk")
    .set(acme.jwtHeaders)
    .send(announcement(["dashboard@example.com"]));

  assert.equal(res.status, 202);
  assert.equal(res.body.accepted, 1);
});
