const mongoose = require("mongoose");

// NoSQL injection is prevented by validating every request with zod
// (src/middleware/validate.js), so user input can only ever be plain strings/numbers.

const connectDB = async () => {
  try {
    const conn = await mongoose.connect(process.env.DB_CONNECTION_STRING);
    console.log(`MongoDB Connected: ${conn.connection.host}`);
  } catch (error) {
    console.error(`Error: ${error.message}`);
    process.exit(1);
  }
};
module.exports = connectDB;
