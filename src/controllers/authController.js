const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const User = require("../models/userSchema");
const Business = require("../models/businessSchema");
const HttpError = require("../utils/httpError");
const config = require("../config");

const signToken = (user) =>
  jwt.sign({ id: user._id, role: user.role }, process.env.JWT_SECRET, {
    expiresIn: config.jwtExpiresIn,
  });

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

  res.status(201).json({
    success: true,
    message: "Business registered successfully. Create an API key to start sending notifications.",
    token: signToken(user),
    user: userResponse(user, business),
  });
};

const loginUser = async (req, res) => {
  const { email, password } = req.validated.body;

  const user = await User.findOne({ email }).populate("business");

  if (!user || !(await bcrypt.compare(password, user.password))) {
    throw new HttpError(401, "Invalid email or password");
  }

  if (user.business && user.business.status !== "ACTIVE") {
    throw new HttpError(403, "Business account is suspended");
  }

  res.status(200).json({
    success: true,
    message: "Login successful",
    token: signToken(user),
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

module.exports = {
  registerBusiness,
  loginUser,
  getMe,
};
