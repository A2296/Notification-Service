const Business = require("../models/businessSchema");
const Notification = require("../models/notificationSchema");
const HttpError = require("../utils/httpError");
const config = require("../config");

// Monthly notification limits from each business's plan. Usage is counted from the
// notifications themselves (every one created this calendar month, UTC), so it can never
// drift from what was actually accepted. Automatic or manual retries and repeated
// (idempotent) requests create no new notification, so they do not count.

const planFor = (id) => {
  const key = config.plans[id] ? id : "FREE";
  return { id: key, ...config.plans[key] };
};

const listPlans = () => Object.keys(config.plans).map(planFor);

// The calendar month (UTC) that contains `now`
const currentPeriod = (now = new Date()) => ({
  start: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)),
  end: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1)),
});

const getUsage = async (businessId, now = new Date()) => {
  const { start, end } = currentPeriod(now);

  const [business, used] = await Promise.all([
    Business.findById(businessId).select("plan"),
    Notification.countDocuments({ business: businessId, createdAt: { $gte: start } }),
  ]);

  const plan = planFor(business?.plan);
  const limit = plan.monthlyNotifications;

  return {
    plan,
    limit,
    used,
    // A business moved to a smaller plan can be over its new limit
    remaining: Math.max(limit - used, 0),
    periodStart: start,
    resetsAt: end,
  };
};

const formatDay = (date) =>
  date.toLocaleDateString("en-GB", { day: "numeric", month: "long", timeZone: "UTC" });

// 429 like the per-minute limits, with a code so clients can tell the two apart
const limitReachedError = (usage) =>
  new HttpError(
    429,
    `Monthly notification limit reached: the ${usage.plan.name} plan includes ` +
      `${usage.limit.toLocaleString("en-US")} notifications per month. ` +
      `It resets on ${formatDay(usage.resetsAt)}.`,
    "MONTHLY_LIMIT_REACHED"
  );

module.exports = {
  planFor,
  listPlans,
  currentPeriod,
  getUsage,
  limitReachedError,
};
