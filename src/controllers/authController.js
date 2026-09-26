const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const User = require("../models/userSchema");
const Business = require("../models/businessSchema");
const HttpError = require("../utils/httpError");
const config = require("../config");
const audit = require("../utils/audit");
const { setSessionCookie, clearSessionCookie } = require("../utils/session");

const signToken = (user) =>
  jwt.sign({ id: user._id, role: user.role, tv: user.tokenVersion }, process.env.JWT_SECRET, {
    algorithm: config.jwt.algorithm,
    expiresIn: config.jwt.expiresIn,
    issuer: config.jwt.issuer,
    audience: config.jwt.audience,
  });

// Issues a token as an HttpOnly cookie (dashboard) and returns it (API clients)
const startSession = (req, res, user) => {
  const token = signToken(user);
  setSessionCookie(req, res, token, new Date(jwt.decode(token).exp * 1000));
  return token;
};

const userResponse = (user, business) => ({
  id: user._id,
  name: user.name,
  email: user.email,
  role: user.role,
  business: business || null,
});

// Onboard a new business together with its first dashboard user
const registerBusiness = async (req, res) => {
  const { businessName, name, email, password } = req.validated.body;

  if (await User.exists({ email })) {
    throw new HttpError(409, "An account with this email already exists");
  }

  const business = await Business.create({ name: businessName, email });

  let user;
  try {
    user = await User.create({
      name,
      email,
      password: await bcrypt.hash(password, 10),
      business: business._id,
    });
  } catch (error) {
    // No multi-document transactions on a standalone MongoDB, so clean up manually
    await Business.deleteOne({ _id: business._id });
    if (error.code === 11000) {
      throw new HttpError(409, "An account with this email already exists");
    }
    throw error;
  }

  audit("auth.register", req, { userId: user._id, businessId: business._id });

  res.status(201).json({
    success: true,
    message: "Business registered successfully. Create an API key to start sending notifications.",
    token: startSession(req, res, user),
    user: userResponse(user, business),
  });
};

const loginUser = async (req, res) => {
  const { email, password } = req.validated.body;

  const user = await User.findOne({ email }).populate("business");

  if (!user || !(await bcrypt.compare(password, user.password))) {
    audit("auth.login.failure", req, { email });
    throw new HttpError(401, "Invalid email or password");
  }

  if (user.business && user.business.status !== "ACTIVE") {
    audit("auth.login.blocked", req, { userId: user._id, reason: "business suspended" });
    throw new HttpError(403, "Business account is suspended");
  }

  audit("auth.login.success", req, { userId: user._id });

  res.status(200).json({
    success: true,
    message: "Login successful",
    token: startSession(req, res, user),
    user: userResponse(user, user.business),
  });
};

const getMe = async (req, res) => {
  const user = await User.findById(req.user.id);

  res.status(200).json({
    success: true,
    user: userResponse(user, req.business),
  });
};

// Ends every session of the user: all previously issued tokens stop working at once
const logoutUser = async (req, res) => {
  await User.updateOne({ _id: req.user.id }, { $inc: { tokenVersion: 1 } });
  clearSessionCookie(req, res);
  audit("auth.logout", req, { userId: req.user.id });

  res.status(200).json({
    success: true,
    message: "Logged out",
  });
};

module.exports = {
  registerBusiness,
  loginUser,
  getMe,
  logoutUser,
};
