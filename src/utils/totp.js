const crypto = require("node:crypto");

// Time-based one-time passwords (RFC 6238), as used by Google Authenticator, Microsoft
// Authenticator, Authy and 1Password: HMAC-SHA1, 30-second steps, 6 digits.
const STEP_SECONDS = 30;
const DIGITS = 6;
const BASE32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

const toBase32 = (buffer) => {
  let output = "";
  let value = 0;
  let bits = 0;

  for (const byte of buffer) {
    value = ((value << 8) | byte) & 0xffff;
    bits += 8;

    while (bits >= 5) {
      output += BASE32[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }

  if (bits > 0) {
    output += BASE32[(value << (5 - bits)) & 31];
  }

  return output;
};

const fromBase32 = (text) => {
  const bytes = [];
  let value = 0;
  let bits = 0;

  for (const char of text.replace(/[\s=]/g, "").toUpperCase()) {
    const index = BASE32.indexOf(char);
    if (index === -1) {
      throw new Error("Invalid base32 secret");
    }

    value = ((value << 5) | index) & 0xffff;
    bits += 5;

    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }

  return Buffer.from(bytes);
};

// RFC 4226 HOTP value for one counter
const hotp = (secret, counter) => {
  const message = Buffer.alloc(8);
  message.writeBigUInt64BE(BigInt(counter));

  const digest = crypto.createHmac("sha1", secret).update(message).digest();
  const offset = digest[digest.length - 1] & 0x0f;
  const binary = digest.readUInt32BE(offset) & 0x7fffffff;

  return String(binary % 10 ** DIGITS).padStart(DIGITS, "0");
};

const timeStep = (now = Date.now()) => Math.floor(now / 1000 / STEP_SECONDS);

const generateSecret = () => toBase32(crypto.randomBytes(20));

const generateCode = (base32Secret, now = Date.now()) =>
  hotp(fromBase32(base32Secret), timeStep(now));

// Returns the time step the code belongs to, or null. The previous and next step are
// accepted to allow for clock drift; steps up to `afterStep` are refused (already used).
const verifyCode = (base32Secret, code, { now = Date.now(), afterStep = -1 } = {}) => {
  if (!/^\d{6}$/.test(code)) {
    return null;
  }

  const secret = fromBase32(base32Secret);
  const current = timeStep(now);

  for (const step of [current - 1, current, current + 1]) {
    if (step > afterStep && crypto.timingSafeEqual(Buffer.from(hotp(secret, step)), Buffer.from(code))) {
      return step;
    }
  }

  return null;
};

// What authenticator apps read from the QR code
const otpauthUrl = ({ secret, account, issuer }) =>
  `otpauth://totp/${encodeURIComponent(`${issuer}:${account}`)}?` +
  new URLSearchParams({ secret, issuer, algorithm: "SHA1", digits: String(DIGITS), period: String(STEP_SECONDS) });

module.exports = {
  toBase32,
  fromBase32,
  hotp,
  generateSecret,
  generateCode,
  verifyCode,
  otpauthUrl,
};
