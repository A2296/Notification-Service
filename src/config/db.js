const mongoose = require("mongoose");

// Strip query operators like {"$ne": null} from user-supplied filter values
// to prevent NoSQL injection (e.g. in login)
mongoose.set("sanitizeFilter", true);

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
