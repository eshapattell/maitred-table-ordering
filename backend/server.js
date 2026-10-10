// server.js: Entry point (Express + HTTP server + Socket.io) for maitred
import http from 'http';
import express from 'express';
import { Server as SocketIOServer } from 'socket.io';
import dotenv from 'dotenv';
import cors from 'cors';
import helmet from 'helmet';

import connectDB from './config/db.js';
import authRoutes from './routes/authRoutes.js';
import restaurantRoutes from './routes/restaurantRoutes.js';
import tableRoutes from './routes/tableRoutes.js';
import menuRoutes from './routes/menuRoutes.js';
import sessionRoutes from './routes/sessionRoutes.js';
import { notFound, errorHandler } from './middleware/errorMiddleware.js';
import { assertJwtSecret } from './utils/generateToken.js';

// Load environment variables from .env
dotenv.config();

// Initialize Express app
const app = express();

// Create HTTP server wrapping Express
const server = http.createServer(app);

// Client URL configuration for CORS
const clientUrl = process.env.CLIENT_URL || 'http://localhost:5173';

// Attach Socket.io to HTTP server with CORS restricted to CLIENT_URL (no handlers yet)
const io = new SocketIOServer(server, {
  cors: {
    origin: clientUrl,
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
  },
});

// Security and request parsing middleware
app.use(helmet());
app.use(cors({ origin: clientUrl }));
app.use(express.json());

// Health check route
app.get('/api/health', (req, res) => {
  res.status(200).json({ status: 'ok', app: 'maitred' });
});

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/restaurants', restaurantRoutes);
app.use('/api/tables', tableRoutes);
app.use('/api/menu', menuRoutes);
app.use('/api/sessions', sessionRoutes);

// 404 and central error handling middleware
app.use(notFound);
app.use(errorHandler);

// Port configuration
const PORT = process.env.PORT || 5000;

// Connect to MongoDB on startup, then listen on PORT (only when not in test mode)
const startServer = async () => {
  // A server configuration mistake must fail loudly at startup and must never be reported to every client as "not authorised"
  try {
    assertJwtSecret();
  } catch (err) {
    console.error(err.message);
    process.exit(1);
  }

  await connectDB();
  server.listen(PORT, () => {
    console.log(`[maitred] Server listening on port ${PORT}`);
  });
};

if (process.env.NODE_ENV !== 'test') {
  startServer();
}

export { app, server, io, startServer };
