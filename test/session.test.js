const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const jwt = require("jsonwebtoken");
const { app, request, connect, disconnect } = require("./helpers");
const config = require("../src/config");

before(() => connect(__filename));
after(disconnect);

const CSRF = { "X-Requested-With": "XMLHttpRequest" };

const sessionCookie = (res) =>
  (res.headers["set-cookie"] || []).find((cookie) => cookie.startsWith("ns_session="));

// "ns_session=<jwt>; Path=/api; Expires=...; HttpOnly" -> "ns_session=<jwt>"
const cookieHeader = (res) => sessionCookie(res).split(";")[0];

let counter = 0;

const register = async () => {
  counter += 1;
  const res = await request(app)
    .post("/api/v1/auth/register")
    .send({
      businessName: `Session Co ${counter}`,
      name: "Owner",
      email: `session${counter}@test.com`,
      password: "Password123",
    });
  assert.equal(res.status, 201);
  return res;
};

const login = (email) =>
  request(app).post("/api/v1/auth/login").send({ email, password: "Password123" });

test("register and login set an HttpOnly, SameSite=Strict session cookie scoped to /api", async () => {
  const registered = await register();
  const cookie = sessionCookie(registered);

  assert.ok(cookie);
  assert.match(cookie, /HttpOnly/);
  assert.match(cookie, /SameSite=Strict/);
  assert.match(cookie, /Path=\/api/);
  assert.match(cookie, /Expires=/);

  const loggedIn = await login(registered.body.user.email);
  assert.equal(loggedIn.status, 200);
  assert.ok(sessionCookie(loggedIn));
});

test("in production the session cookie is always Secure (HTTPS only)", async () => {
  const registered = await register();

  config.isProduction = true;
  try {
    const loggedIn = await login(registered.body.user.email);
    assert.match(sessionCookie(loggedIn), /Secure/);
  } finally {
    config.isProduction = false;
  }
});

test("the session cookie authenticates dashboard requests", async () => {
  const cookie = cookieHeader(await register());

  const me = await request(app).get("/api/v1/auth/me").set("Cookie", cookie);
  assert.equal(me.status, 200);

  const list = await request(app).get("/api/v1/notifications").set("Cookie", cookie);
  assert.equal(list.status, 200);

  const keys = await request(app).get("/api/v1/api-keys").set("Cookie", cookie);
  assert.equal(keys.status, 200);
});

test("cookie-authenticated changes require the X-Requested-With header (CSRF)", async () => {
  const cookie = cookieHeader(await register());
  const body = {
    channel: "EMAIL",
    recipient: { email: "user@example.com" },
    subject: "Hi",
    message: "Hello",
  };

  const forgedSend = await request(app)
    .post("/api/v1/notifications")
    .set("Cookie", cookie)
    .send(body);
  assert.equal(forgedSend.status, 403);

  const forgedKey = await request(app).post("/api/v1/api-keys").set("Cookie", cookie).send({});
  assert.equal(forgedKey.status, 403);

  const sent = await request(app)
    .post("/api/v1/notifications")
    .set("Cookie", cookie)
    .set(CSRF)
    .send(body);
  assert.equal(sent.status, 202);
});

test("logout clears the cookie and invalidates every token of the user", async () => {
  const registered = await register();
  const cookie = cookieHeader(registered);
  const otherDevice = await login(registered.body.user.email);
  const otherBearer = { Authorization: `Bearer ${otherDevice.body.token}` };

  const logout = await request(app)
    .post("/api/v1/auth/logout")
    .set("Cookie", cookie)
    .set(CSRF);
  assert.equal(logout.status, 200);
  assert.match(sessionCookie(logout), /Expires=Thu, 01 Jan 1970/);

  const withCookie = await request(app).get("/api/v1/auth/me").set("Cookie", cookie);
  assert.equal(withCookie.status, 401);

  const withBearer = await request(app).get("/api/v1/auth/me").set(otherBearer);
  assert.equal(withBearer.status, 401);

  // Signing in again issues a working token
  const again = await login(registered.body.user.email);
  const me = await request(app)
    .get("/api/v1/auth/me")
    .set("Authorization", `Bearer ${again.body.token}`);
  assert.equal(me.status, 200);
});

test("tokens must be HS256, signed with the server secret, unexpired, with the expected issuer and audience", async () => {
  const registered = await register();
  const secret = process.env.JWT_SECRET;
  const payload = { id: registered.body.user.id, role: "USER", tv: 0 };
  const valid = {
    algorithm: "HS256",
    issuer: "notification-service",
    audience: "notification-service-dashboard",
    expiresIn: "1h",
  };
  const encode = (value) => Buffer.from(JSON.stringify(value)).toString("base64url");
  const statusFor = async (token) =>
    (await request(app).get("/api/v1/auth/me").set("Authorization", `Bearer ${token}`)).status;

  assert.equal(await statusFor(jwt.sign(payload, secret, valid)), 200);

  assert.equal(await statusFor(jwt.sign(payload, "wrong-secret", valid)), 401);
  assert.equal(await statusFor(jwt.sign(payload, secret, { ...valid, algorithm: "HS512" })), 401);
  assert.equal(await statusFor(jwt.sign(payload, secret, { ...valid, issuer: "someone-else" })), 401);
  assert.equal(await statusFor(jwt.sign(payload, secret, { ...valid, audience: "another-app" })), 401);

  const { expiresIn, ...noExpiry } = valid;
  const expired = { ...payload, exp: Math.floor(Date.now() / 1000) - 60 };
  assert.equal(await statusFor(jwt.sign(expired, secret, noExpiry)), 401);

  // Unsigned token ("alg": "none")
  const claims = { ...payload, iss: valid.issuer, aud: valid.audience };
  assert.equal(await statusFor(`${encode({ alg: "none", typ: "JWT" })}.${encode(claims)}.`), 401);

  // Payload modified after signing
  const [header, , signature] = jwt.sign(payload, secret, valid).split(".");
  const tampered = `${header}.${encode({ ...claims, role: "ADMIN" })}.${signature}`;
  assert.equal(await statusFor(tampered), 401);
});

test("the dashboard is served from the API origin with a strict Content-Security-Policy", async () => {
  const page = await request(app).get("/");
  assert.equal(page.status, 200);
  assert.match(page.headers["content-type"], /text\/html/);

  const csp = page.headers["content-security-policy"];
  assert.match(csp, /default-src 'self'/);
  assert.match(csp, /script-src 'self'/);
  assert.match(csp, /connect-src 'self'/);
  assert.match(csp, /frame-ancestors 'none'/);
  assert.doesNotMatch(csp, /unsafe-inline|unsafe-eval/);
  assert.equal(page.headers["x-content-type-options"], "nosniff");
  assert.ok(page.headers["strict-transport-security"]);
  assert.ok(page.headers["permissions-policy"]);

  const script = await request(app).get("/app.js");
  assert.equal(script.status, 200);
  assert.match(script.headers["content-type"], /javascript/);
});

test("the dashboard script parses, keeps no credentials in browser storage and never injects HTML", () => {
  const source = fs.readFileSync(
    path.join(__dirname, "..", "Notification-Service-Dashboard", "frontend", "app.js"),
    "utf8"
  );

  assert.doesNotThrow(() => new vm.Script(source), "app.js has a syntax error");

  const storage = source.match(/localStorage|sessionStorage|indexedDB|document\.cookie/);
  assert.equal(storage, null, "app.js must not keep credentials in browser storage");

  const html = source.match(/innerHTML|outerHTML|insertAdjacentHTML|document\.write/);
  assert.equal(html, null, "app.js must build the DOM with textContent, not HTML strings");
});
