const { test, afterEach } = require("node:test");
const assert = require("node:assert/strict");
const { app, request } = require("./helpers");
const config = require("../src/config");

// No database needed: the support contact comes from configuration only
const original = { ...config.support };

afterEach(() => {
  Object.assign(config.support, original);
});

const getSupport = () => request(app).get("/api/v1/support");

test("the support contact is public and empty until the operator sets it", async () => {
  config.support.email = null;
  config.support.url = null;

  const res = await getSupport();
  assert.equal(res.status, 200);
  assert.deepEqual(res.body.support, { email: null, url: null });
});

test("configured support details are returned", async () => {
  config.support.email = "help@notifyflow.test";
  config.support.url = "https://github.com/A2296/Notification-Service/issues";

  const res = await getSupport();
  assert.equal(res.status, 200);
  assert.deepEqual(res.body.support, {
    email: "help@notifyflow.test",
    url: "https://github.com/A2296/Notification-Service/issues",
  });
});

test("malformed support settings are never returned as links", async () => {
  config.support.email = "not an email";
  config.support.url = "javascript:alert(1)";

  const res = await getSupport();
  assert.equal(res.status, 200);
  assert.deepEqual(res.body.support, { email: null, url: null });
});
