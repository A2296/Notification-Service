const HttpError = require("../utils/httpError");

const errorMiddleware = (err, req, res, next) => {
  // Malformed JSON body
  if (err.type === "entity.parse.failed") {
    return res.status(400).json({
      success: false,
      message: "Invalid JSON in request body",
    });
  }

  // Mongoose validation / cast errors are client errors, not server errors
  if (err.name === "ValidationError" || err.name === "CastError") {
    return res.status(400).json({
      success: false,
      message: "Invalid request data",
    });
  }

  // Unique index violation
  if (err.code === 11000) {
    return res.status(409).json({
      success: false,
      message: "Resource already exists",
    });
  }

  const status = err.status || err.statusCode || 500;

  if (status >= 500) {
    console.error(err.stack);
  }

  res.status(status).json({
    success: false,
    message: status >= 500 ? "Internal Server Error" : err.message,
    // Only our own client errors carry a reason code (never driver or system error codes)
    ...(status < 500 && err instanceof HttpError && err.code ? { code: err.code } : {}),
  });
};

module.exports = errorMiddleware;
