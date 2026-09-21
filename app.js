const express = require("express");
const helmet = require("helmet");
const cors = require("cors");
const rateLimit = require("express-rate-limit");

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: {
    success: false,
    message: "Too many requests, please try again later.",
  },
});



const app = express();

app.use(helmet());
app.use(express.json());
app.use(cors());


const authRoutes = require("./src/routes/authRoutes");
app.use("/api/auth", authRoutes);

const notificationRoutes = require("./src/routes/notificationRoutes");
app.use("/api/notifications", notificationRoutes);

const adminRoutes = require("./src/routes/adminRoutes");
app.use("/api/admin", adminRoutes);

const errorMiddleware = require("./src/middleware/errorMiddleware");
app.use(errorMiddleware);

module.exports = app;
