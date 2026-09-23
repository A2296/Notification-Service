const express = require("express");
const helmet = require("helmet");
const cors = require("cors");
const rateLimit = require("express-rate-limit");
const mongoose = require("mongoose");

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: Number(process.env.RATE_LIMIT_MAX) || 100,
  message: {
    success: false,
    message: "Too many requests, please try again later.",
  },
});

const app = express();

app.use(helmet());
app.use(express.json());
app.use(cors());

// Health check for Docker/CI/load balancers (not rate limited)
app.get("/health", (req, res) => {
  const dbConnected = mongoose.connection.readyState === 1;
  res.status(dbConnected ? 200 : 503).json({
    status: dbConnected ? "ok" : "degraded",
    database: dbConnected ? "connected" : "disconnected",
  });
});

app.use("/api", apiLimiter);

const authRoutes = require("./src/routes/authRoutes");
app.use("/api/auth", authRoutes);

const notificationRoutes = require("./src/routes/notificationRoutes");
app.use("/api/notifications", notificationRoutes);

const adminRoutes = require("./src/routes/adminRoutes");
app.use("/api/admin", adminRoutes);

app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: "Route not found",
  });
});

const errorMiddleware = require("./src/middleware/errorMiddleware");
app.use(errorMiddleware);

module.exports = app;
