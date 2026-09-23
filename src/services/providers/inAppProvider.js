// In-app notifications are "delivered" as soon as they are stored in the
// recipient's inbox. The business's app fetches them via
// GET /api/v1/recipients/:externalId/inbox and marks them read.
const inAppProvider = {
  name: "in_app",

  send: async () => ({
    status: "DELIVERED",
    providerMessageId: null,
  }),
};

module.exports = inAppProvider;
