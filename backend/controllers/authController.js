// authController.js: Staff authentication controller for maitred
import bcrypt from 'bcryptjs';
import User from '../models/User.js';
import { generateToken } from '../utils/generateToken.js';

// Pre-computed dummy hash so timing attacks cannot reveal which emails exist in the database
const DUMMY_HASH = bcrypt.hashSync('dummy_password_timing_pad', 10);

/**
 * Sanitizes a user document to return only public, safe fields.
 * Guarantees passwordHash is never leaked in API responses.
 *
 * @param {Object} user - User document
 * @returns {Object} Public user object
 */
const publicUser = (user) => ({
  id: String(user.id ?? user._id),
  name: user.name,
  email: user.email,
  role: user.role,
  restaurantId: String(user.restaurantId),
});

/**
 * Staff login handler for owners and kitchen users.
 * Validates credentials and returns a signed JWT token.
 */
export const login = async (req, res, next) => {
  try {
    const body = req.body || {};
    const { email, password } = body;

    // Viva note: Email must strictly be validated as a non-empty string.
    // If an attacker sends an object such as { "$ne": null }, a raw MongoDB query
    // would otherwise match any existing user and compromise system security.
    if (
      typeof email !== 'string' ||
      typeof password !== 'string' ||
      email.trim().length === 0 ||
      email.trim().length > 254 ||
      Buffer.byteLength(password, 'utf8') < 1 ||
      Buffer.byteLength(password, 'utf8') > 72
    ) {
      return res.status(400).json({ message: 'Email and password are required' });
    }

    const normalisedEmail = email.trim().toLowerCase();
    const user = await User.findOne({ email: normalisedEmail });

    // Compare against the user password or against DUMMY_HASH to prevent timing attacks
    const hashToCompare = user ? user.passwordHash : DUMMY_HASH;
    const isMatch = await bcrypt.compare(password, hashToCompare);

    if (!user || !isMatch) {
      return res.status(401).json({ message: 'Invalid email or password' });
    }

    const token = generateToken(user);
    res.status(200).json({
      token,
      user: publicUser(user),
    });
  } catch (err) {
    next(err);
  }
};

/**
 * Current user profile handler. Returns authenticated user from database.
 */
export const me = (req, res) => {
  res.status(200).json({ user: req.user });
};

/**
 * Owner-only handler to provision new kitchen staff accounts for the owner's restaurant.
 */
export const createStaff = async (req, res, next) => {
  try {
    const body = req.body || {};
    const { name, email, password } = body;

    // Validate name: string, trimmed, 1 to 60 characters
    if (typeof name !== 'string' || name.trim().length < 1 || name.trim().length > 60) {
      return res.status(400).json({ message: 'Invalid name' });
    }

    // Validate email: string, trimmed, lowercase, at most 254 chars, regex match
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (
      typeof email !== 'string' ||
      email.trim().length === 0 ||
      email.trim().length > 254 ||
      !emailRegex.test(email.trim().toLowerCase())
    ) {
      return res.status(400).json({ message: 'Invalid email' });
    }

    // Validate password: string of at least 8 chars and at most 72 bytes
    if (
      typeof password !== 'string' ||
      password.length < 8 ||
      Buffer.byteLength(password, 'utf8') > 72
    ) {
      return res.status(400).json({ message: 'Invalid password' });
    }

    const normalisedName = name.trim();
    const normalisedEmail = email.trim().toLowerCase();

    // Check if email already registered
    const existing = await User.findOne({ email: normalisedEmail });
    if (existing) {
      return res.status(409).json({ message: 'Email already in use' });
    }

    const passwordHash = await bcrypt.hash(password, 10);

    // Always create staff with role "kitchen" and assign to the owner's restaurant
    const created = await User.create({
      name: normalisedName,
      email: normalisedEmail,
      passwordHash,
      role: 'kitchen',
      restaurantId: req.user.restaurantId,
    });

    res.status(201).json({ user: publicUser(created) });
  } catch (err) {
    // Map duplicate key errors to 409 Conflict
    if (err && err.code === 11000) {
      return res.status(409).json({ message: 'Email already in use' });
    }
    next(err);
  }
};
