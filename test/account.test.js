const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { app, request, connect, disconnect, createBusiness } = require("./helpers");
const User = require("../src/models/userSchema");
const totp = require("../src/utils/totp");

before(() => connect(__filename));
after(disconnect);

const PASSWORD = "Password123";

const login = (email, password = PASSWORD) =>
  request(app).post("/api/v1/auth/login").send({ email, password });

const bearer = (token) => ({ Authorization: `Bearer ${token}` });

// Turns on 2FA for a business owner and returns the secret and recovery codes
const enableMfa = async (business) => {
  const setup = await request(app)
    .post("/api/v1/account/mfa/setup")
    .set(business.jwtHeaders)
    .send({ password: PASSWORD });
  assert.equal(setup.status, 200);

  const enable = await request(app)
    .post("/api/v1/account/mfa/enable")
    .set(business.jwtHeaders)
    .send({ code: totp.generateCode(setup.body.secret) });
  assert.equal(enable.status, 200);

  return { secret: setup.body.secret, recoveryCodes: enable.body.recoveryCodes };
};

// A code from the next 30-second step, so it has not been used yet
const nextCode = (secret) => totp.generateCode(secret, Date.now() + 30 * 1000);

test("/auth/me describes the signed-in user for the profile page", async () => {
  const acme = await createBusiness("Acme");

  const res = await request(app).get("/api/v1/auth/me").set(acme.jwtHeaders);

  assert.equal(res.status, 200);
  assert.equal(res.body.user.email, acme.email);
  assert.equal(res.body.user.mfaEnabled, false);
  assert.ok(res.body.user.createdAt);
  assert.ok(res.body.user.lastLoginAt);
  assert.equal(res.body.user.password, undefined);
  assert.equal(res.body.user.mfa, undefined);
});

test("users can change their name", async () => {
  const acme = await createBusiness("Acme");

  const res = await request(app).patch("/api/v1/account").set(acme.jwtHeaders).send({ name: "Ada Lovelace" });

  assert.equal(res.status, 200);
  assert.equal(res.body.user.name, "Ada Lovelace");

  const empty = await request(app).patch("/api/v1/account").set(acme.jwtHeaders).send({ name: " " });
  assert.equal(empty.status, 400);
});

test("changing the password needs the current one and signs out other devices", async () => {
  const acme = await createBusiness("Acme");
  const otherDevice = bearer((await login(acme.email)).body.token);

  const wrong = await request(app)
    .post("/api/v1/account/password")
    .set(acme.jwtHeaders)
    .send({ currentPassword: "not-it", newPassword: "NewPassword456" });
  assert.equal(wrong.status, 401);

  const changed = await request(app)
    .post("/api/v1/account/password")
    .set(acme.jwtHeaders)
    .send({ currentPassword: PASSWORD, newPassword: "NewPassword456" });
  assert.equal(changed.status, 200);
  assert.ok(changed.body.token);

  assert.equal((await request(app).get("/api/v1/auth/me").set(otherDevice)).status, 401);
  assert.equal((await request(app).get("/api/v1/auth/me").set(bearer(changed.body.token))).status, 200);
  assert.equal((await login(acme.email)).status, 401);
  assert.equal((await login(acme.email, "NewPassword456")).status, 200);
});

