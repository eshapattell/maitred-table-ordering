// testFixtures.js: Test fixtures generator for integration tests
import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import mongoose from 'mongoose';
import User from '../models/User.js';
import Restaurant from '../models/Restaurant.js';
import { generateToken } from '../utils/generateToken.js';

/**
 * Creates multi-restaurant test fixtures with authenticated owners and kitchen users.
 * Strictly checks that the active database is an isolated test database.
 *
 * @returns {Promise<Object>} Fixture entities and their signed JWT tokens
 */
export const createFixtures = async () => {
  const connectionName = mongoose.connection.name;
  if (!connectionName || !connectionName.endsWith('_test')) {
    throw new Error(
      `Refusing to generate fixtures: current database "${connectionName}" is not an isolated test database.`
    );
  }

  // Ensure JWT_SECRET is configured to a valid test string for token generation
  process.env.JWT_SECRET = 'test_jwt_secret_fixtures_32bytes_min';

  const uid = crypto.randomUUID();
  const passwordHash = bcrypt.hashSync('TestPassword123', 4);

  // 1. Restaurant A: primary restaurant with owner and kitchen accounts
  const restaurantA = await Restaurant.create({
    name: `Restaurant A ${uid.slice(0, 8)}`,
  });

  const ownerA = await User.create({
    name: 'Owner A',
    email: `owner_a_${uid}@maitred.test`,
    passwordHash,
    role: 'owner',
    restaurantId: restaurantA._id,
  });

  restaurantA.ownerId = ownerA._id;
  await restaurantA.save();

  const kitchenA = await User.create({
    name: 'Kitchen A',
    email: `kitchen_a_${uid}@maitred.test`,
    passwordHash,
    role: 'kitchen',
    restaurantId: restaurantA._id,
  });

  const ownerAToken = generateToken(ownerA);
  const kitchenAToken = generateToken(kitchenA);

  // 2. Restaurant B: secondary restaurant to prove cross-tenant data isolation
  const restaurantB = await Restaurant.create({
    name: `Restaurant B ${uid.slice(0, 8)}`,
  });

  const ownerB = await User.create({
    name: 'Owner B',
    email: `owner_b_${uid}@maitred.test`,
    passwordHash,
    role: 'owner',
    restaurantId: restaurantB._id,
  });

  restaurantB.ownerId = ownerB._id;
  await restaurantB.save();

  const ownerBToken = generateToken(ownerB);

  return {
    restaurantA,
    ownerA,
    kitchenA,
    ownerAToken,
    kitchenAToken,
    restaurantB,
    ownerB,
    ownerBToken,
  };
};
