const express = require("express");
const helmet = require("helmet");
const cors = require("cors");
const mongoose = require("mongoose");

const app = express();

// Behind a load balancer/proxy (Render, Railway, Nginx) set TRUST_PROXY=1
// so rate limiting sees the real client IP
if (process.env.TRUST_PROXY) {
  app.set("trust proxy", Number(process.env.TRUST_PROXY) || process.env.TRUST_PROXY);
}

app.use(helmet());
app.use(express.json({ limit: "100kb" }));

// Integrations are server-to-server, so browsers are blocked from calling the API
// cross-origin unless a dashboard origin is explicitly allowed:
// CORS_ORIGIN=https://dashboard.example.com,https://admin.example.com
app.use(
  cors({
    origin: process.env.CORS_ORIGIN
      ? process.env.CORS_ORIGIN.split(",").map((origin) => origin.trim())
      : false,
  })
);

// Health check for Docker/CI/load balancers (not rate limited)
app.get("/health", (req, res) => {
  const dbConnected = mongoose.connection.readyState === 1;
  res.status(dbConnected ? 200 : 503).json({
    status: dbConnected ? "ok" : "degraded",
    database: dbConnected ? "connected" : "disconnected",
  });
});

// Interactive API documentation at /docs, raw spec at /openapi.json
app.use(require("./src/docs"));

const { ipLimiter } = require("./src/middleware/rateLimiters");
app.use("/api", ipLimiter);

app.use("/api/v1", require("./src/routes"));

app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: "Route not found",
  });
});

const errorMiddleware = require("./src/middleware/errorMiddleware");
app.use(errorMiddleware);

module.exports = app;
