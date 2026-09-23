// Must be set before the app (and its config) is loaded
process.env.PUBLIC_BASE_URL = "https://api.example.com";
process.env.TWILIO_AUTH_TOKEN = "test-twilio-token";

const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const { app, request, connect, disconnect, createBusiness } = require("./helpers");
const Notification = require("../src/models/notificationSchema");
const deliveryWorker = require("../src/services/deliveryWorker");
const { setProvider } = require("../src/services/providers");

const WEBHOOK_PATH = "/api/v1/webhooks/twilio/status";

// Same algorithm Twilio uses to sign callbacks
const sign = (params) => {
  const payload = Object.keys(params)
    .sort()
    .reduce((acc, key) => acc + key + params[key], `https://api.example.com${WEBHOOK_PATH}`);
  return crypto.createHmac("sha1", "test-twilio-token").update(payload).digest("base64");
};

const callback = (params, signature = sign(params)) =>
  request(app)
    .post(WEBHOOK_PATH)
    .set("X-Twilio-Signature", signature)
    .type("form")
    .send(params);

let business;
let sid = 0;

// Fake Twilio: accepts the message and returns a message SID like the real API
before(async () => {
  await connect(__filename);
  business = await createBusiness();
  setProvider("SMS", {
    name: "twilio",
    send: async () => {
      sid += 1;
      return { status: "SENT", providerMessageId: `SM${sid}` };
    },
  });
});

after(disconnect);

const sendSms = async () => {
  const res = await request(app)
    .post("/api/v1/notifications")
    .set(business.apiHeaders)
    .send({ channel: "SMS", recipient: { phone: "+14155550100" }, message: "Hi" });
  await deliveryWorker.processPending();
  return Notification.findById(res.body.notification.id);
};

test("a signed 'delivered' callback marks the SMS DELIVERED", async () => {
  const notification = await sendSms();
  assert.equal(notification.status, "SENT");

  const res = await callback({
    MessageSid: notification.providerMessageId,
    MessageStatus: "delivered",
  });
  assert.equal(res.status, 204);

  const updated = await Notification.findById(notification._id);
  assert.equal(updated.status, "DELIVERED");
  assert.ok(updated.deliveredAt);
  assert.deepEqual(
    updated.events.map((event) => event.status),
    ["PENDING", "SENT", "DELIVERED"]
  );
});

test("a signed 'undelivered' callback marks the SMS FAILED with the error code", async () => {
  const notification = await sendSms();

  await callback({
    MessageSid: notification.providerMessageId,
    MessageStatus: "undelivered",
    ErrorCode: "30003",
  }).expect(204);

  const updated = await Notification.findById(notification._id);
  assert.equal(updated.status, "FAILED");
  assert.match(updated.failureReason, /30003/);
});

test("callbacks with an invalid signature are rejected", async () => {
  const notification = await sendSms();

  const res = await callback(
    { MessageSid: notification.providerMessageId, MessageStatus: "delivered" },
    "forged-signature"
  );
  assert.equal(res.status, 403);

  const unchanged = await Notification.findById(notification._id);
  assert.equal(unchanged.status, "SENT");
});

test("correctly signed callbacks with repeated fields are rejected before any query", async () => {
  // Repeated form fields parse as an array, which stringifies to "SM1,SM2" when signing
  const res = await request(app)
    .post(WEBHOOK_PATH)
    .set("X-Twilio-Signature", sign({ MessageSid: "SM1,SM2", MessageStatus: "delivered" }))
    .type("form")
    .send("MessageSid=SM1&MessageSid=SM2&MessageStatus=delivered");

  assert.equal(res.status, 400);
});

test("callbacks for unknown messages are acknowledged and ignored", async () => {
  const res = await callback({ MessageSid: "SMunknown", MessageStatus: "delivered" });
  assert.equal(res.status, 204);
});
