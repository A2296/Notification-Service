const sendInAppNotification = async ({ recipient, subject, message }) => {
  console.log("Creating in-app notification...");
  console.log("Recipient:", recipient);
  console.log("Subject:", subject);
  console.log("Message:", message);

  return {
    success: true,
    message: "In-app notification created successfully",
  };
};

module.exports = {
  sendInAppNotification,
};