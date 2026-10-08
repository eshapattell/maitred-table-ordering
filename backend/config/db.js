// db.js: MongoDB connection configuration for maitred
import mongoose from 'mongoose';

/**
 * Connect to MongoDB using MONGO_URI from environment variables.
 * Logs success on connection or exits process with a clear message on error.
 */
const connectDB = async () => {
  try {
    if (!process.env.MONGO_URI) {
      throw new Error('MONGO_URI is not defined in environment variables');
    }
    const conn = await mongoose.connect(process.env.MONGO_URI);
    console.log(`[maitred] MongoDB connected: ${conn.connection.host}`);
  } catch (error) {
    console.error(`[maitred] MongoDB connection error: ${error.message}`);
    process.exit(1);
  }
};

export default connectDB;
