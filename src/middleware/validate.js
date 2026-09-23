// Validates req.body / req.query / req.params against zod schemas.
// Parsed (trimmed, coerced, defaulted) values are placed on req.validated.
// Because every field is type-checked here, user input can never smuggle
// MongoDB operators (e.g. {"$ne": null}) into queries.
const validate = (schemas) => (req, res, next) => {
  req.validated = req.validated || {};

  for (const [part, schema] of Object.entries(schemas)) {
    const input = part === "body" ? req.body || {} : req[part];
    const result = schema.safeParse(input);

    if (!result.success) {
      return res.status(400).json({
        success: false,
        message: "Validation failed",
        errors: result.error.issues.map((issue) => ({
          field: issue.path.join("."),
          message: issue.message,
        })),
      });
    }

    req.validated[part] = result.data;
  }

  next();
};

module.exports = validate;
