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
const ApiKey = require("../src/models/apiKeySchema");

before(() => connect(__filename));
after(disconnect);

test("creating a key returns the secret once, in the expected format", async () => {
  const business = await createBusiness();

  const res = await request(app)
    .post("/api/v1/api-keys")
    .set(business.jwtHeaders)
    .send({ name: "Production" });

  assert.equal(res.status, 201);
  assert.match(res.body.apiKey.apiKey, /^ns_pk_[a-f0-9]{24}$/);
  assert.match(res.body.apiKey.apiSecret, /^ns_sk_[a-f0-9]{64}$/);
});

test("secrets are stored hashed and never returned by list", async () => {
  const business = await createBusiness();
  const secret = business.apiHeaders["X-API-Secret"];

  const stored = await ApiKey.findById(business.apiKeyId).lean();
  assert.notEqual(stored.secretHash, secret);
  assert.ok(!JSON.stringify(stored).includes(secret));

  const res = await request(app).get("/api/v1/api-keys").set(business.jwtHeaders);
  assert.equal(res.status, 200);
  assert.equal(res.body.apiKeys.length, 1);
  assert.equal(res.body.apiKeys[0].secretHash, undefined);
  assert.equal(res.body.apiKeys[0].secretLast4, secret.slice(-4));
  assert.ok(!JSON.stringify(res.body).includes(secret));
});

test("a valid key and secret authenticate integration calls", async () => {
  const business = await createBusiness();

  const res = await request(app).get("/api/v1/notifications").set(business.apiHeaders);
  assert.equal(res.status, 200);
});

test("a wrong secret or unknown key is rejected", async () => {
  const business = await createBusiness();

  const wrongSecret = await request(app)
    .get("/api/v1/notifications")
    .set({ ...business.apiHeaders, "X-API-Secret": "ns_sk_wrong" });
  assert.equal(wrongSecret.status, 401);

  const unknownKey = await request(app)
    .get("/api/v1/notifications")
    .set({ ...business.apiHeaders, "X-API-Key": "ns_pk_doesnotexist" });
  assert.equal(unknownKey.status, 401);

  const keyOnly = await request(app)
    .get("/api/v1/notifications")
    .set("X-API-Key", business.apiHeaders["X-API-Key"]);
  assert.equal(keyOnly.status, 401);
});

test("API keys cannot be used to manage API keys", async () => {
  const business = await createBusiness();

  const res = await request(app)
    .post("/api/v1/api-keys")
    .set(business.apiHeaders)
    .send({ name: "sneaky" });
  assert.equal(res.status, 401);
});

test("a revoked key stops working immediately", async () => {
  const business = await createBusiness();

  const revoke = await request(app)
    .delete(`/api/v1/api-keys/${business.apiKeyId}`)
    .set(business.jwtHeaders);
  assert.equal(revoke.status, 200);
  assert.ok(revoke.body.apiKey.revokedAt);

  const res = await request(app).get("/api/v1/notifications").set(business.apiHeaders);
  assert.equal(res.status, 401);

  const again = await request(app)
    .delete(`/api/v1/api-keys/${business.apiKeyId}`)
    .set(business.jwtHeaders);
  assert.equal(again.status, 404);
});

test("a business cannot revoke another business's key", async () => {
  const owner = await createBusiness("Owner Co");
  const attacker = await createBusiness("Attacker Co");

  const res = await request(app)
    .delete(`/api/v1/api-keys/${owner.apiKeyId}`)
    .set(attacker.jwtHeaders);
  assert.equal(res.status, 404);

  const stillWorks = await request(app).get("/api/v1/notifications").set(owner.apiHeaders);
  assert.equal(stillWorks.status, 200);
});

test("platform admins (no business) cannot create keys", async () => {
  const adminHeaders = await createAdmin();

  const res = await request(app)
    .post("/api/v1/api-keys")
    .set(adminHeaders)
    .send({ name: "admin key" });
  assert.equal(res.status, 403);
});
