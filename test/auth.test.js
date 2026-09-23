const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { app, request, connect, disconnect } = require("./helpers");

before(() => connect(__filename));
after(disconnect);

let token;

test("health check reports database connected", async () => {
  const res = await request(app).get("/health");
  assert.equal(res.status, 200);
  assert.equal(res.body.database, "connected");
});

test("register creates a business and returns a dashboard token", async () => {
  const res = await request(app).post("/api/v1/auth/register").send({
    businessName: "Acme Stores",
    name: "Owner",
    email: "Owner@Acme.com",
    password: "Password123",
  });

  assert.equal(res.status, 201);
  assert.ok(res.body.token);
  assert.equal(res.body.user.email, "owner@acme.com");
  assert.equal(res.body.user.role, "USER");
  assert.equal(res.body.user.business.name, "Acme Stores");
  assert.equal(res.body.user.business.status, "ACTIVE");
  assert.equal(res.body.user.password, undefined);
});

test("register rejects a duplicate email regardless of case", async () => {
  const res = await request(app).post("/api/v1/auth/register").send({
    businessName: "Other",
    name: "Other",
    email: "OWNER@acme.com",
    password: "Password123",
  });
  assert.equal(res.status, 409);
});

test("register validates fields and reports each error", async () => {
  const res = await request(app)
    .post("/api/v1/auth/register")
    .send({ email: "not-an-email", password: "short" });

  assert.equal(res.status, 400);
  const fields = res.body.errors.map((error) => error.field);
  assert.ok(fields.includes("businessName"));
  assert.ok(fields.includes("email"));
  assert.ok(fields.includes("password"));
});

test("login is case-insensitive on email and returns a token", async () => {
  const res = await request(app)
    .post("/api/v1/auth/login")
    .send({ email: "owner@ACME.com", password: "Password123" });

  assert.equal(res.status, 200);
  assert.ok(res.body.token);
  token = res.body.token;
});

test("login rejects a wrong password", async () => {
  const res = await request(app)
    .post("/api/v1/auth/login")
    .send({ email: "owner@acme.com", password: "wrong-password" });
  assert.equal(res.status, 401);
});

test("login rejects NoSQL operator injection", async () => {
  const res = await request(app)
    .post("/api/v1/auth/login")
    .send({ email: { $ne: null }, password: { $ne: null } });
  assert.equal(res.status, 400);
});

test("login with no body returns 400, not 500", async () => {
  const res = await request(app).post("/api/v1/auth/login");
  assert.equal(res.status, 400);
});

test("malformed JSON returns 400", async () => {
  const res = await request(app)
    .post("/api/v1/auth/login")
    .set("Content-Type", "application/json")
    .send("{bad");
  assert.equal(res.status, 400);
});

test("/me returns the user and business for a valid token", async () => {
  const res = await request(app)
    .get("/api/v1/auth/me")
    .set("Authorization", `Bearer ${token}`);

  assert.equal(res.status, 200);
  assert.equal(res.body.user.business.name, "Acme Stores");
});

test("/me rejects missing and invalid tokens", async () => {
  const missing = await request(app).get("/api/v1/auth/me");
  assert.equal(missing.status, 401);

  const invalid = await request(app)
    .get("/api/v1/auth/me")
    .set("Authorization", "Bearer not-a-real-token");
  assert.equal(invalid.status, 401);
});

test("unknown routes return JSON 404", async () => {
  const res = await request(app).get("/api/v1/does-not-exist");
  assert.equal(res.status, 404);
  assert.equal(res.body.success, false);
});

test("cross-origin browser calls are not allowed by default", async () => {
  const res = await request(app)
    .get("/health")
    .set("Origin", "https://evil.example.com");
  assert.equal(res.headers["access-control-allow-origin"], undefined);
});

test("a per-IP rate limit applies to all API routes, even without credentials", async () => {
  const res = await request(app).get("/api/v1/auth/me");
  assert.equal(res.status, 401);
  assert.ok(res.headers["x-ratelimit-limit"]);
});

test("API docs are served", async () => {
  const spec = await request(app).get("/openapi.json");
  assert.equal(spec.status, 200);
  assert.equal(spec.body.openapi, "3.0.3");

  const ui = await request(app).get("/docs/");
  assert.equal(ui.status, 200);
});
