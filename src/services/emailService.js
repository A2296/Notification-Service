const sendEmail = async ({ recipient, subject, message }) => {
  console.log("Sending email...");
  console.log("Recipient:", recipient);
  console.log("Subject:", subject);
  console.log("Message:", message);

  return {
    success: true,
    message: "Email sent successfully",
  };
};

module.exports = {
  sendEmail,
};