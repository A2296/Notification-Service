const usageService = require("../services/usageService");

// Public: the plans on offer, shown on the dashboard's Help and Settings pages.
// A platform admin assigns a business's plan; there are no payments.
const listPlans = (req, res) => {
  res.status(200).json({
    success: true,
    plans: usageService.listPlans(),
  });
};

module.exports = {
  listPlans,
};
