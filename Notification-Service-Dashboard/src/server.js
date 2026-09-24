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

const mongoose = require("mongoose");
const app = require("../app");
const connectDB = require("./config/db");
const config = require("./config");
const deliveryWorker = require("./services/deliveryWorker");

const start = async () => {
  await connectDB();

  const server = app.listen(config.port, () => {
    console.log(`Server is running on port ${config.port}`);
    console.log(`API docs: http://localhost:${config.port}/docs`);
  });

  if (config.worker.enabled) {
    deliveryWorker.start();
  }

  // Graceful shutdown: platforms like Docker/Render send SIGTERM on redeploy
  const shutdown = async (signal) => {
    console.log(`${signal} received, shutting down`);
    server.close();
    await deliveryWorker.stop();
    await mongoose.disconnect();
    process.exit(0);
  };

  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
};

start();
