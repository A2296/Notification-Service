const crypto = require("node:crypto");

// Encrypts small secrets that must be readable later (two-factor keys), so a copy of the
// database alone is not enough to generate sign-in codes. AES-256-GCM, keyed from
// MFA_ENCRYPTION_KEY, or from JWT_SECRET when that is not set.
const keys = new Map();

const currentKey = () => {
  const material = process.env.MFA_ENCRYPTION_KEY || process.env.JWT_SECRET;

  if (!keys.has(material)) {
    keys.set(
      material,
      Buffer.from(crypto.hkdfSync("sha256", material, "notification-service", "secret-box:v1", 32))
    );
  }

  return keys.get(material);
};

const seal = (plaintext) => {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", currentKey(), iv);
  const data = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);

  return ["v1", ...[iv, cipher.getAuthTag(), data].map((part) => part.toString("base64"))].join(".");
};

const open = (sealed) => {
  const [version, iv, tag, data] = sealed.split(".");

  if (version !== "v1") {
    throw new Error("Unsupported secret format");
  }

  const decipher = crypto.createDecipheriv("aes-256-gcm", currentKey(), Buffer.from(iv, "base64"));
  decipher.setAuthTag(Buffer.from(tag, "base64"));

  return Buffer.concat([decipher.update(Buffer.from(data, "base64")), decipher.final()]).toString("utf8");
};

module.exports = {
  seal,
  open,
};
