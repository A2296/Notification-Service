const mongoose = require("mongoose");
const Business = require("../models/businessSchema");
const HttpError = require("../utils/httpError");
const audit = require("../utils/audit");
const notificationService = require("../services/notificationService");

// Platform administration (role ADMIN). Businesses never reach these routes.

const listBusinesses = async (req, res) => {
  const { page, limit, status } = req.validated.query;
  const query = status ? { status } : {};

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

// Suspending a business immediately blocks its API keys and dashboard logins
const updateBusinessStatus = async (req, res) => {
  const business = await Business.findByIdAndUpdate(
    req.validated.params.id,
    { status: req.validated.body.status },
    { returnDocument: "after" }
  );

  if (!business) {
    throw new HttpError(404, "Business not found");
  }

  audit("admin.business.status", req, {
    adminId: req.user.id,
    businessId: business._id,
    status: business.status,
  });

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

  res.status(200).json({
    success: true,
    stats: await notificationService.getStats({ business: businessId }),
  });
};

module.exports = {
  listBusinesses,
  updateBusinessStatus,
  getAllNotifications,
  getPlatformStats,
  getBusinessStats,
};
