// Integration tests against a real MongoDB.
// Local: docker run -d -p 27017:27017 mongo:7 && npm test
const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");

process.env.JWT_SECRET = process.env.JWT_SECRET || "test-secret";
process.env.RATE_LIMIT_MAX = "1000";

const mongoose = require("mongoose");
const request = require("supertest");
const bcrypt = require("bcryptjs");
require("../src/config/db");
const app = require("../app");
const User = require("../src/models/userSchema");

const DB_URL =
  process.env.TEST_DB_URL ||
  "mongodb://localhost:27017/notification_service_test";

let userToken;
let otherToken;
let adminToken;
let notificationId;

const login = async (email, password) => {
  const res = await request(app)
    .post("/api/auth/login")
    .send({ email, password });
  return res.body.token;
};

before(async () => {
  await mongoose.connect(DB_URL);
  await mongoose.connection.dropDatabase();

  await request(app)
    .post("/api/auth/register")
    .send({ name: "User", email: "user@test.com", password: "Password123" });
  await request(app)
    .post("/api/auth/register")
    .send({ name: "Other", email: "other@test.com", password: "Password123" });
  await User.create({
    name: "Admin",
    email: "admin@test.com",
    password: await bcrypt.hash("Password123", 10),
    role: "ADMIN",
  });

  userToken = await login("user@test.com", "Password123");
  otherToken = await login("other@test.com", "Password123");
  adminToken = await login("admin@test.com", "Password123");
});

after(async () => {
  await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
});

const auth = (token) => ({ Authorization: `Bearer ${token}` });

test("health check reports database connected", async () => {
  const res = await request(app).get("/health");
  assert.equal(res.status, 200);
  assert.equal(res.body.database, "connected");
});

test("register rejects duplicate email", async () => {
  const res = await request(app)
    .post("/api/auth/register")
    .send({ name: "Dup", email: "USER@test.com", password: "Password123" });
  assert.equal(res.status, 400);
});

test("register rejects short password", async () => {
  const res = await request(app)
    .post("/api/auth/register")
    .send({ name: "Short", email: "short@test.com", password: "abc" });
  assert.equal(res.status, 400);
});

test("login is case-insensitive on email and returns a token", async () => {
  const res = await request(app)
    .post("/api/auth/login")
    .send({ email: "User@Test.com", password: "Password123" });
  assert.equal(res.status, 200);
  assert.ok(res.body.token);
});

test("login rejects wrong password", async () => {
  const res = await request(app)
    .post("/api/auth/login")
    .send({ email: "user@test.com", password: "wrong-password" });
  assert.equal(res.status, 401);
});

test("login rejects NoSQL operator injection", async () => {
  const res = await request(app)
    .post("/api/auth/login")
    .send({ email: { $ne: null }, password: { $ne: null } });
  assert.equal(res.status, 400);
});

test("login with no body returns 400, not 500", async () => {
  const res = await request(app).post("/api/auth/login");
  assert.equal(res.status, 400);
});

test("malformed JSON returns 400", async () => {
  const res = await request(app)
    .post("/api/auth/login")
    .set("Content-Type", "application/json")
    .send("{bad");
  assert.equal(res.status, 400);
});

test("notifications require a token", async () => {
  const res = await request(app).get("/api/notifications");
  assert.equal(res.status, 401);
});

test("notifications reject an invalid token", async () => {
  const res = await request(app)
    .get("/api/notifications")
    .set(auth("not-a-real-token"));
  assert.equal(res.status, 401);
});

test("create notification on each channel marks it SENT", async () => {
  for (const channel of ["email", "SMS", "In_App"]) {
    const res = await request(app)
      .post("/api/notifications")
      .set(auth(userToken))
      .send({
        recipient: "someone@test.com",
        channel,
        subject: "Welcome",
        message: `Welcome via ${channel}`,
      });
    assert.equal(res.status, 201);
    assert.equal(res.body.notification.status, "SENT");
    assert.equal(res.body.notification.channel, channel.toUpperCase());
    notificationId = res.body.notification._id;
  }
});

test("create notification validates channel and types", async () => {
  const badChannel = await request(app)
    .post("/api/notifications")
    .set(auth(userToken))
    .send({ recipient: "x", channel: "FAX", message: "m" });
  assert.equal(badChannel.status, 400);

  const numericChannel = await request(app)
    .post("/api/notifications")
    .set(auth(userToken))
    .send({ recipient: "x", channel: 5, message: "m" });
  assert.equal(numericChannel.status, 400);
});

test("list supports search, filters and pagination", async () => {
  const res = await request(app)
    .get("/api/notifications?search=welcome&channel=sms&status=sent&page=1&limit=5")
    .set(auth(userToken));
  assert.equal(res.status, 200);
  assert.equal(res.body.notifications.length, 1);
  assert.equal(res.body.pagination.totalNotifications, 1);
});

test("search treats regex characters literally", async () => {
  const res = await request(app)
    .get("/api/notifications?search=(")
    .set(auth(userToken));
  assert.equal(res.status, 200);
  assert.equal(res.body.notifications.length, 0);
});

test("repeated query params return 400", async () => {
  const res = await request(app)
    .get("/api/notifications?status=SENT&status=FAILED")
    .set(auth(userToken));
  assert.equal(res.status, 400);
});

test("get by id returns own notification", async () => {
  const res = await request(app)
    .get(`/api/notifications/${notificationId}`)
    .set(auth(userToken));
  assert.equal(res.status, 200);
});

test("get by id hides other users' notifications", async () => {
  const res = await request(app)
    .get(`/api/notifications/${notificationId}`)
    .set(auth(otherToken));
  assert.equal(res.status, 404);
});

test("get by malformed id returns 404, not 500", async () => {
  const res = await request(app)
    .get("/api/notifications/not-an-id")
    .set(auth(userToken));
  assert.equal(res.status, 404);
});

test("admin route blocks normal users", async () => {
  const res = await request(app)
    .get("/api/admin/notifications")
    .set(auth(userToken));
  assert.equal(res.status, 403);
});

test("admin route lists all notifications for admins", async () => {
  const res = await request(app)
    .get("/api/admin/notifications")
    .set(auth(adminToken));
  assert.equal(res.status, 200);
  assert.equal(res.body.notifications.length, 3);
});

test("rate limiter is applied to /api", async () => {
  const res = await request(app).get("/api/notifications");
  assert.equal(res.headers["x-ratelimit-limit"], "1000");
});

test("unknown routes return JSON 404", async () => {
  const res = await request(app).get("/api/does-not-exist");
  assert.equal(res.status, 404);
  assert.equal(res.body.success, false);
});
