// Throw from controllers/services to send a client error through errorMiddleware
class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

module.exports = HttpError;
