const jwt = require("jsonwebtoken");
const mongoose = require("mongoose");
const User = require("../models/userSchema");
const config = require("../config");
const { readSessionCookie } = require("../utils/session");

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

const unauthorized = (res, message = "Invalid or expired token") =>
  res.status(401).json({
    success: false,
    message,
  });

// Dashboard authentication, either:
//   Authorization: Bearer <JWT>   (Swagger, scripts)
//   ns_session HttpOnly cookie    (the dashboard, set by /api/v1/auth/login)
const authMiddleware = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  const bearerToken = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
  const cookieToken = bearerToken ? null : readSessionCookie(req);
  const token = bearerToken || cookieToken;

  if (!token) {
    return unauthorized(res, "Authentication token is required");
  }

  // Browsers attach cookies automatically, so changes made with a cookie must also carry
  // a header that other sites cannot send without a (blocked) CORS preflight
  if (
    cookieToken &&
    !SAFE_METHODS.has(req.method) &&
    req.get("x-requested-with") !== "XMLHttpRequest"
  ) {
    return res.status(403).json({
      success: false,
      message: "X-Requested-With: XMLHttpRequest header is required",
    });
  }

  let decoded;
  try {
    decoded = jwt.verify(token, process.env.JWT_SECRET, {
      algorithms: [config.jwt.algorithm],
      issuer: config.jwt.issuer,
      audience: config.jwt.audience,
    });
  } catch (error) {
    return unauthorized(res);
  }

  // Load the user so deleted users and suspended businesses lose access immediately
  const user = mongoose.isValidObjectId(decoded.id)
    ? await User.findById(decoded.id).populate("business")
    : null;

  // A logout bumps tokenVersion, which retires every token issued before it
  if (!user || decoded.tv !== user.tokenVersion) {
    return unauthorized(res);
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
