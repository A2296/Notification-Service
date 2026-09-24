// Thrown by providers. permanent=true means retrying will not help
// (invalid number, rejected address), so the worker fails it immediately.
class DeliveryError extends Error {
  constructor(message, { permanent = false } = {}) {
    super(message);
    this.permanent = permanent;
  }
}

module.exports = DeliveryError;
