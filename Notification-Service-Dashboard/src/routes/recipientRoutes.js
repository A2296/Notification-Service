const express = require("express");

const router = express.Router();

const validate = require("../middleware/validate");
const {
  createRecipientBody,
  updateRecipientBody,
  externalIdParams,
  listRecipientsQuery,
  inboxQuery,
} = require("../validators/schemas");
const {
  upsertRecipient,
  listRecipients,
  getRecipient,
  updateRecipient,
  deleteRecipient,
  getInbox,
} = require("../controllers/recipientController");

// Mounted behind businessAuth (API key or dashboard JWT)

router.post("/", validate({ body: createRecipientBody }), upsertRecipient);

router.get("/", validate({ query: listRecipientsQuery }), listRecipients);

router.get("/:externalId", validate({ params: externalIdParams }), getRecipient);

router.patch(
  "/:externalId",
  validate({ params: externalIdParams, body: updateRecipientBody }),
  updateRecipient
);

router.delete("/:externalId", validate({ params: externalIdParams }), deleteRecipient);

router.get(
  "/:externalId/inbox",
  validate({ params: externalIdParams, query: inboxQuery }),
  getInbox
);

module.exports = router;
