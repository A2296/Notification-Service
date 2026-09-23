const dotenv = require("dotenv");
dotenv.config({ quiet: true });

const requiredEnv = ["DB_CONNECTION_STRING", "JWT_SECRET"];
const missingEnv = requiredEnv.filter((key) => !process.env[key]);

if (missingEnv.length > 0) {
  console.error(
    `Missing required environment variables: ${missingEnv.join(", ")}. See .env.example`
  );
  process.exit(1);
}

const app = require("../app");
const connectDB = require("./config/db");

const PORT = process.env.PORT || 5000;

const start = async () => {
  await connectDB();

  app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
  });
};

start();
