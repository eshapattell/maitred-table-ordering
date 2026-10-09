// seed.js: Idempotent database seeder for maitred demo data
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';
import mongoose from 'mongoose';

import Restaurant from '../models/Restaurant.js';
import User from '../models/User.js';
import Table from '../models/Table.js';
import MenuItem from '../models/MenuItem.js';
import { KNOWN_ALLERGENS, normaliseAllergen, normaliseAllergies } from '../utils/allergyFilter.js';

/**
 * Asserts whether database seeding is permitted in the current environment.
 *
 * @param {string} dbName
 * @param {string} nodeEnv
 */
export const assertSeedAllowed = (dbName, nodeEnv) => {
  // Viva note: Demo accounts must never be seeded into a deployed database,
  // and an Atlas URI without a database name silently uses "test".
  if (!dbName || typeof dbName !== 'string' || dbName.trim() === '') {
    throw new Error('Seed rejected: database name is empty');
  }
  if (dbName === 'test') {
    throw new Error('Seed rejected: database name is "test" (default unnamed Atlas URI)');
  }
  if (dbName.endsWith('_test')) {
    throw new Error('Seed rejected: cannot seed test database');
  }
  if (nodeEnv === 'production') {
    throw new Error('Seed rejected: cannot seed in production environment');
  }
};

/**
 * Validates password format: string, 8 to 72 bytes.
 *
 * @param {string} pwd
 * @returns {boolean}
 */
const isValidPassword = (pwd) => {
  if (typeof pwd !== 'string' || pwd.length < 8) {
    return false;
  }
  const byteLength = Buffer.byteLength(pwd, 'utf8');
  return byteLength <= 72;
};

/**
 * Seeds the database idempotently with a demo restaurant, staff users, dining tables, and menu.
 *
 * @param {Object} options
 * @param {string} options.ownerPassword
 * @param {string} options.kitchenPassword
 * @param {string} [options.restaurantName="Demo Fine Dining"]
 * @param {number} [options.tableCount=6]
 * @param {number} [options.bcryptCost=10]
 * @param {Array<Object>} [options.menu]
 * @returns {Promise<{ restaurantId: mongoose.Types.ObjectId, created: { users: number, tables: number, menuItems: number }, totals: { users: number, tables: number, menuItems: number } }>}
 */
