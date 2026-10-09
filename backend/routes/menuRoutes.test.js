// menuRoutes.test.js: Automated tests for menu routes and safety integration
import request from 'supertest';
import mongoose from 'mongoose';
import { app } from '../server.js';
import { connectTestDb, clearTestDb, disconnectTestDb } from '../config/testDb.js';
import { createFixtures } from '../config/testFixtures.js';
import MenuItem from '../models/MenuItem.js';
import Restaurant from '../models/Restaurant.js';
import { buildEligiblePool } from '../utils/buildEligiblePool.js';

describe('Menu Routes (/api/menu)', () => {
  let fixtures;

  const validDish = {
    name: 'Wild Mushroom Risotto',
    description: 'Arborio rice, wild forest mushrooms, thyme and vegetable broth',
    price: 750,
    category: 'Mains',
    isVeg: true,
    allergens: ['dairy'],
    spiceLevel: 1,
    flavourTags: ['creamy'],
    cuisine: 'Italian',
    course: 'main',
    portionSize: 'regular',
    prepMinutes: 25,
  };

  const expectedPublicKeys = [
    'allergens',
    'allergensConfirmed',
    'category',
    'course',
    'cuisine',
    'description',
    'flavourTags',
    'id',
    'isVeg',
    'name',
    'portionSize',
    'prepMinutes',
    'price',
    'spiceLevel',
  ].sort();

  beforeAll(async () => {
    await connectTestDb();
    await clearTestDb();
    fixtures = await createFixtures();
  });

  afterAll(async () => {
    await disconnectTestDb();
  });

  describe('GET /api/menu/:restaurantId (Public)', () => {
    let publicItemA;
    let unavailableItemA;
    let itemB;

    beforeAll(async () => {
      // Create available item in restaurant A
      const res1 = await request(app)
        .post('/api/menu')
        .set('Authorization', `Bearer ${fixtures.ownerAToken}`)
        .send({ ...validDish, name: 'Truffle Tagliatelle' });
      publicItemA = res1.body.item;

      // Create unavailable item in restaurant A
      const res2 = await request(app)
        .post('/api/menu')
        .set('Authorization', `Bearer ${fixtures.ownerAToken}`)
        .send({ ...validDish, name: 'Secret Off-Menu Special' });
      unavailableItemA = res2.body.item;
      await request(app)
        .patch(`/api/menu/${unavailableItemA.id}/availability`)
        .set('Authorization', `Bearer ${fixtures.ownerAToken}`)
        .send({ available: false });

      // Create item in restaurant B
      const res3 = await request(app)
        .post('/api/menu')
        .set('Authorization', `Bearer ${fixtures.ownerBToken}`)
        .send({ ...validDish, name: 'Restaurant B Special Dish' });
      itemB = res3.body.item;
    });

    test('returns 200 with only available items of specified restaurant', async () => {
      const res = await request(app).get(`/api/menu/${fixtures.restaurantA._id}`);
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.items)).toBe(true);

      const ids = res.body.items.map((i) => i.id);
      expect(ids).toContain(publicItemA.id);
      expect(ids).not.toContain(unavailableItemA.id);
      expect(ids).not.toContain(itemB.id);
    });

    test('each item has EXACTLY the publicMenuItem keys (no leaks)', async () => {
      const res = await request(app).get(`/api/menu/${fixtures.restaurantA._id}`);
      expect(res.status).toBe(200);
      expect(res.body.items.length).toBeGreaterThan(0);

      for (const item of res.body.items) {
        const keys = Object.keys(item).sort();
        expect(keys).toEqual(expectedPublicKeys);
        expect(item).not.toHaveProperty('restaurantId');
        expect(item).not.toHaveProperty('available');
        expect(item).not.toHaveProperty('__v');
        expect(item).not.toHaveProperty('createdAt');
        expect(item).not.toHaveProperty('updatedAt');
      }
    });

    test('unknown valid restaurantId returns 404', async () => {
      const unusedId = new mongoose.Types.ObjectId();
      const res = await request(app).get(`/api/menu/${unusedId}`);
      expect(res.status).toBe(404);
      expect(res.body.message).toBe('Not found');
    });

    test('invalid restaurantId format ("not-an-id", "123") returns 404', async () => {
      const res1 = await request(app).get('/api/menu/not-an-id');
      expect(res1.status).toBe(404);
      expect(res1.body.message).toBe('Not found');

      const res2 = await request(app).get('/api/menu/123');
      expect(res2.status).toBe(404);
      expect(res2.body.message).toBe('Not found');
    });

    test('works publicly without any token', async () => {
      const res = await request(app).get(`/api/menu/${fixtures.restaurantA._id}`);
      expect(res.status).toBe(200);
    });
  });

  describe('GET /api/menu (Owner & Kitchen Staff)', () => {
    test('owner gets all items of own restaurant including unavailable ones with available key', async () => {
      const res = await request(app)
        .get('/api/menu')
        .set('Authorization', `Bearer ${fixtures.ownerAToken}`);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.items)).toBe(true);
      const names = res.body.items.map((i) => i.name);
      expect(names).toContain('Truffle Tagliatelle');
      expect(names).toContain('Secret Off-Menu Special');
      expect(names).not.toContain('Restaurant B Special Dish');

      const unavailable = res.body.items.find((i) => i.name === 'Secret Off-Menu Special');
      expect(unavailable.available).toBe(false);
    });

    test('kitchen staff gets all items of own restaurant', async () => {
      const res = await request(app)
        .get('/api/menu')
        .set('Authorization', `Bearer ${fixtures.kitchenAToken}`);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.items)).toBe(true);
      const names = res.body.items.map((i) => i.name);
      expect(names).toContain('Truffle Tagliatelle');
      expect(names).toContain('Secret Off-Menu Special');
      expect(names).not.toContain('Restaurant B Special Dish');
    });

    test('no token returns 401', async () => {
      const res = await request(app).get('/api/menu');
      expect(res.status).toBe(401);
    });

    test('garbage token returns 401', async () => {
      const res = await request(app)
        .get('/api/menu')
        .set('Authorization', 'Bearer invalid.token.payload');
      expect(res.status).toBe(401);
    });
  });

  describe('POST /api/menu (Creation)', () => {
    test('happy path 201: ignores body allergensConfirmed and restaurantId, normalises allergens, defaults description', async () => {
      const res = await request(app)
        .post('/api/menu')
        .set('Authorization', `Bearer ${fixtures.ownerAToken}`)
        .send({
          ...validDish,
          name: 'Crispy Samosa Platter',
          description: undefined,
          allergensConfirmed: true,
          restaurantId: fixtures.restaurantB._id,
          allergens: [' Peanut ', 'SOY', 'soy'],
        });

      expect(res.status).toBe(201);
      const item = res.body.item;
      expect(item.name).toBe('Crispy Samosa Platter');
      expect(item.description).toBe('');
      expect(item.allergensConfirmed).toBe(false);
      expect(item.available).toBe(true);
      expect(item.allergens).toEqual(['peanut', 'soy']);

      // Stored check in database
      const stored = await MenuItem.findById(item.id).lean();
      expect(String(stored.restaurantId)).toBe(String(fixtures.restaurantA._id));
      expect(stored.allergensConfirmed).toBe(false);
    });

    test('happy path with explicit [] allergens is accepted', async () => {
      const res = await request(app)
        .post('/api/menu')
        .set('Authorization', `Bearer ${fixtures.ownerAToken}`)
        .send({
          ...validDish,
          name: 'Fresh Coconut Water',
          allergens: [],
          course: 'beverage',
        });

      expect(res.status).toBe(201);
      expect(res.body.item.allergens).toEqual([]);
    });

    test('missing allergens key returns 400', async () => {
      const { allergens, ...missingAllergens } = validDish;
      const res = await request(app)
        .post('/api/menu')
        .set('Authorization', `Bearer ${fixtures.ownerAToken}`)
        .send(missingAllergens);

      expect(res.status).toBe(400);
    });

    describe('POST bad input (test.each, each row 400)', () => {
      let countBefore;

      beforeAll(async () => {
        countBefore = await MenuItem.countDocuments();
      });

      const badInputs = [
        ['name empty string', { name: '' }],
        ['name 81 characters', { name: 'A'.repeat(81) }],
        ['name number', { name: 123 }],
        ['price 0', { price: 0 }],
        ['price -5', { price: -5 }],
        ['price string "100"', { price: '100' }],
        ['price null', { price: null }],
        ['price 100001', { price: 100001 }],
        ['category empty string', { category: '' }],
        ['isVeg string "true"', { isVeg: 'true' }],
        ['isVeg number 1', { isVeg: 1 }],
        ['allergens string "peanut"', { allergens: 'peanut' }],
        ['allergens [null]', { allergens: [null] }],
        ['allergens [123]', { allergens: [123] }],
        ['allergens ["peanuts"] unknown', { allergens: ['peanuts'] }],
        ['allergens ["wheat"] unknown', { allergens: ['wheat'] }],
        ['allergens 11 entries', { allergens: Array(11).fill('peanut') }],
        ['spiceLevel 0', { spiceLevel: 0 }],
        ['spiceLevel 6', { spiceLevel: 6 }],
        ['spiceLevel 2.5', { spiceLevel: 2.5 }],
        ['spiceLevel string "3"', { spiceLevel: '3' }],
        ['flavourTags ["spicy"] invalid', { flavourTags: ['spicy'] }],
        ['flavourTags string "sweet"', { flavourTags: 'sweet' }],
        ['cuisine empty string', { cuisine: '' }],
        ['course "brunch" invalid', { course: 'brunch' }],
        ['portionSize "huge" invalid', { portionSize: 'huge' }],
        ['prepMinutes 0', { prepMinutes: 0 }],
        ['prepMinutes 121', { prepMinutes: 121 }],
        ['prepMinutes 10.5', { prepMinutes: 10.5 }],
      ];

      test.each(badInputs)('rejects %s with 400', async (_desc, override) => {
        const res = await request(app)
          .post('/api/menu')
          .set('Authorization', `Bearer ${fixtures.ownerAToken}`)
          .send({ ...validDish, name: `Bad Input Dish ${_desc}`, ...override });

        expect(res.status).toBe(400);
      });

      test('asserts no new item was created across bad input tests', async () => {
        const countAfter = await MenuItem.countDocuments();
        expect(countAfter).toBe(countBefore);
      });
    });

    test('kitchen receives 403 Forbidden', async () => {
      const res = await request(app)
        .post('/api/menu')
        .set('Authorization', `Bearer ${fixtures.kitchenAToken}`)
        .send({ ...validDish, name: 'Kitchen Forbidden Item' });

      expect(res.status).toBe(403);
    });

    test('no token receives 401', async () => {
      const res = await request(app)
        .post('/api/menu')
        .send({ ...validDish, name: 'No Token Item' });

      expect(res.status).toBe(401);
    });
  });

  describe('PATCH /api/menu/:itemId (Partial Update)', () => {
    let testItem;

    beforeEach(async () => {
      const res = await request(app)
        .post('/api/menu')
        .set('Authorization', `Bearer ${fixtures.ownerAToken}`)
        .send({
          ...validDish,
          name: 'Patch Baseline Item',
          allergens: ['dairy'],
        });
      testItem = res.body.item;

      // Confirm allergens to start with allergensConfirmed: true
      await request(app)
        .post(`/api/menu/${testItem.id}/confirm-allergens`)
        .set('Authorization', `Bearer ${fixtures.ownerAToken}`)
        .send({ allergens: ['dairy'] });
    });

    test('price changes and persists', async () => {
      const res = await request(app)
        .patch(`/api/menu/${testItem.id}`)
        .set('Authorization', `Bearer ${fixtures.ownerAToken}`)
        .send({ price: 950 });

      expect(res.status).toBe(200);
      expect(res.body.item.price).toBe(950);
      expect(res.body.item.allergensConfirmed).toBe(true);

      const stored = await MenuItem.findById(testItem.id).lean();
      expect(stored.price).toBe(950);
    });

    test('allergens changed on a confirmed item reset allergensConfirmed to false', async () => {
      const res = await request(app)
        .patch(`/api/menu/${testItem.id}`)
        .set('Authorization', `Bearer ${fixtures.ownerAToken}`)
        .send({ allergens: ['dairy', 'gluten'] });

      expect(res.status).toBe(200);
      expect(res.body.item.allergens).toEqual(['dairy', 'gluten']);
      expect(res.body.item.allergensConfirmed).toBe(false);

      const stored = await MenuItem.findById(testItem.id).lean();
      expect(stored.allergensConfirmed).toBe(false);
    });

    test('same allergens in another order and case keep true AND leave stored allergens field untouched', async () => {
      // Set a raw array directly in db to ensure exact array reference / ordering
      await MenuItem.updateOne({ _id: testItem.id }, { $set: { allergens: ['dairy'] } });

      const res = await request(app)
        .patch(`/api/menu/${testItem.id}`)
        .set('Authorization', `Bearer ${fixtures.ownerAToken}`)
        .send({ allergens: [' DAIRY '] });

      expect(res.status).toBe(200);
      expect(res.body.item.allergensConfirmed).toBe(true);

      const stored = await MenuItem.findById(testItem.id).lean();
      expect(stored.allergensConfirmed).toBe(true);
      expect(stored.allergens).toEqual(['dairy']);
    });

    test('an edit that sends unchanged allergens plus a new price changes only the price', async () => {
      const res = await request(app)
        .patch(`/api/menu/${testItem.id}`)
        .set('Authorization', `Bearer ${fixtures.ownerAToken}`)
        .send({ allergens: ['dairy'], price: 1100 });

      expect(res.status).toBe(200);
      expect(res.body.item.price).toBe(1100);
      expect(res.body.item.allergensConfirmed).toBe(true);
    });

    test('body containing available, restaurantId and allergensConfirmed changes none of them (and alone gives 400)', async () => {
      const res = await request(app)
        .patch(`/api/menu/${testItem.id}`)
        .set('Authorization', `Bearer ${fixtures.ownerAToken}`)
        .send({
          available: false,
          restaurantId: fixtures.restaurantB._id,
          allergensConfirmed: false,
        });

      expect(res.status).toBe(400);
      expect(res.body.message).toBe('Nothing to update');

      const stored = await MenuItem.findById(testItem.id).lean();
      expect(stored.available).toBe(true);
      expect(String(stored.restaurantId)).toBe(String(fixtures.restaurantA._id));
      expect(stored.allergensConfirmed).toBe(true);
    });

    test('price -1 and allergens ["peanuts"] give 400', async () => {
      const res1 = await request(app)
        .patch(`/api/menu/${testItem.id}`)
        .set('Authorization', `Bearer ${fixtures.ownerAToken}`)
        .send({ price: -1 });
      expect(res1.status).toBe(400);

      const res2 = await request(app)
        .patch(`/api/menu/${testItem.id}`)
        .set('Authorization', `Bearer ${fixtures.ownerAToken}`)
        .send({ allergens: ['peanuts'] });
      expect(res2.status).toBe(400);
    });

    test('empty body gives 400', async () => {
      const res = await request(app)
        .patch(`/api/menu/${testItem.id}`)
        .set('Authorization', `Bearer ${fixtures.ownerAToken}`)
        .send({});
      expect(res.status).toBe(400);
      expect(res.body.message).toBe('Nothing to update');
    });

    test("restaurant B's item returns 404 and unchanged", async () => {
      const itemB = await MenuItem.create({
        ...validDish,
        restaurantId: fixtures.restaurantB._id,
        name: 'Item In Restaurant B',
      });

      const res = await request(app)
        .patch(`/api/menu/${itemB._id}`)
        .set('Authorization', `Bearer ${fixtures.ownerAToken}`)
        .send({ price: 2000 });

      expect(res.status).toBe(404);
      expect(res.body.message).toBe('Not found');

      const stored = await MenuItem.findById(itemB._id).lean();
      expect(stored.price).toBe(validDish.price);
    });

    test('"not-an-id" returns 404', async () => {
      const res = await request(app)
        .patch('/api/menu/not-an-id')
        .set('Authorization', `Bearer ${fixtures.ownerAToken}`)
        .send({ price: 100 });
      expect(res.status).toBe(404);
    });

    test('kitchen receives 403', async () => {
      const res = await request(app)
        .patch(`/api/menu/${testItem.id}`)
        .set('Authorization', `Bearer ${fixtures.kitchenAToken}`)
        .send({ price: 100 });
      expect(res.status).toBe(403);
    });

    test('no token receives 401', async () => {
      const res = await request(app)
        .patch(`/api/menu/${testItem.id}`)
        .send({ price: 100 });
      expect(res.status).toBe(401);
    });
  });

  describe('POST /api/menu/:itemId/confirm-allergens', () => {
    let unconfirmedItem;

    beforeEach(async () => {
      const res = await request(app)
        .post('/api/menu')
        .set('Authorization', `Bearer ${fixtures.ownerAToken}`)
        .send({
          ...validDish,
          name: 'Confirmation Test Dish',
          allergens: ['dairy', 'gluten'],
        });
      unconfirmedItem = res.body.item;
    });

    test('owner sends exact stored tags: 200, allergensConfirmed true, and calling twice is fine', async () => {
      const res1 = await request(app)
        .post(`/api/menu/${unconfirmedItem.id}/confirm-allergens`)
        .set('Authorization', `Bearer ${fixtures.ownerAToken}`)
        .send({ allergens: ['dairy', 'gluten'] });

      expect(res1.status).toBe(200);
      expect(res1.body.item.allergensConfirmed).toBe(true);

      // Calling twice is fine
      const res2 = await request(app)
        .post(`/api/menu/${unconfirmedItem.id}/confirm-allergens`)
        .set('Authorization', `Bearer ${fixtures.ownerAToken}`)
        .send({ allergens: ['dairy', 'gluten'] });

      expect(res2.status).toBe(200);
      expect(res2.body.item.allergensConfirmed).toBe(true);
    });

    test('same tags in another order and case are accepted', async () => {
      const res = await request(app)
        .post(`/api/menu/${unconfirmedItem.id}/confirm-allergens`)
        .set('Authorization', `Bearer ${fixtures.ownerAToken}`)
        .send({ allergens: [' GLUTEN ', 'Dairy'] });

      expect(res.status).toBe(200);
      expect(res.body.item.allergensConfirmed).toBe(true);
    });

    test('missing body.allergens, non-array, and unknown tag give 400', async () => {
      const res1 = await request(app)
        .post(`/api/menu/${unconfirmedItem.id}/confirm-allergens`)
        .set('Authorization', `Bearer ${fixtures.ownerAToken}`)
        .send({});
      expect(res1.status).toBe(400);

      const res2 = await request(app)
        .post(`/api/menu/${unconfirmedItem.id}/confirm-allergens`)
        .set('Authorization', `Bearer ${fixtures.ownerAToken}`)
        .send({ allergens: 'dairy' });
      expect(res2.status).toBe(400);

      const res3 = await request(app)
        .post(`/api/menu/${unconfirmedItem.id}/confirm-allergens`)
        .set('Authorization', `Bearer ${fixtures.ownerAToken}`)
        .send({ allergens: ['unknown-allergen'] });
      expect(res3.status).toBe(400);
      expect(res3.body.message).toBe('Unknown allergen tag');
    });

    test('tags differing from stored (stored ["dairy"], sent ["dairy", "soy"]) give 409 and item stays unconfirmed', async () => {
      // Create dish with only dairy
      const resSingle = await request(app)
        .post('/api/menu')
        .set('Authorization', `Bearer ${fixtures.ownerAToken}`)
        .send({ ...validDish, name: 'Dairy Dish', allergens: ['dairy'] });
      const dairyItem = resSingle.body.item;

      const res = await request(app)
        .post(`/api/menu/${dairyItem.id}/confirm-allergens`)
        .set('Authorization', `Bearer ${fixtures.ownerAToken}`)
        .send({ allergens: ['dairy', 'soy'] });

      expect(res.status).toBe(409);
      expect(res.body.message).toBe('Allergens changed since you reviewed them');

      const stored = await MenuItem.findById(dairyItem.id).lean();
      expect(stored.allergensConfirmed).toBe(false);
    });

    test('item with bad stored "wheat": sending ["wheat"] gives 400 and sending [] gives 409, stays unconfirmed', async () => {
      const badStoredItem = await MenuItem.create({
        ...validDish,
        restaurantId: fixtures.restaurantA._id,
        name: 'Dish With Bad Stored Wheat',
        allergens: ['wheat'],
        allergensConfirmed: false,
      });

      // Sending ["wheat"] fails schema validation with 400
      const res1 = await request(app)
        .post(`/api/menu/${badStoredItem._id}/confirm-allergens`)
        .set('Authorization', `Bearer ${fixtures.ownerAToken}`)
        .send({ allergens: ['wheat'] });
      expect(res1.status).toBe(400);
      expect(res1.body.message).toBe('Unknown allergen tag');

      // Sending [] fails matching stored tags with 409
      const res2 = await request(app)
        .post(`/api/menu/${badStoredItem._id}/confirm-allergens`)
        .set('Authorization', `Bearer ${fixtures.ownerAToken}`)
        .send({ allergens: [] });
      expect(res2.status).toBe(409);
      expect(res2.body.message).toBe('Allergens changed since you reviewed them');

      const stored = await MenuItem.findById(badStoredItem._id).lean();
      expect(stored.allergensConfirmed).toBe(false);
    });

    test('kitchen receives 403', async () => {
      const res = await request(app)
        .post(`/api/menu/${unconfirmedItem.id}/confirm-allergens`)
        .set('Authorization', `Bearer ${fixtures.kitchenAToken}`)
        .send({ allergens: ['dairy', 'gluten'] });
      expect(res.status).toBe(403);
    });

    test('no token receives 401', async () => {
      const res = await request(app)
        .post(`/api/menu/${unconfirmedItem.id}/confirm-allergens`)
        .send({ allergens: ['dairy', 'gluten'] });
      expect(res.status).toBe(401);
    });

    test("restaurant B item gives 404", async () => {
      const itemB = await MenuItem.create({
        ...validDish,
        restaurantId: fixtures.restaurantB._id,
        name: 'Restaurant B Dish',
        allergens: ['dairy'],
      });

      const res = await request(app)
        .post(`/api/menu/${itemB._id}/confirm-allergens`)
        .set('Authorization', `Bearer ${fixtures.ownerAToken}`)
        .send({ allergens: ['dairy'] });
      expect(res.status).toBe(404);
    });

    test('"not-an-id" gives 404', async () => {
      const res = await request(app)
        .post('/api/menu/not-an-id/confirm-allergens')
        .set('Authorization', `Bearer ${fixtures.ownerAToken}`)
        .send({ allergens: ['dairy'] });
      expect(res.status).toBe(404);
    });
  });

  describe('PATCH /api/menu/:itemId/availability', () => {
    let availItem;

    beforeEach(async () => {
      const res = await request(app)
        .post('/api/menu')
        .set('Authorization', `Bearer ${fixtures.ownerAToken}`)
        .send({ ...validDish, name: 'Availability Toggle Dish' });
      availItem = res.body.item;
    });

    test('owner sets false then true', async () => {
      const res1 = await request(app)
        .patch(`/api/menu/${availItem.id}/availability`)
        .set('Authorization', `Bearer ${fixtures.ownerAToken}`)
        .send({ available: false });

      expect(res1.status).toBe(200);
      expect(res1.body.item.available).toBe(false);

      const res2 = await request(app)
        .patch(`/api/menu/${availItem.id}/availability`)
        .set('Authorization', `Bearer ${fixtures.ownerAToken}`)
        .send({ available: true });

      expect(res2.status).toBe(200);
      expect(res2.body.item.available).toBe(true);
    });

    test('kitchen can toggle availability false then true', async () => {
      const res1 = await request(app)
        .patch(`/api/menu/${availItem.id}/availability`)
        .set('Authorization', `Bearer ${fixtures.kitchenAToken}`)
        .send({ available: false });

      expect(res1.status).toBe(200);
      expect(res1.body.item.available).toBe(false);

      const res2 = await request(app)
        .patch(`/api/menu/${availItem.id}/availability`)
        .set('Authorization', `Bearer ${fixtures.kitchenAToken}`)
        .send({ available: true });

      expect(res2.status).toBe(200);
      expect(res2.body.item.available).toBe(true);
    });

    test.each([
      ['string "false"', { available: 'false' }],
      ['number 0', { available: 0 }],
      ['null', { available: null }],
      ['missing field', {}],
    ])('invalid availability %s returns 400', async (_desc, body) => {
      const res = await request(app)
        .patch(`/api/menu/${availItem.id}/availability`)
        .set('Authorization', `Bearer ${fixtures.ownerAToken}`)
        .send(body);

      expect(res.status).toBe(400);
    });

    test("restaurant B's item returns 404", async () => {
      const itemB = await MenuItem.create({
        ...validDish,
        restaurantId: fixtures.restaurantB._id,
        name: 'Item In B For Avail',
      });

      const res = await request(app)
        .patch(`/api/menu/${itemB._id}/availability`)
        .set('Authorization', `Bearer ${fixtures.ownerAToken}`)
        .send({ available: false });

      expect(res.status).toBe(404);
    });

    test('"not-an-id" returns 404', async () => {
      const res = await request(app)
        .patch('/api/menu/not-an-id/availability')
        .set('Authorization', `Bearer ${fixtures.ownerAToken}`)
        .send({ available: false });

      expect(res.status).toBe(404);
    });

    test('no token returns 401', async () => {
      const res = await request(app)
        .patch(`/api/menu/${availItem.id}/availability`)
        .send({ available: false });

      expect(res.status).toBe(401);
    });
  });

  describe('DELETE /api/menu/:itemId (Deliberately Not Implemented)', () => {
    test('DELETE /api/menu/<id> gives 404 and item still exists', async () => {
      const resCreate = await request(app)
        .post('/api/menu')
        .set('Authorization', `Bearer ${fixtures.ownerAToken}`)
        .send({ ...validDish, name: 'Undeletable Item' });
      const item = resCreate.body.item;

      const resDelete = await request(app)
        .delete(`/api/menu/${item.id}`)
        .set('Authorization', `Bearer ${fixtures.ownerAToken}`);

      expect(resDelete.status).toBe(404);

      const stillExists = await MenuItem.findById(item.id);
      expect(stillExists).not.toBeNull();
    });
  });

  describe('Integration with the Safety Core', () => {
    test('unconfirmed item is NOT in pool for allergic guest; confirmed item IS in pool; guest with no allergies gets it either way', async () => {
      // 1. Create dish with dairy allergen (API forces allergensConfirmed: false)
      const res = await request(app)
        .post('/api/menu')
        .set('Authorization', `Bearer ${fixtures.ownerAToken}`)
        .send({
          ...validDish,
          name: 'Safety Integration Risotto',
          allergens: ['dairy'],
        });
      const createdItem = res.body.item;

      // Fetch stored item with .lean()
      const storedUnconfirmed = await MenuItem.findById(createdItem.id).lean();

      // Guest allergic to peanut: dish is unconfirmed, so fail closed
      const poolAllergicBefore = buildEligiblePool(
        { allergies: ['peanut'] },
        [storedUnconfirmed]
      );
      expect(poolAllergicBefore.find((i) => String(i._id) === createdItem.id)).toBeUndefined();

      // Guest with no allergies gets the unconfirmed item (no allergy hazard to protect against)
      const poolNoAllergiesBefore = buildEligiblePool(
        { allergies: [] },
        [storedUnconfirmed]
      );
      expect(poolNoAllergiesBefore.find((i) => String(i._id) === createdItem.id)).toBeDefined();

      // 2. Confirm allergens on the dish
      await request(app)
        .post(`/api/menu/${createdItem.id}/confirm-allergens`)
        .set('Authorization', `Bearer ${fixtures.ownerAToken}`)
        .send({ allergens: ['dairy'] });

      // Fetch confirmed item with .lean()
      const storedConfirmed = await MenuItem.findById(createdItem.id).lean();

      // Guest allergic to peanut: dish carries dairy (no clash) and is confirmed, so IS in pool
      const poolAllergicAfter = buildEligiblePool(
        { allergies: ['peanut'] },
        [storedConfirmed]
      );
      expect(poolAllergicAfter.find((i) => String(i._id) === createdItem.id)).toBeDefined();

      // Guest allergic to dairy: clashes with dairy, so NOT in pool
      const poolDairyAllergic = buildEligiblePool(
        { allergies: ['dairy'] },
        [storedConfirmed]
      );
      expect(poolDairyAllergic.find((i) => String(i._id) === createdItem.id)).toBeUndefined();

      // Guest with no allergies still gets it
      const poolNoAllergiesAfter = buildEligiblePool(
        { allergies: [] },
        [storedConfirmed]
      );
      expect(poolNoAllergiesAfter.find((i) => String(i._id) === createdItem.id)).toBeDefined();
    });
  });
});
