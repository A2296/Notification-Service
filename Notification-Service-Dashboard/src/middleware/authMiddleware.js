const jwt = require("jsonwebtoken");
const mongoose = require("mongoose");
const User = require("../models/userSchema");

// Dashboard authentication: "Authorization: Bearer <JWT>" from /api/v1/auth/login
const authMiddleware = async (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({
      success: false,
      message: "Authentication token is required",
    });
  }

  const token = authHeader.split(" ")[1];

  let decoded;
  try {
    decoded = jwt.verify(token, process.env.JWT_SECRET);
  } catch (error) {
    return res.status(401).json({
      success: false,
      message: "Invalid or expired token",
    });
  }

  // Load the user so deleted users and suspended businesses lose access immediately
  const user = mongoose.isValidObjectId(decoded.id)
    ? await User.findById(decoded.id).populate("business")
    : null;

  if (!user) {
    return res.status(401).json({
      success: false,
      message: "Invalid or expired token",
    });
  }

  if (user.business && user.business.status !== "ACTIVE") {
    return res.status(403).json({
      success: false,
      message: "Business account is suspended",
    });
  }

  req.user = {
    id: user._id,
    role: user.role,
    business: user.business ? user.business._id : null,
  };
  req.business = user.business || null;
  req.authMethod = "jwt";

  next();
};

module.exports = authMiddleware;
