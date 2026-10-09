// generateToken.js: JWT token generation and verification for maitred staff
import jwt from 'jsonwebtoken';

/**
 * Validates and retrieves the JWT_SECRET from environment variables on demand.
 * Throws a clear error if missing or under 16 characters without leaking the secret value.
 *
 * @returns {string} The validated JWT secret
 */
const getSecret = () => {
  const secret = process.env.JWT_SECRET;
  if (!secret || typeof secret !== 'string' || secret.length < 16) {
    throw new Error('JWT_SECRET is missing or must be at least 16 characters long');
  }
  return secret;
};

/**
 * Generates a signed JWT token for a staff user (owner or kitchen).
 * Includes user id in the subject, along with role and restaurantId in payload.
 *
 * @param {Object} user - User document or object with id/_id, role, and restaurantId
 * @returns {string} Signed JWT token string
 */
export const generateToken = (user) => {
  const secret = getSecret();
  return jwt.sign(
    {
      role: user.role,
      restaurantId: String(user.restaurantId),
    },
    secret,
    {
      algorithm: 'HS256',
      subject: String(user.id ?? user._id),
      expiresIn: '12h',
    }
  );
};

/**
 * Verifies a JWT token signature and expiry using HS256.
 *
 * @param {string} token - The raw JWT token string
 * @returns {Object} Decoded token payload
 */
export const verifyToken = (token) => {
  const secret = getSecret();
  return jwt.verify(token, secret, {
    algorithms: ['HS256'],
  });
};
