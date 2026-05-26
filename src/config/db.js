const mongoose = require('mongoose');
const { logger } = require('../utils/logger');

async function connectToDatabase() {
 
  const mongoUri = process.env.MONGODB_URI;

  if (!mongoUri) {
    logger.error('FATAL ERROR: MONGODB_URI is not defined in .env file');
    process.exit(1); // Stop the app immediately
  }

  mongoose.set('strictQuery', true);

  try {

    await mongoose.connect(mongoUri, {
      maxPoolSize: 10,       // Maintain up to 10 socket connections
      serverSelectionTimeoutMS: 5000, // Keep trying to send operations for 5 seconds
      socketTimeoutMS: 45000, // Close sockets after 45 seconds of inactivity
    });
    
    logger.info('Connected to MongoDB Successfully');

    mongoose.connection.on('error', (err) => {
      logger.error('MongoDB runtime error', { error: err });
    });

    mongoose.connection.on('disconnected', () => {
      logger.warn('MongoDB disconnected. Attempting to reconnect...');
    });

  } catch (error) {
    logger.error('MongoDB connection error', { error: error.message });
    throw error; 
  }
}

module.exports = { connectToDatabase };