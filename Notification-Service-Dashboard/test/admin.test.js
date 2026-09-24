const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const {
  app,
  request,
  connect,
  disconnect,
  createBusiness,
  createAdmin,
} = require("./helpers");
const deliveryWorker = require("../src/services/deliveryWorker");

let admin;
let acme;
let globex;

before(async () => {
  await connect(__filename);
  admin = await createAdmin();
  acme = await createBusiness("Acme");
  globex = await createBusiness("Globex");

  for (const business of [acme, globex]) {
    await request(app)
      .post("/api/v1/notifications")
      .set(business.apiHeaders)
      .send({ channel: "IN_APP", recipient: { id: "u1" }, message: "hello" });
  }
  await deliveryWorker.processPending();
});

after(disconnect);

test("business users and API keys cannot reach admin routes", async () => {
  const jwt = await request(app).get("/api/v1/admin/businesses").set(acme.jwtHeaders);
  assert.equal(jwt.status, 403);

  const apiKey = await request(app).get("/api/v1/admin/businesses").set(acme.apiHeaders);
  assert.equal(apiKey.status, 401);
});

test("platform admins cannot use business endpoints", async () => {
  const res = await request(app).get("/api/v1/notifications").set(admin);
  assert.equal(res.status, 403);
});

test("admin lists businesses", async () => {
  const res = await request(app).get("/api/v1/admin/businesses").set(admin);
  assert.equal(res.status, 200);
  assert.equal(res.body.businesses.length, 2);
  assert.equal(res.body.pagination.totalItems, 2);
});

test("admin sees notifications across businesses and can filter by business", async () => {
  const all = await request(app).get("/api/v1/admin/notifications").set(admin);
  assert.equal(all.status, 200);
  assert.equal(all.body.notifications.length, 2);

  const filtered = await request(app)
    .get(`/api/v1/admin/notifications?businessId=${acme.businessId}`)
    .set(admin);
  assert.equal(filtered.body.notifications.length, 1);
});

test("admin sees platform and per-business stats", async () => {
  const platform = await request(app).get("/api/v1/admin/stats").set(admin);
  assert.equal(platform.status, 200);
  assert.equal(platform.body.stats.total, 2);
  assert.equal(platform.body.stats.businesses, 2);

  const business = await request(app)
    .get(`/api/v1/admin/businesses/${acme.businessId}/stats`)
    .set(admin);
  assert.equal(business.body.stats.total, 1);
  assert.deepEqual(business.body.stats.byStatus, { DELIVERED: 1 });
});

test("suspending a business blocks its API keys, tokens and logins until reactivated", async () => {
  const suspend = await request(app)
    .patch(`/api/v1/admin/businesses/${globex.businessId}`)
    .set(admin)
    .send({ status: "SUSPENDED" });
  assert.equal(suspend.status, 200);
  assert.equal(suspend.body.business.status, "SUSPENDED");

  const apiKey = await request(app).get("/api/v1/notifications").set(globex.apiHeaders);
  assert.equal(apiKey.status, 403);

  const jwt = await request(app).get("/api/v1/notifications").set(globex.jwtHeaders);
  assert.equal(jwt.status, 403);

  const login = await request(app)
    .post("/api/v1/auth/login")
    .send({ email: globex.email, password: "Password123" });
  assert.equal(login.status, 403);

  // Other businesses are unaffected
  const acmeRes = await request(app).get("/api/v1/notifications").set(acme.apiHeaders);
  assert.equal(acmeRes.status, 200);

  await request(app)
    .patch(`/api/v1/admin/businesses/${globex.businessId}`)
    .set(admin)
    .send({ status: "ACTIVE" })
    .expect(200);

  const restored = await request(app).get("/api/v1/notifications").set(globex.apiHeaders);
  assert.equal(restored.status, 200);
});

test("admin business updates are validated", async () => {
  const badStatus = await request(app)
    .patch(`/api/v1/admin/businesses/${acme.businessId}`)
    .set(admin)
    .send({ status: "DELETED" });
  assert.equal(badStatus.status, 400);

  const missing = await request(app)
    .patch("/api/v1/admin/businesses/66f1c0a2b3c4d5e6f7a8b9c0")
    .set(admin)
    .send({ status: "ACTIVE" });
  assert.equal(missing.status, 404);
});
