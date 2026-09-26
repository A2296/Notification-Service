// Security audit trail: one JSON line per sensitive action, so log platforms can search
// and alert on it. Never pass passwords, tokens, API secrets or message content here.
const audit = (event, req, details = {}) => {
  if (process.env.NODE_ENV === "test") {
    return;
  }

  console.info(
    JSON.stringify({
      type: "audit",
      event,
      at: new Date().toISOString(),
      ip: req.ip,
      ...details,
    })
  );
};

module.exports = audit;
