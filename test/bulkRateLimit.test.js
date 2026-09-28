// Runs in its own process so the small bulk limit does not affect other tests
process.env.BULK_RATE_LIMIT_MAX = "2";

const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { app, request, connect, disconnect, createBusiness } = require("./helpers");

before(() => connect(__filename));
after(disconnect);

test("bulk sends have their own per-business limit; single sends are unaffected", async () => {
  const acme = await createBusiness("Acme");
  const globex = await createBusiness("Globex");
  const body = {
    channel: "EMAIL",
    subject: "Hi",
    message: "Hello",
    notifications: [{ recipient: { email: "a@example.com" } }],
  };
  const bulk = (business) =>
    request(app).post("/api/v1/notifications/bulk").set(business.apiHeaders).send(body);

  assert.equal((await bulk(acme)).status, 202);
  assert.equal((await bulk(acme)).status, 202);
  assert.equal((await bulk(acme)).status, 429);

  // Another business has its own budget
  assert.equal((await bulk(globex)).status, 202);

  const single = await request(app)
    .post("/api/v1/notifications")
    .set(acme.apiHeaders)
    .send({ channel: "EMAIL", recipient: { email: "a@example.com" }, subject: "Hi", message: "Hello" });
  assert.equal(single.status, 202);
});
