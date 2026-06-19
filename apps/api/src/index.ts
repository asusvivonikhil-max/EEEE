import dotenv from 'dotenv';
// Load environment variables before anything else
dotenv.config();

import mongoose from 'mongoose';
import app from './app';
import { config } from './config/env';
import { connectDB } from './config/database';

let server: any;

const startServer = async () => {
  // Connect to database
  await connectDB();

  const PORT = config.server.port;
  server = app.listen(PORT, () => {
    console.log(`✅ Server running in [${config.env}] mode on port ${PORT}`);
  });
};

startServer().catch((error) => {
  console.error('❌ Server failed to start:', error);
  process.exit(1);
});

// Process level error handlers
process.on('unhandledRejection', (reason: any) => {
  console.error('❌ UNHANDLED PROMISE REJECTION:', reason);
  if (server) {
    server.close(() => process.exit(1));
  } else {
    process.exit(1);
  }
});

process.on('uncaughtException', (err: any) => {
  console.error('❌ UNCAUGHT EXCEPTION — Shutting down:', {
    message: err.message,
    stack: err.stack,
  });
  process.exit(1);
});

process.on('SIGTERM', () => {
  console.log('⚠️ SIGTERM received — shutting down gracefully');
  if (server) {
    server.close(() => {
      mongoose.connection.close(false).then(() => {
        console.log('MongoDB connection closed');
        process.exit(0);
      });
    });
  } else {
    process.exit(0);
  }
});