test("two-factor setup needs the password and a working code", async () => {
  const acme = await createBusiness("Acme");

  const noPassword = await request(app)
    .post("/api/v1/account/mfa/setup")
    .set(acme.jwtHeaders)
    .send({ password: "wrong" });
  assert.equal(noPassword.status, 401);

  const setup = await request(app)
    .post("/api/v1/account/mfa/setup")
    .set(acme.jwtHeaders)
    .send({ password: PASSWORD });
  assert.equal(setup.status, 200);
  assert.match(setup.body.secret, /^[A-Z2-7]{32}$/);
  assert.match(setup.body.otpauthUrl, /^otpauth:\/\/totp\//);
  assert.match(setup.body.qrCode, /^data:image\/svg\+xml;base64,/);

  const badCode = await request(app)
    .post("/api/v1/account/mfa/enable")
    .set(acme.jwtHeaders)
    .send({ code: "000000" });
  assert.equal(badCode.status, 400);

  const enabled = await request(app)
    .post("/api/v1/account/mfa/enable")
    .set(acme.jwtHeaders)
    .send({ code: totp.generateCode(setup.body.secret) });
  assert.equal(enabled.status, 200);
  assert.equal(enabled.body.recoveryCodes.length, 10);
  assert.equal(enabled.body.user.mfaEnabled, true);

  // The secret is stored encrypted and the recovery codes hashed
  const stored = await User.findOne({ email: acme.email }).lean();
  assert.ok(!JSON.stringify(stored).includes(setup.body.secret));
  assert.ok(!stored.mfa.recoveryCodes.includes(enabled.body.recoveryCodes[0]));
});

test("with two-factor on, sign-in needs a code, and each code works once", async () => {
  const acme = await createBusiness("Acme");
  const { secret } = await enableMfa(acme);

  const first = await login(acme.email);
  assert.equal(first.status, 200);
  assert.equal(first.body.mfaRequired, true);
  assert.equal(first.body.token, undefined);
  assert.equal(first.headers["set-cookie"], undefined);

  // The in-between token is not a session
  assert.equal((await request(app).get("/api/v1/auth/me").set(bearer(first.body.mfaToken))).status, 401);

  const wrong = await request(app)
    .post("/api/v1/auth/login/mfa")
    .send({ mfaToken: first.body.mfaToken, code: "000000" });
  assert.equal(wrong.status, 401);

  const code = nextCode(secret);
  const signedIn = await request(app)
    .post("/api/v1/auth/login/mfa")
    .send({ mfaToken: first.body.mfaToken, code });
  assert.equal(signedIn.status, 200);
  assert.ok(signedIn.body.token);
  assert.ok(signedIn.headers["set-cookie"].some((cookie) => cookie.startsWith("ns_session=")));

  const again = await login(acme.email);
  const replay = await request(app)
    .post("/api/v1/auth/login/mfa")
    .send({ mfaToken: again.body.mfaToken, code });
  assert.equal(replay.status, 401);
});

test("recovery codes sign in once each", async () => {
  const acme = await createBusiness("Acme");
  const { recoveryCodes } = await enableMfa(acme);

  const withRecovery = async (code) => {
    const { body } = await login(acme.email);
    return request(app).post("/api/v1/auth/login/mfa").send({ mfaToken: body.mfaToken, code });
  };

  const used = await withRecovery(recoveryCodes[0].toUpperCase());
  assert.equal(used.status, 200);
  assert.equal(used.body.user.recoveryCodesLeft, 9);

  assert.equal((await withRecovery(recoveryCodes[0])).status, 401);
});

test("repeated wrong codes lock the code step for a while", async () => {
  const acme = await createBusiness("Acme");
  const { secret } = await enableMfa(acme);
  const { body } = await login(acme.email);
  const attempt = (code) =>
    request(app).post("/api/v1/auth/login/mfa").send({ mfaToken: body.mfaToken, code });

  for (let count = 0; count < 5; count += 1) {
    assert.equal((await attempt("000000")).status, 401);
  }

  // Even the right code is refused while locked
  assert.equal((await attempt(nextCode(secret))).status, 429);
});

test("an expired or tampered sign-in token is refused", async () => {
  const res = await request(app)
    .post("/api/v1/auth/login/mfa")
    .send({ mfaToken: "not-a-token", code: "123456" });

  assert.equal(res.status, 401);
});

test("turning two-factor off needs the password and a code", async () => {
  const acme = await createBusiness("Acme");
  const { secret } = await enableMfa(acme);
  const disable = (body) =>
    request(app).post("/api/v1/account/mfa/disable").set(acme.jwtHeaders).send(body);

  assert.equal((await disable({ password: "wrong", code: nextCode(secret) })).status, 401);
  assert.equal((await disable({ password: PASSWORD, code: "000000" })).status, 401);

  const off = await disable({ password: PASSWORD, code: nextCode(secret) });
  assert.equal(off.status, 200);
  assert.equal(off.body.user.mfaEnabled, false);

  const plain = await login(acme.email);
  assert.ok(plain.body.token);
});

test("business settings are saved and validated", async () => {
  const acme = await createBusiness("Acme");

  const saved = await request(app)
    .patch("/api/v1/account/business")
    .set(acme.jwtHeaders)
    .send({ name: "Acme Global", email: "Billing@Acme.com" });
  assert.equal(saved.status, 200);
  assert.equal(saved.body.business.name, "Acme Global");
  assert.equal(saved.body.business.email, "billing@acme.com");

  const invalid = await request(app)
    .patch("/api/v1/account/business")
    .set(acme.jwtHeaders)
    .send({ email: "nope" });
  assert.equal(invalid.status, 400);

  const empty = await request(app).patch("/api/v1/account/business").set(acme.jwtHeaders).send({});
  assert.equal(empty.status, 400);
});

test("delivery settings are described without credentials", async () => {
  const acme = await createBusiness("Acme");

  const res = await request(app).get("/api/v1/account/settings").set(acme.jwtHeaders);

  assert.equal(res.status, 200);
  const { delivery, limits } = res.body.settings;
  assert.equal(delivery.email.live, false); // console provider in tests
  assert.equal(delivery.sms.live, false);
  assert.equal(limits.notificationsPerBulkRequest, 100);
  assert.ok(!/pass|token|secret/i.test(JSON.stringify(res.body.settings)));
});

test("API keys cannot reach account settings", async () => {
  const acme = await createBusiness("Acme");

  const res = await request(app).get("/api/v1/account/settings").set(acme.apiHeaders);

  assert.equal(res.status, 401);
});
