const nodemailer = require("nodemailer");

const passwordResetEmail = async ({ email, token, baseUrl, emailConfig }) => {
  const url = new URL("/", baseUrl);
  url.searchParams.set("passwordResetToken", token);
  url.searchParams.set("email", email);

  const transporter = nodemailer.createTransport({
    host: emailConfig.smtp.host,
    port: emailConfig.smtp.port,
    secure: emailConfig.smtp.secure,
    auth: emailConfig.smtp.user ? { user: emailConfig.smtp.user, pass: emailConfig.smtp.pass } : undefined,
    connectionTimeout: 10000,
    greetingTimeout: 10000,
    socketTimeout: 20000,
  });

  try {
    await transporter.sendMail({
      from: emailConfig.from,
      to: email,
      subject: "Reset your NotifyFlow password",
      text: `Use this link to choose a new password. It expires in 30 minutes:\n\n${url.href}\n\nIf you did not request this, you can ignore this email.`,
    });
  } finally {
    transporter.close();
  }
};

module.exports = passwordResetEmail;
