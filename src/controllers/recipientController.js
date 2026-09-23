const Recipient = require("../models/recipientSchema");
const HttpError = require("../utils/httpError");
const notificationService = require("../services/notificationService");

const escapeRegex = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, String.raw`\$&`);

// Create or update (upsert) so businesses can simply sync their user list
const upsertRecipient = async (req, res) => {
  const { externalId, ...fields } = req.validated.body;
  const filter = { business: req.business._id, externalId };

  const existed = await Recipient.exists(filter);

  // Equality fields in the filter are copied onto the new document on insert
  const recipient = await Recipient.findOneAndUpdate(filter, fields, {
    upsert: true,
    returnDocument: "after",
    runValidators: true,
  });

  res.status(existed ? 200 : 201).json({
    success: true,
    message: existed ? "Recipient updated" : "Recipient created",
    recipient,
  });
};

const listRecipients = async (req, res) => {
  const { page, limit, search } = req.validated.query;
  const query = { business: req.business._id };

  if (search) {
    const pattern = new RegExp(escapeRegex(search), "i");
    query.$or = [{ externalId: pattern }, { name: pattern }, { email: pattern }, { phone: pattern }];
  }

  const [recipients, total] = await Promise.all([
    Recipient.find(query)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit),
    Recipient.countDocuments(query),
  ]);

  res.status(200).json({
    success: true,
    recipients,
    pagination: {
      currentPage: page,
      itemsPerPage: limit,
      totalItems: total,
      totalPages: Math.ceil(total / limit),
    },
  });
};

const findRecipient = async (req) => {
  const recipient = await Recipient.findOne({
    business: req.business._id,
    externalId: req.validated.params.externalId,
  });

  if (!recipient) {
    throw new HttpError(404, "Recipient not found");
  }

  return recipient;
};

const getRecipient = async (req, res) => {
  res.status(200).json({
    success: true,
    recipient: await findRecipient(req),
  });
};

const updateRecipient = async (req, res) => {
  const recipient = await findRecipient(req);

  recipient.set(req.validated.body);
  await recipient.save();

  res.status(200).json({
    success: true,
    message: "Recipient updated",
    recipient,
  });
};

// Removes the contact details (e.g. for a GDPR erasure request).
// Notification history is kept for auditing.
const deleteRecipient = async (req, res) => {
  const recipient = await findRecipient(req);
  await recipient.deleteOne();

  res.status(200).json({
    success: true,
    message: "Recipient deleted",
  });
};

const getInbox = async (req, res) => {
  const result = await notificationService.getInbox(
    req.business._id,
    req.validated.params.externalId,
    req.validated.query
  );

  res.status(200).json({
    success: true,
    ...result,
  });
};

module.exports = {
  upsertRecipient,
  listRecipients,
  getRecipient,
  updateRecipient,
  deleteRecipient,
  getInbox,
};
