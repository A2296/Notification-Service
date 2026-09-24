// Development provider: logs instead of sending, so the service works without
// any third-party accounts. Enabled by EMAIL_PROVIDER=console / SMS_PROVIDER=console.
const createConsoleProvider = (channel) => ({
  name: "console",

  send: async (notification) => {
    if (process.env.NODE_ENV !== "test") {
      console.log(
        `[${channel}] to=${notification.to} subject=${notification.subject || "-"} message=${notification.message}`
      );
    }

    return {
      status: "SENT",
      providerMessageId: `console-${notification._id}`,
    };
  },
});

module.exports = createConsoleProvider;
