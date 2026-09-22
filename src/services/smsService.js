const sendSMS = async ({ recipient, message }) => {
  console.log("Sending SMS...");
  console.log("Recipient:", recipient);
  console.log("Message:", message);

  return {
    success: true,
    message: "SMS sent successfully",
  };
};

module.exports = {
  sendSMS,
};