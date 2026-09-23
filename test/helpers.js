// Shared test setup. Each test file runs in its own process with its own database.
// Local: docker run -d -p 27017:27017 mongo:7 && npm test
process.env.NODE_ENV = "test";
process.env.JWT_SECRET = process.env.JWT_SECRET || "test-secret";
process.env.AUTH_RATE_LIMIT_MAX = process.env.AUTH_RATE_LIMIT_MAX || "1000";
process.env.RATE_LIMIT_MAX = process.env.RATE_LIMIT_MAX || "1000";
process.env.IP_RATE_LIMIT_MAX = process.env.IP_RATE_LIMIT_MAX || "10000";

const path = require("node:path");
const mongoose = require("mongoose");
const request = require("supertest");
const bcrypt = require("bcryptjs");
const app = require("../app");
const User = require("../src/models/userSchema");

const connect = async (testFile) => {
  const base = process.env.TEST_DB_URL || "mongodb://localhost:27017/notification_service_test";
  const dbName = `${base.split("/").pop().split("?")[0]}_${path.basename(testFile, ".test.js")}`;
  const url = base.replace(/\/[^/?]*(\?|$)/, `/${dbName}$1`);

  await mongoose.connect(url);
  await mongoose.connection.dropDatabase();
  // Unique indexes (e.g. idempotency keys) must exist before tests rely on them
  await mongoose.connection.syncIndexes();
};

const disconnect = async () => {
  await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
};

let counter = 0;

// Registers a business and returns its dashboard token and API key headers
const createBusiness = async (name = "Acme") => {
  counter += 1;
  const email = `owner${counter}_${Date.now()}@test.com`;

  const register = await request(app).post("/api/v1/auth/register").send({
    businessName: name,
    name: "Owner",
    email,
    password: "Password123",
  });

  const token = register.body.token;

  const keyRes = await request(app)
    .post("/api/v1/api-keys")
    .set("Authorization", `Bearer ${token}`)
    .send({ name: "test key" });

  return {
    email,
    token,
    businessId: register.body.user.business.id,
    apiKeyId: keyRes.body.apiKey.id,
    apiHeaders: {
      "X-API-Key": keyRes.body.apiKey.apiKey,
      "X-API-Secret": keyRes.body.apiKey.apiSecret,
    },
    jwtHeaders: { Authorization: `Bearer ${token}` },
  };
};

const createAdmin = async () => {
  await User.create({
    name: "Platform Admin",
    email: "admin@platform.test",
    password: await bcrypt.hash("Password123", 10),
    role: "ADMIN",
  });

  const res = await request(app)
    .post("/api/v1/auth/login")
    .send({ email: "admin@platform.test", password: "Password123" });

  return { Authorization: `Bearer ${res.body.token}` };
};

module.exports = {
  app,
  request,
  connect,
  disconnect,
  createBusiness,
  createAdmin,
};
