const config = require("../config");

// The dashboard's JWT lives in an HttpOnly cookie, so browser JavaScript (and any
// injected script) can never read it. Integrations and Swagger use the Bearer header.
const SESSION_COOKIE = "ns_session";

const cookieOptions = (req) => ({
  httpOnly: true,
  // Browsers accept Secure cookies on http://localhost, so production can always require it
  secure: req.secure || config.isProduction,
  sameSite: "strict",
  path: "/api",
});

const readSessionCookie = (req) => {
  const header = req.headers.cookie;

  if (typeof header !== "string") {
    return null;
  }

  for (const pair of header.split(";")) {
    const separator = pair.indexOf("=");
    if (separator !== -1 && pair.slice(0, separator).trim() === SESSION_COOKIE) {
      try {
        return decodeURIComponent(pair.slice(separator + 1).trim()) || null;
      } catch {
        return null;
      }
    }
  }

  return null;
};

const setSessionCookie = (req, res, token, expiresAt) => {
  res.cookie(SESSION_COOKIE, token, { ...cookieOptions(req), expires: expiresAt });
};

const clearSessionCookie = (req, res) => {
  res.clearCookie(SESSION_COOKIE, cookieOptions(req));
};

module.exports = {
  SESSION_COOKIE,
  readSessionCookie,
  setSessionCookie,
  clearSessionCookie,
};
