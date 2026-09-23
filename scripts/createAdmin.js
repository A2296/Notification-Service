// Creates (or promotes) an ADMIN user so the /api/admin routes can be used.
// Usage: ADMIN_EMAIL=admin@example.com ADMIN_PASSWORD=ChangeMe123 npm run seed:admin
const dotenv = require("dotenv");
dotenv.config({ quiet: true });

const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const User = require("../src/models/userSchema");

const run = async () => {
  const email = (process.env.ADMIN_EMAIL || "").toLowerCase().trim();
  const password = process.env.ADMIN_PASSWORD;
  const name = process.env.ADMIN_NAME || "Administrator";

  if (!email || !password || password.length < 8) {
    console.error(
      "Set ADMIN_EMAIL and ADMIN_PASSWORD (min 8 chars) in the environment or .env"
    );
    process.exit(1);
  }

  await mongoose.connect(process.env.DB_CONNECTION_STRING);

  const hashedPassword = await bcrypt.hash(password, 10);

  const user = await User.findOneAndUpdate(
    { email },
    { name, email, password: hashedPassword, role: "ADMIN" },
    { upsert: true, new: true }
  );

  console.log(`Admin user ready: ${user.email}`);

  await mongoose.disconnect();
};

run().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
