const config = require("../../config");
const createConsoleProvider = require("./consoleProvider");
const createSmtpProvider = require("./smtpProvider");
const createTwilioProvider = require("./twilioProvider");
const inAppProvider = require("./inAppProvider");

// Providers are created once, lazily, so a misconfigured provider fails loudly
// on first use and tests can override them with setProvider().
const providers = {};

const buildProvider = (channel) => {
  if (channel === "EMAIL") {
    return config.email.provider === "smtp"
      ? createSmtpProvider(config.email)
      : createConsoleProvider("EMAIL");
  }

  if (channel === "SMS") {
    return config.sms.provider === "twilio"
      ? createTwilioProvider(config.sms, config.publicBaseUrl)
      : createConsoleProvider("SMS");
  }

  if (channel === "IN_APP") {
    return inAppProvider;
  }

  throw new Error(`Unsupported channel: ${channel}`);
};

const getProvider = (channel) => {
  if (!providers[channel]) {
    providers[channel] = buildProvider(channel);
  }

  return providers[channel];
};

const setProvider = (channel, provider) => {
  providers[channel] = provider;
};

module.exports = {
  getProvider,
  setProvider,
};
