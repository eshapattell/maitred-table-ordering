// authRoutes.js: Authentication routes for staff and owner in maitred
import express from 'express';
import { login, me, createStaff } from '../controllers/authController.js';
import { protect, requireRole } from '../middleware/authMiddleware.js';

const router = express.Router();

// Public login route for owners and kitchen staff
router.post('/login', login);

// Protected profile route
router.get('/me', protect, me);

// Owner-only route to create kitchen staff accounts
router.post('/staff', protect, requireRole('owner'), createStaff);

export default router;
