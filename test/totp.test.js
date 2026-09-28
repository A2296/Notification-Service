const { test } = require("node:test");
const assert = require("node:assert/strict");
const totp = require("../src/utils/totp");
const { seal, open } = require("../src/utils/secretBox");

process.env.JWT_SECRET = process.env.JWT_SECRET || "test-secret";

// RFC 6238 appendix B uses the ASCII secret "12345678901234567890" (SHA-1)
const rfcSecret = totp.toBase32(Buffer.from("12345678901234567890"));

test("codes match the RFC 6238 test vectors (last 6 digits)", () => {
  const vectors = [
    [59, "287082"],
    [1111111109, "081804"],
    [1234567890, "005924"],
    [2000000000, "279037"],
  ];

  for (const [seconds, code] of vectors) {
    assert.equal(totp.generateCode(rfcSecret, seconds * 1000), code);
  }
});

test("base32 secrets round-trip", () => {
  const secret = totp.generateSecret();

  assert.match(secret, /^[A-Z2-7]{32}$/);
  assert.equal(totp.toBase32(totp.fromBase32(secret)), secret);
});

test("a code is accepted for its own step and one step either side, and not reused", () => {
  const secret = totp.generateSecret();
  const now = 1_800_000_000_000;
  const code = totp.generateCode(secret, now);
  const step = Math.floor(now / 30000);

  assert.equal(totp.verifyCode(secret, code, { now }), step);
  assert.equal(totp.verifyCode(secret, code, { now: now + 30000 }), step); // 30s of clock drift
  assert.equal(totp.verifyCode(secret, code, { now: now + 90000 }), null); // too old
  assert.equal(totp.verifyCode(secret, code, { now, afterStep: step }), null); // already used
  assert.equal(totp.verifyCode(secret, "12345", { now }), null);
  assert.equal(totp.verifyCode(secret, "abcdef", { now }), null);
});

test("the setup link carries the secret and issuer", () => {
  const url = totp.otpauthUrl({ secret: "JBSWY3DPEHPK3PXP", account: "ada@example.com", issuer: "NotifyFlow" });

  assert.match(url, /^otpauth:\/\/totp\/NotifyFlow%3Aada%40example\.com\?/);
  assert.match(url, /secret=JBSWY3DPEHPK3PXP/);
  assert.match(url, /issuer=NotifyFlow/);
});

test("sealed secrets can only be opened unmodified", () => {
  const sealed = seal("JBSWY3DPEHPK3PXP");

  assert.ok(!sealed.includes("JBSWY3DPEHPK3PXP"));
  assert.equal(open(sealed), "JBSWY3DPEHPK3PXP");

  const parts = sealed.split(".");
  parts[3] = Buffer.from("tampered").toString("base64");
  assert.throws(() => open(parts.join(".")));
});
