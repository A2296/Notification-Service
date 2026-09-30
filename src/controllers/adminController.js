const mongoose = require("mongoose");
const Business = require("../models/businessSchema");
const HttpError = require("../utils/httpError");
const audit = require("../utils/audit");
const notificationService = require("../services/notificationService");
const usageService = require("../services/usageService");

// Platform administration (role ADMIN). Businesses never reach these routes.

const listBusinesses = async (req, res) => {
  const { page, limit, status, plan } = req.validated.query;
  const query = {
    ...(status ? { status } : {}),
    // Businesses created before plans existed have no plan field and are on FREE
    ...(plan ? { plan: plan === "FREE" ? { $in: ["FREE", null] } : plan } : {}),
  };

  const [businesses, total] = await Promise.all([
    Business.find(query)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit),
    Business.countDocuments(query),
  ]);

  res.status(200).json({
    success: true,
    businesses,
    pagination: {
      currentPage: page,
      itemsPerPage: limit,
      totalItems: total,
      totalPages: Math.ceil(total / limit),
    },
  });
};

// Suspending a business immediately blocks its API keys and dashboard logins.
// Changing its plan changes its monthly notification limit at once.
const updateBusiness = async (req, res) => {
  const { status, plan } = req.validated.body;
  const business = await Business.findByIdAndUpdate(
    req.validated.params.id,
    { ...(status ? { status } : {}), ...(plan ? { plan } : {}) },
    { returnDocument: "after", runValidators: true }
  );

  if (!business) {
    throw new HttpError(404, "Business not found");
  }

  if (status) {
    audit("admin.business.status", req, {
      adminId: req.user.id,
      businessId: business._id,
      status: business.status,
    });
  }

  if (plan) {
    audit("admin.business.plan", req, {
      adminId: req.user.id,
      businessId: business._id,
      plan: business.plan,
    });
  }

  res.status(200).json({
    success: true,
    business,
  });
};

const getAllNotifications = async (req, res) => {
  const { businessId, ...filters } = req.validated.query;
  const baseQuery = businessId ? { business: businessId } : {};

  const result = await notificationService.listNotifications(baseQuery, filters);

  res.status(200).json({
    success: true,
    ...result,
  });
};

const getPlatformStats = async (req, res) => {
  const [stats, businesses] = await Promise.all([
    notificationService.getStats({}),
    Business.countDocuments(),
  ]);

  res.status(200).json({
    success: true,
    stats: { ...stats, businesses },
  });
};

// Stats for one business (aggregate $match needs a real ObjectId)
const getBusinessStats = async (req, res) => {
  const businessId = new mongoose.Types.ObjectId(req.validated.params.id);

  const [stats, usage] = await Promise.all([
    notificationService.getStats({ business: businessId }),
    usageService.getUsage(businessId),
  ]);

  res.status(200).json({
    success: true,
    stats,
    usage,
  });
};

module.exports = {
  listBusinesses,
  updateBusiness,
  getAllNotifications,
  getPlatformStats,
  getBusinessStats,
};
