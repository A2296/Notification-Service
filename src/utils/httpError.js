// Throw from controllers/services to send a client error through errorMiddleware.
// `code` (optional) is a stable machine-readable reason, e.g. "MONTHLY_LIMIT_REACHED".
class HttpError extends Error {
  constructor(status, message, code) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

module.exports = HttpError;
