const crypto = require("node:crypto");

// API secrets are 32 random bytes, so a fast SHA-256 hash is sufficient
// (bcrypt is only needed for low-entropy human passwords)
const hashSecret = (secret) =>
  crypto.createHash("sha256").update(secret).digest("hex");

const generateApiKey = () => {
  const keyId = `ns_pk_${crypto.randomBytes(12).toString("hex")}`;
  const secret = `ns_sk_${crypto.randomBytes(32).toString("hex")}`;

  return {
    keyId,
    secret,
    secretHash: hashSecret(secret),
    secretLast4: secret.slice(-4),
  };
};

const secretMatches = (secret, expectedHash) => {
  const actual = Buffer.from(hashSecret(secret), "hex");
  const expected = Buffer.from(expectedHash, "hex");
  return (
    actual.length === expected.length &&
    crypto.timingSafeEqual(actual, expected)
  );
};

module.exports = {
  generateApiKey,
  secretMatches,
};
