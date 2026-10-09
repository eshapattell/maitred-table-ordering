// authMiddleware.js: Staff authentication and role verification for maitred
import mongoose from 'mongoose';
import User from '../models/User.js';
import { verifyToken } from '../utils/generateToken.js';

/**
 * Protect middleware: validates Bearer token and verifies user from database.
 * Responds 401 directly without disclosing verification failure reasons.
 */
export const protect = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || typeof authHeader !== 'string' || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ message: 'Not authorised' });
  }

  const token = authHeader.slice(7).trim();
  if (!token) {
    return res.status(401).json({ message: 'Not authorised' });
  }

  let payload;
  try {
    payload = verifyToken(token);
  } catch {
    return res.status(401).json({ message: 'Not authorised' });
  }

  // Reject invalid MongoDB ObjectId subjects immediately without database querying
  if (!payload || !payload.sub || !mongoose.isValidObjectId(payload.sub)) {
    return res.status(401).json({ message: 'Not authorised' });
  }

  try {
    const user = await User.findById(payload.sub).select('-passwordHash');
    if (!user) {
      return res.status(401).json({ message: 'Not authorised' });
    }

    // Attach authoritative database user properties to request
    req.user = {
      id: String(user._id),
      name: user.name,
      email: user.email,
      role: user.role,
      restaurantId: String(user.restaurantId),
    };

    next();
  } catch (err) {
    next(err);
  }
};

/**
 * Role authorization middleware: ensures authenticated user possesses required role.
 * Responds 403 Forbidden directly if role is not authorized.
 *
 * @param {...string} roles - Authorized roles ('owner', 'kitchen')
 */
export const requireRole = (...roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ message: 'Not authorised' });
    }
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ message: 'Forbidden' });
    }
    next();
  };
};
