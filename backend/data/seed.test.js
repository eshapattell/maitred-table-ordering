// seed.test.js: Rigorous verification of menu seed dataset, safety rules, and idempotent database seeding
import fs from 'fs';
import request from 'supertest';
import mongoose from 'mongoose';
import { app } from '../server.js';
import { connectTestDb, clearTestDb, disconnectTestDb } from '../config/testDb.js';
import MenuItem from '../models/MenuItem.js';
import Restaurant from '../models/Restaurant.js';
import User from '../models/User.js';
import Table from '../models/Table.js';
import { assertSeedAllowed, seedDatabase } from './seed.js';
import { buildEligiblePool } from '../utils/buildEligiblePool.js';

describe('Seed Dataset & Seeder Engine', () => {
  // Hard-coded taxonomy lists to ensure app bugs cannot mask data issues
  const HARDCODED_ALLERGENS = [
    'peanut',
    'tree nut',
    'dairy',
    'egg',
    'gluten',
    'soy',
    'fish',
    'shellfish',
    'sesame',
    'mustard',
  ];

  const HARDCODED_COURSES = ['starter', 'main', 'side', 'dessert', 'beverage'];
  const HARDCODED_PORTIONS = ['light', 'regular', 'large'];
  const HARDCODED_FLAVOURS = ['sweet', 'tangy', 'creamy', 'crispy', 'light'];

  const rawMenu = JSON.parse(
    fs.readFileSync(new URL('./menu.json', import.meta.url), 'utf8')
  );

  describe('Part 1: Static menu.json Data Integrity (No DB)', () => {
    test('menu.json is an array of exactly 24 dishes with unique case-insensitive names', () => {
      expect(Array.isArray(rawMenu)).toBe(true);
      expect(rawMenu).toHaveLength(24);

      const names = new Set();
      for (const dish of rawMenu) {
        const lower = dish.name.toLowerCase();
        expect(names.has(lower)).toBe(false);
        names.add(lower);
      }
    });

    test('every dish has valid fields, types, and passes Mongoose validation', () => {
      for (const dish of rawMenu) {
        expect(typeof dish.name).toBe('string');
        expect(dish.name.trim().length).toBeGreaterThanOrEqual(1);
        expect(dish.name.trim().length).toBeLessThanOrEqual(80);

        expect(typeof dish.description).toBe('string');
        expect(dish.description.length).toBeLessThanOrEqual(160);

        expect(typeof dish.price).toBe('number');
        expect(Number.isFinite(dish.price)).toBe(true);
        expect(dish.price).toBeGreaterThanOrEqual(250);
        expect(dish.price).toBeLessThanOrEqual(2800);

        expect(typeof dish.category).toBe('string');
        expect(typeof dish.isVeg).toBe('boolean');

        expect(Array.isArray(dish.allergens)).toBe(true);
        for (const tag of dish.allergens) {
          expect(HARDCODED_ALLERGENS).toContain(tag);
        }

        expect(typeof dish.spiceLevel).toBe('number');
        expect(Number.isInteger(dish.spiceLevel)).toBe(true);
        expect(dish.spiceLevel).toBeGreaterThanOrEqual(1);
        expect(dish.spiceLevel).toBeLessThanOrEqual(5);

        expect(Array.isArray(dish.flavourTags)).toBe(true);
        for (const ft of dish.flavourTags) {
          expect(HARDCODED_FLAVOURS).toContain(ft);
        }

        expect(HARDCODED_COURSES).toContain(dish.course);
        expect(HARDCODED_PORTIONS).toContain(dish.portionSize);

        expect(typeof dish.prepMinutes).toBe('number');
        expect(Number.isInteger(dish.prepMinutes)).toBe(true);
        expect(dish.prepMinutes).toBeGreaterThanOrEqual(1);
        expect(dish.prepMinutes).toBeLessThanOrEqual(120);

        expect(dish.available).toBe(true);
        expect(dish.allergensConfirmed).toBe(true);

        const dummyItem = new MenuItem({
          ...dish,
          restaurantId: new mongoose.Types.ObjectId(),
        });
        const err = dummyItem.validateSync();
        expect(err).toBeUndefined();
      }
    });

    test('coverage: all 10 allergens represented, >= 4 empty allergen dishes, >= 6 veg, >= 6 non-veg, >= 2 in starter/main/dessert/beverage', () => {
      const usedAllergens = new Set();
      let emptyAllergenCount = 0;
      let vegCount = 0;
      let nonVegCount = 0;
      const courseCounts = { starter: 0, main: 0, dessert: 0, beverage: 0, side: 0 };

      for (const dish of rawMenu) {
        if (dish.allergens.length === 0) {
          emptyAllergenCount++;
        }
        for (const a of dish.allergens) {
          usedAllergens.add(a);
        }
        if (dish.isVeg) {
          vegCount++;
        } else {
          nonVegCount++;
        }
        courseCounts[dish.course] = (courseCounts[dish.course] || 0) + 1;
      }

      for (const allergen of HARDCODED_ALLERGENS) {
        expect(usedAllergens.has(allergen)).toBe(true);
      }

      expect(emptyAllergenCount).toBeGreaterThanOrEqual(4);
      expect(vegCount).toBeGreaterThanOrEqual(6);
      expect(nonVegCount).toBeGreaterThanOrEqual(6);

      expect(courseCounts.starter).toBeGreaterThanOrEqual(2);
      expect(courseCounts.main).toBeGreaterThanOrEqual(2);
      expect(courseCounts.dessert).toBeGreaterThanOrEqual(2);
      expect(courseCounts.beverage).toBeGreaterThanOrEqual(2);
    });

    test('veg consistency: no isVeg dish contains fish or shellfish or meat/seafood keywords', () => {
      const meatRegex = /\b(chicken|lamb|mutton|beef|pork|duck|prawns?|shrimps?|fish|salmon|tuna|crab|lobster|bacon|ham|anchov\w*)\b/i;

      for (const dish of rawMenu) {
        if (dish.isVeg) {
          expect(dish.allergens).not.toContain('fish');
          expect(dish.allergens).not.toContain('shellfish');

          const text = `${dish.name} ${dish.description}`;
          expect(meatRegex.test(text)).toBe(false);
        }
      }
    });

    describe('Ingredient safety net checks', () => {
      const rules = [
        {
          allergen: 'dairy',
          keywords: [
            'milk', 'cream', 'butter', 'ghee', 'cheese', 'paneer', 'yoghurt',
            'yogurt', 'curd', 'dahi', 'khoya', 'mawa', 'mascarpone', 'ricotta',
            'parmesan', 'mozzarella', 'burrata', 'custard', 'kheer', 'rabri',
            'malai', 'labneh', 'cheesecake', 'buttermilk', 'buttercream', 'milkshake',
          ],
          exceptions: [
            'coconut milk', 'coconut cream', 'cocoa butter', 'almond milk',
            'oat milk', 'soy milk', 'butternut', 'peanut butter', 'nut butter',
          ],
        },
        {
          allergen: 'egg',
          keywords: ['egg', 'eggs', 'mayonnaise', 'mayo', 'aioli', 'meringue', 'custard'],
          exceptions: [],
        },
        {
          allergen: 'gluten',
          keywords: [
            'wheat', 'flour', 'bread', 'naan', 'roti', 'paratha', 'kulcha',
            'pasta', 'noodle', 'noodles', 'semolina', 'suji', 'couscous',
            'breadcrumb', 'breadcrumbs', 'pastry', 'biscuit', 'cake', 'barley',
            'rye', 'tortilla', 'pizza', 'maida', 'panko', 'croissant',
            'brioche', 'focaccia', 'gnocchi', 'ravioli', 'tempura',
          ],
          exceptions: [
            'rice flour', 'chickpea flour', 'gram flour', 'besan', 'almond flour',
            'corn flour', 'cornflour', 'buckwheat flour', 'tapioca flour',
            'coconut flour', 'potato flour',
          ],
        },
        {
          allergen: 'tree nut',
          keywords: [
            'almond', 'almonds', 'cashew', 'cashews', 'pistachio', 'pistachios',
            'walnut', 'walnuts', 'hazelnut', 'hazelnuts', 'pecan', 'pecans',
            'macadamia', 'pine nut', 'pine nuts', 'chestnut', 'chestnuts',
            'marzipan', 'praline', 'nutella',
          ],
          exceptions: [],
        },
        {
          allergen: 'peanut',
          keywords: ['peanut', 'peanuts', 'groundnut', 'groundnuts'],
          exceptions: [],
        },
        {
          allergen: 'soy',
          keywords: ['soy', 'soya', 'tofu', 'edamame', 'miso', 'tempeh', 'teriyaki'],
          exceptions: [],
        },
        {
          allergen: 'fish',
          keywords: [
            'fish', 'salmon', 'tuna', 'cod', 'haddock', 'sardine', 'sardines',
            'anchovy', 'anchovies', 'mackerel', 'trout', 'bass', 'pomfret',
            'hilsa', 'bhetki', 'snapper', 'halibut', 'worcestershire',
          ],
          exceptions: [],
        },
        {
          allergen: 'shellfish',
          keywords: [
            'prawn', 'prawns', 'shrimp', 'shrimps', 'crab', 'lobster',
            'scallop', 'scallops', 'mussel', 'mussels', 'oyster', 'oysters',
            'clam', 'clams', 'squid', 'calamari', 'crayfish', 'langoustine',
          ],
          exceptions: [],
        },
        {
          allergen: 'sesame',
          keywords: ['sesame', 'tahini', 'til', 'gingelly'],
          exceptions: [],
        },
        {
          allergen: 'mustard',
          keywords: ['mustard', 'sarson', 'kasundi'],
          exceptions: [],
        },
      ];

      test.each(rules)('ingredient check for %s', ({ allergen, keywords, exceptions }) => {
        for (const dish of rawMenu) {
          let text = `${dish.name} ${dish.description}`.toLowerCase();
          for (const exc of exceptions) {
            text = text.replace(new RegExp(`\\b${exc}\\b`, 'gi'), ' ');
          }
          for (const kw of keywords) {
            const regex = new RegExp(`\\b${kw}\\b`, 'i');
            if (regex.test(text)) {
              expect(dish.allergens).toContain(allergen);
            }
          }
        }
      });
    });

    describe('assertSeedAllowed safety validations', () => {
      test('allows ("maitred", "development")', () => {
        expect(() => assertSeedAllowed('maitred', 'development')).not.toThrow();
      });

      test('throws for "test" dbName', () => {
        expect(() => assertSeedAllowed('test', 'development')).toThrow();
      });

      test('throws for "maitred_test" dbName ending with _test', () => {
        expect(() => assertSeedAllowed('maitred_test', 'development')).toThrow();
      });

      test('throws for empty dbName', () => {
        expect(() => assertSeedAllowed('', 'development')).toThrow();
      });

      test('throws for production nodeEnv', () => {
        expect(() => assertSeedAllowed('maitred', 'production')).toThrow();
      });
    });
  });

  describe('Part 2: Seed Database Operations (Real DB)', () => {
    let seedResult;

    beforeAll(async () => {
      await connectTestDb();
      await clearTestDb();
      process.env.JWT_SECRET = 'a_very_secret_test_key_for_seed_32char';

      seedResult = await seedDatabase({
        ownerPassword: 'SeedPass-123',
        kitchenPassword: 'SeedPass-456',
        bcryptCost: 4,
      });
    });

    afterAll(async () => {
      await disconnectTestDb();
    });

    test('creates restaurant, owner, kitchen, tables 1-6 with 32-hex tokens, and 24 menu items', async () => {
      expect(seedResult.created.users).toBe(2);
      expect(seedResult.created.tables).toBe(6);
      expect(seedResult.created.menuItems).toBe(24);

      const restaurant = await Restaurant.findById(seedResult.restaurantId);
      expect(restaurant).not.toBeNull();

      const owner = await User.findOne({ email: 'owner@demo.local' });
      expect(owner.role).toBe('owner');
      expect(String(owner.restaurantId)).toBe(String(seedResult.restaurantId));
      expect(String(restaurant.ownerId)).toBe(String(owner._id));

      const kitchen = await User.findOne({ email: 'kitchen@demo.local' });
      expect(kitchen.role).toBe('kitchen');
      expect(String(kitchen.restaurantId)).toBe(String(seedResult.restaurantId));

      const tables = await Table.find({ restaurantId: seedResult.restaurantId }).sort({ number: 1 });
      expect(tables).toHaveLength(6);
      for (let i = 0; i < 6; i++) {
        expect(tables[i].number).toBe(i + 1);
        expect(tables[i].qrToken).toMatch(/^[0-9a-f]{32}$/);
      }

      const items = await MenuItem.find({ restaurantId: seedResult.restaurantId });
      expect(items).toHaveLength(24);
      for (const item of items) {
        expect(item.allergensConfirmed).toBe(true);
        expect(String(item.restaurantId)).toBe(String(seedResult.restaurantId));
        // Allergens array is sorted
        const sortedAllergens = [...item.allergens].sort();
        expect(item.allergens).toEqual(sortedAllergens);
      }
    });

    test('idempotence: second run creates 0 entities, preserves table tokens and owner passwordHash', async () => {
      const ownerBefore = await User.findOne({ email: 'owner@demo.local' });
      const tablesBefore = await Table.find({ restaurantId: seedResult.restaurantId });

      const run2 = await seedDatabase({
        ownerPassword: 'SeedPass-123',
        kitchenPassword: 'SeedPass-456',
        bcryptCost: 4,
      });

      expect(run2.created.users).toBe(0);
      expect(run2.created.tables).toBe(0);
      expect(run2.created.menuItems).toBe(0);
      expect(run2.totals).toEqual(seedResult.totals);

      const ownerAfter = await User.findOne({ email: 'owner@demo.local' });
      expect(ownerAfter.passwordHash).toBe(ownerBefore.passwordHash);

      const tablesAfter = await Table.find({ restaurantId: seedResult.restaurantId });
      for (let i = 0; i < 6; i++) {
        expect(tablesAfter[i].qrToken).toBe(tablesBefore[i].qrToken);
      }
    });

    test('seeded owner logs in with seed password through POST /api/auth/login; wrong password gives 401', async () => {
      const resSuccess = await request(app)
        .post('/api/auth/login')
        .send({ email: 'owner@demo.local', password: 'SeedPass-123' });

      expect(resSuccess.status).toBe(200);
      expect(resSuccess.body.token).toBeDefined();

      const resFail = await request(app)
        .post('/api/auth/login')
        .send({ email: 'owner@demo.local', password: 'WrongPassword999' });

      expect(resFail.status).toBe(401);
    });

    test('missing password throws in seedDatabase', async () => {
      await expect(seedDatabase({ kitchenPassword: 'SeedPass-456' })).rejects.toThrow();
    });

    test('password with 7 characters (too short) throws in seedDatabase', async () => {
      await expect(
        seedDatabase({ ownerPassword: 'short12', kitchenPassword: 'SeedPass-456' })
      ).rejects.toThrow();
    });

    test('password with 73 bytes (too long) throws in seedDatabase', async () => {
      await expect(
        seedDatabase({
          ownerPassword: 'a'.repeat(73),
          kitchenPassword: 'SeedPass-456',
        })
      ).rejects.toThrow();
    });


    test('GET /api/menu/:restaurantId returns exactly the 24 seeded items', async () => {
      const res = await request(app).get(`/api/menu/${seedResult.restaurantId}`);
      expect(res.status).toBe(200);
      expect(res.body.items).toHaveLength(24);
    });

    test('seeded menu through safety core (buildEligiblePool)', async () => {
      const allItems = await MenuItem.find({ restaurantId: seedResult.restaurantId }).lean();

      // Guest allergic to peanut
      const peanutFreePool = buildEligiblePool(
        { allergies: ['peanut'] },
        allItems
      );
      expect(peanutFreePool.length).toBeGreaterThan(0);
      for (const item of peanutFreePool) {
        expect(item.allergens).not.toContain('peanut');
      }

      // Guest allergic to all ten allergens gets exactly the allergen-free dishes (at least 4)
      const allAllergicPool = buildEligiblePool(
        { allergies: HARDCODED_ALLERGENS },
        allItems
      );
      expect(allAllergicPool.length).toBeGreaterThanOrEqual(4);
      for (const item of allAllergicPool) {
        expect(item.allergens).toHaveLength(0);
      }

      // Guest with no allergies gets all 24
      const unrestrictedPool = buildEligiblePool(
        { allergies: [] },
        allItems
      );
      expect(unrestrictedPool).toHaveLength(24);
    });
  });
});