export const seedDatabase = async ({
  ownerPassword,
  kitchenPassword,
  restaurantName = 'Demo Fine Dining',
  tableCount = 6,
  bcryptCost = 10,
  menu,
} = {}) => {
  if (mongoose.connection.readyState !== 1) {
    throw new Error('Seed requires an active mongoose connection');
  }

  if (!isValidPassword(ownerPassword) || !isValidPassword(kitchenPassword)) {
    throw new Error(
      'Passwords must be strings between 8 characters and 72 bytes'
    );
  }

  let dishes = menu;
  if (!dishes) {
    const raw = fs.readFileSync(new URL('./menu.json', import.meta.url), 'utf8');
    dishes = JSON.parse(raw);
  }

  const created = {
    users: 0,
    tables: 0,
    menuItems: 0,
  };

  // 1. Restaurant: find or create by name
  let restaurant = await Restaurant.findOne({ name: restaurantName });
  if (!restaurant) {
    restaurant = await Restaurant.create({ name: restaurantName });
  }
  const restaurantId = restaurant._id;

  // 2. Staff users: create when missing, never overwrite existing password hash
  let owner = await User.findOne({ email: 'owner@demo.local' });
  if (!owner) {
    const passwordHash = bcrypt.hashSync(ownerPassword, bcryptCost);
    owner = await User.create({
      name: 'Demo Owner',
      email: 'owner@demo.local',
      passwordHash,
      role: 'owner',
      restaurantId,
    });
    created.users++;
  }

  // Ensure restaurant ownerId links to the owner
  if (!restaurant.ownerId || String(restaurant.ownerId) !== String(owner._id)) {
    restaurant.ownerId = owner._id;
    await restaurant.save();
  }

  let kitchen = await User.findOne({ email: 'kitchen@demo.local' });
  if (!kitchen) {
    const passwordHash = bcrypt.hashSync(kitchenPassword, bcryptCost);
    kitchen = await User.create({
      name: 'Demo Kitchen',
      email: 'kitchen@demo.local',
      passwordHash,
      role: 'kitchen',
      restaurantId,
    });
    created.users++;
  }

  // 3. Tables 1 to tableCount: create when missing with unique 32-hex token
  for (let i = 1; i <= tableCount; i++) {
    const existingTable = await Table.findOne({ restaurantId, number: i });
    if (!existingTable) {
      const qrToken = crypto.randomBytes(16).toString('hex');
      await Table.create({
        restaurantId,
        number: i,
        qrToken,
      });
      created.tables++;
    }
  }

  // 4. Menu: validate all dishes before writing, then upsert
  for (const dish of dishes) {
    // Validate allergen array entries against KNOWN_ALLERGENS
    if (!Array.isArray(dish.allergens)) {
      throw new Error(`Dish "${dish.name}" has invalid allergens array`);
    }
    for (const tag of dish.allergens) {
      if (typeof tag !== 'string' || !KNOWN_ALLERGENS.includes(normaliseAllergen(tag))) {
        throw new Error(`Dish "${dish.name}" contains unknown allergen: ${tag}`);
      }
    }

    const testItem = new MenuItem({ ...dish, restaurantId });
    const validationError = testItem.validateSync();
    if (validationError) {
      throw new Error(`Dish "${dish.name}" failed validation: ${validationError.message}`);
    }
  }

  for (const dish of dishes) {
    const existing = await MenuItem.findOne({ restaurantId, name: dish.name });
    if (!existing) {
      created.menuItems++;
    }

    // Viva note: Re-running the seed resets the seeded dishes to the authoritative values in menu.json.
    const normalised = normaliseAllergies(dish.allergens);
    await MenuItem.updateOne(
      { restaurantId, name: dish.name },
      {
        $set: {
          ...dish,
          restaurantId,
          allergens: normalised,
        },
      },
      { upsert: true }
    );
  }

  const totals = {
    users: await User.countDocuments({ restaurantId }),
    tables: await Table.countDocuments({ restaurantId }),
    menuItems: await MenuItem.countDocuments({ restaurantId }),
  };

  return { restaurantId, created, totals };
};

// Direct command-line execution entry point
const isDirectExecution = () => {
  if (!process.argv[1]) return false;
  try {
    return path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
  } catch {
    return false;
  }
};

if (isDirectExecution()) {
  dotenv.config();

  const ownerPassword = process.env.SEED_OWNER_PASSWORD;
  const kitchenPassword = process.env.SEED_KITCHEN_PASSWORD;

  if (!isValidPassword(ownerPassword) || !isValidPassword(kitchenPassword)) {
    console.error(
      'Error: SEED_OWNER_PASSWORD and SEED_KITCHEN_PASSWORD must be configured and between 8 and 72 bytes.'
    );
    process.exit(1);
  }

  const mongoUri = process.env.MONGO_URI;
  if (!mongoUri) {
    console.error('Error: MONGO_URI is not set.');
    process.exit(1);
  }

  try {
    await mongoose.connect(mongoUri);
    assertSeedAllowed(mongoose.connection.name, process.env.NODE_ENV);

    const result = await seedDatabase({
      ownerPassword,
      kitchenPassword,
    });

    console.log(
      `[Seed Success] Users created: ${result.created.users} (total: ${result.totals.users}), Tables created: ${result.created.tables} (total: ${result.totals.tables}), Menu items created: ${result.created.menuItems} (total: ${result.totals.menuItems})`
    );
  } catch (err) {
    console.error(`[Seed Error] ${err.message}`);
    process.exitCode = 1;
  } finally {
    await mongoose.disconnect();
  }
}
