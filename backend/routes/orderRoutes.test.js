// orderRoutes.test.js: Integration tests for host order routes (/api/sessions/orders)
import crypto from 'crypto';
import mongoose from 'mongoose';
import request from 'supertest';
import { jest } from '@jest/globals';
import { app } from '../server.js';
import Table from '../models/Table.js';
import TableSession from '../models/TableSession.js';
import MenuItem from '../models/MenuItem.js';
import Order from '../models/Order.js';
import { realtime } from '../utils/realtime.js';
import { connectTestDb, clearTestDb, disconnectTestDb } from '../config/testDb.js';
import { createFixtures } from '../config/testFixtures.js';

describe('Host Order Routes (/api/sessions/orders)', () => {
  let fixtures;

  beforeAll(async () => {
    await connectTestDb();
    await clearTestDb();
    fixtures = await createFixtures();
    await TableSession.init();
    await Order.init();
  });

  afterAll(async () => {
    await disconnectTestDb();
  });

  let tableCounter = 200;
  let phoneCounter = 9827000000;

  const makeTable = async (restaurantId) => {
    tableCounter += 1;
    const qrToken = crypto.randomBytes(16).toString('hex');
    return await Table.create({
      restaurantId,
      number: tableCounter,
      qrToken,
    });
  };

  const nextPhone = () => {
    phoneCounter += 1;
    return String(phoneCounter);
  };

  const makeDish = async (restaurantId, overrides = {}) => {
    const uid = crypto.randomUUID().slice(0, 6);
    return await MenuItem.create({
      restaurantId,
      name: `Dish ${uid}`,
      price: 250,
      category: 'Mains',
      isVeg: true,
      allergens: [],
      allergensConfirmed: true,
      available: true,
      spiceLevel: 2,
      ...overrides,
    });
  };

  const joinGuest = async (table, nickname = 'Guest', phone = nextPhone()) => {
    const res = await request(app)
      .post('/api/sessions/join')
      .send({
        restaurantId: String(table.restaurantId),
        tableNumber: table.number,
        qrToken: table.qrToken,
        phone,
        nickname,
      });
    return { ...res.body, phone };
  };

  const setupHost = async (table, allergies = []) => {
    const joined = await joinGuest(table, 'Host');
    const token = joined.token;
    await request(app)
      .post('/api/sessions/allergies')
      .set('Authorization', `Bearer ${token}`)
      .send({ allergies });
    return {
      token,
      participantId: joined.participant.id,
      sessionId: joined.session.id,
      phone: joined.phone,
    };
  };

  const setupApprovedGuest = async (table, hostToken, nickname = 'SeatedGuest', allergies = []) => {
    const joined = await joinGuest(table, nickname);
    const guestId = joined.participant.id;
    await request(app)
      .post(`/api/sessions/participants/${guestId}/approve`)
      .set('Authorization', `Bearer ${hostToken}`);
    const token = joined.token;
    await request(app)
      .post('/api/sessions/allergies')
      .set('Authorization', `Bearer ${token}`)
      .send({ allergies });
    return {
      token,
      participantId: guestId,
      sessionId: joined.session.id,
      phone: joined.phone,
    };
  };

  describe('1. Guards and Input Validation', () => {
    test('1.1. POST /api/sessions/orders: no token gives 401', async () => {
      const res = await request(app).post('/api/sessions/orders').send({ expectedVersion: 0 });
      expect(res.status).toBe(401);
      expect(res.body.code).toBe('INVALID_TOKEN');
    });

    test('1.2. POST /api/sessions/orders: staff token gives 401', async () => {
      const res = await request(app)
        .post('/api/sessions/orders')
        .set('Authorization', `Bearer ${fixtures.ownerAToken}`)
        .send({ expectedVersion: 0 });
      expect(res.status).toBe(401);
      expect(res.body.code).toBe('INVALID_TOKEN');
    });

    test('1.3. POST /api/sessions/orders: garbage token gives 401', async () => {
      const res = await request(app)
        .post('/api/sessions/orders')
        .set('Authorization', 'Bearer garbage.jwt.token')
        .send({ expectedVersion: 0 });
      expect(res.status).toBe(401);
      expect(res.body.code).toBe('INVALID_TOKEN');
    });

    test('1.4. POST /api/sessions/orders: waiting guest gives 403 APPROVAL_PENDING', async () => {
      const table = await makeTable(fixtures.restaurantA._id);
      await setupHost(table);
      const waiting = await joinGuest(table, 'WaitingGuest');
      const res = await request(app)
        .post('/api/sessions/orders')
        .set('Authorization', `Bearer ${waiting.token}`)
        .send({ expectedVersion: 0 });
      expect(res.status).toBe(403);
      expect(res.body.code).toBe('APPROVAL_PENDING');
    });

    test('1.5. POST /api/sessions/orders: guest with no allergy declaration gives 403 ALLERGIES_REQUIRED', async () => {
      const table = await makeTable(fixtures.restaurantA._id);
      const joined = await joinGuest(table, 'NoAllergyHost');
      const res = await request(app)
        .post('/api/sessions/orders')
        .set('Authorization', `Bearer ${joined.token}`)
        .send({ expectedVersion: 0 });
      expect(res.status).toBe(403);
      expect(res.body.code).toBe('ALLERGIES_REQUIRED');
    });

    test('1.6. POST /api/sessions/orders: ordinary approved guest gives 403 NOT_HOST', async () => {
      const table = await makeTable(fixtures.restaurantA._id);
      const host = await setupHost(table);
      const guest = await setupApprovedGuest(table, host.token, 'Diner');
      const res = await request(app)
        .post('/api/sessions/orders')
        .set('Authorization', `Bearer ${guest.token}`)
        .send({ expectedVersion: 0 });
      expect(res.status).toBe(403);
      expect(res.body.code).toBe('NOT_HOST');
    });

    test('1.7. GET /api/sessions/orders/placed: no token gives 401', async () => {
      const res = await request(app).get('/api/sessions/orders/placed');
      expect(res.status).toBe(401);
      expect(res.body.code).toBe('INVALID_TOKEN');
    });

    test('1.8. GET /api/sessions/orders/placed: staff token gives 401', async () => {
      const res = await request(app)
        .get('/api/sessions/orders/placed')
        .set('Authorization', `Bearer ${fixtures.ownerAToken}`);
      expect(res.status).toBe(401);
    });

    test('1.9. GET /api/sessions/orders/placed: waiting guest gives 403 APPROVAL_PENDING', async () => {
      const table = await makeTable(fixtures.restaurantA._id);
      await setupHost(table);
      const waiting = await joinGuest(table, 'WaitingGuest2');
      const res = await request(app)
        .get('/api/sessions/orders/placed')
        .set('Authorization', `Bearer ${waiting.token}`);
      expect(res.status).toBe(403);
      expect(res.body.code).toBe('APPROVAL_PENDING');
    });

    test('1.10. GET /api/sessions/orders/placed: no allergy declaration gives 403 ALLERGIES_REQUIRED', async () => {
      const table = await makeTable(fixtures.restaurantA._id);
      const joined = await joinGuest(table, 'NoAllergyHost2');
      const res = await request(app)
        .get('/api/sessions/orders/placed')
        .set('Authorization', `Bearer ${joined.token}`);
      expect(res.status).toBe(403);
      expect(res.body.code).toBe('ALLERGIES_REQUIRED');
    });

    test('1.11. GET /api/sessions/orders/placed: ordinary guest gives 403 NOT_HOST', async () => {
      const table = await makeTable(fixtures.restaurantA._id);
      const host = await setupHost(table);
      const guest = await setupApprovedGuest(table, host.token, 'Diner2');
      const res = await request(app)
        .get('/api/sessions/orders/placed')
        .set('Authorization', `Bearer ${guest.token}`);
      expect(res.status).toBe(403);
      expect(res.body.code).toBe('NOT_HOST');
    });

    test('1.12. POST cancel: no token gives 401', async () => {
      const res = await request(app).post(
        `/api/sessions/orders/${new mongoose.Types.ObjectId()}/items/${crypto.randomUUID()}/cancel`
      );
      expect(res.status).toBe(401);
    });

    test('1.13. POST cancel: staff token gives 401', async () => {
      const res = await request(app)
        .post(`/api/sessions/orders/${new mongoose.Types.ObjectId()}/items/${crypto.randomUUID()}/cancel`)
        .set('Authorization', `Bearer ${fixtures.ownerAToken}`);
      expect(res.status).toBe(401);
    });

    test('1.14. POST cancel: waiting guest gives 403 APPROVAL_PENDING', async () => {
      const table = await makeTable(fixtures.restaurantA._id);
      await setupHost(table);
      const waiting = await joinGuest(table, 'WaitingGuest3');
      const res = await request(app)
        .post(`/api/sessions/orders/${new mongoose.Types.ObjectId()}/items/${crypto.randomUUID()}/cancel`)
        .set('Authorization', `Bearer ${waiting.token}`);
      expect(res.status).toBe(403);
    });

    test('1.15. POST cancel: no allergy declaration gives 403 ALLERGIES_REQUIRED', async () => {
      const table = await makeTable(fixtures.restaurantA._id);
      const joined = await joinGuest(table, 'NoAllergyHost3');
      const res = await request(app)
        .post(`/api/sessions/orders/${new mongoose.Types.ObjectId()}/items/${crypto.randomUUID()}/cancel`)
        .set('Authorization', `Bearer ${joined.token}`);
      expect(res.status).toBe(403);
    });

    test('1.16. POST cancel: ordinary guest gives 403 NOT_HOST', async () => {
      const table = await makeTable(fixtures.restaurantA._id);
      const host = await setupHost(table);
      const guest = await setupApprovedGuest(table, host.token, 'Diner3');
      const res = await request(app)
        .post(`/api/sessions/orders/${new mongoose.Types.ObjectId()}/items/${crypto.randomUUID()}/cancel`)
        .set('Authorization', `Bearer ${guest.token}`);
      expect(res.status).toBe(403);
      expect(res.body.code).toBe('NOT_HOST');
    });

    test('1.17. POST /api/sessions/orders: { expectedVersion: { "$gt": 0 } } gives 400 INVALID_INPUT', async () => {
      const table = await makeTable(fixtures.restaurantA._id);
      const host = await setupHost(table);
      const res = await request(app)
        .post('/api/sessions/orders')
        .set('Authorization', `Bearer ${host.token}`)
        .send({ expectedVersion: { $gt: 0 } });
      expect(res.status).toBe(400);
      expect(res.body.code).toBe('INVALID_INPUT');
    });

    test('1.18. POST /api/sessions/orders: "3" gives 400 INVALID_INPUT', async () => {
      const table = await makeTable(fixtures.restaurantA._id);
      const host = await setupHost(table);
      const res = await request(app)
        .post('/api/sessions/orders')
        .set('Authorization', `Bearer ${host.token}`)
        .send({ expectedVersion: '3' });
      expect(res.status).toBe(400);
      expect(res.body.code).toBe('INVALID_INPUT');
    });

    test('1.19. POST /api/sessions/orders: -1 gives 400 INVALID_INPUT', async () => {
      const table = await makeTable(fixtures.restaurantA._id);
      const host = await setupHost(table);
      const res = await request(app)
        .post('/api/sessions/orders')
        .set('Authorization', `Bearer ${host.token}`)
        .send({ expectedVersion: -1 });
      expect(res.status).toBe(400);
      expect(res.body.code).toBe('INVALID_INPUT');
    });

    test('1.20. POST /api/sessions/orders: 1.5 gives 400 INVALID_INPUT', async () => {
      const table = await makeTable(fixtures.restaurantA._id);
      const host = await setupHost(table);
      const res = await request(app)
        .post('/api/sessions/orders')
        .set('Authorization', `Bearer ${host.token}`)
        .send({ expectedVersion: 1.5 });
      expect(res.status).toBe(400);
      expect(res.body.code).toBe('INVALID_INPUT');
    });

    test('1.21. POST cancel: invalid orderId gives 400 INVALID_INPUT', async () => {
      const table = await makeTable(fixtures.restaurantA._id);
      const host = await setupHost(table);
      const res = await request(app)
        .post(`/api/sessions/orders/not-a-hex/items/${crypto.randomUUID()}/cancel`)
        .set('Authorization', `Bearer ${host.token}`);
      expect(res.status).toBe(400);
      expect(res.body.code).toBe('INVALID_INPUT');
    });

    test('1.22. POST cancel: invalid orderItemId gives 400 INVALID_INPUT', async () => {
      const table = await makeTable(fixtures.restaurantA._id);
      const host = await setupHost(table);
      const res = await request(app)
        .post(`/api/sessions/orders/${new mongoose.Types.ObjectId()}/items/not-a-uuid/cancel`)
        .set('Authorization', `Bearer ${host.token}`);
      expect(res.status).toBe(400);
      expect(res.body.code).toBe('INVALID_INPUT');
    });
  });

  describe('2. Order Placement', () => {
    test('2.1. normal order gives 201 with placed count, left [], summary, and personal cart', async () => {
      const table = await makeTable(fixtures.restaurantA._id);
      const host = await setupHost(table);
      const dish = await makeDish(fixtures.restaurantA._id, { name: 'Paneer Tikka', price: 320 });

      // Add dish to cart
      await request(app)
        .post('/api/sessions/cart/items')
        .set('Authorization', `Bearer ${host.token}`)
        .send({ menuItemId: String(dish._id), quantity: 2 });

      const res = await request(app)
        .post('/api/sessions/orders')
        .set('Authorization', `Bearer ${host.token}`)
        .send({ expectedVersion: 1 });

      expect(res.status).toBe(201);
      expect(res.body.placed).toBe(1);
      expect(res.body.left).toEqual([]);
      expect(res.body.summary).toEqual({ total: 0, byReason: {} });
      expect(res.body.cart).toBeDefined();
      expect(res.body.cart.lines).toEqual([]);
    });

    test('2.2. stored Order document contains frozen dishes, tableNumber, and tableAllergies', async () => {
      const table = await makeTable(fixtures.restaurantA._id);
      const host = await setupHost(table, ['dairy']);
      const dish = await makeDish(fixtures.restaurantA._id, {
        name: 'Dal Tadka',
        price: 220,
        allergens: [],
        allergensConfirmed: true,
      });

      await request(app)
        .post('/api/sessions/cart/items')
        .set('Authorization', `Bearer ${host.token}`)
        .send({ menuItemId: String(dish._id), quantity: 1 });

      const res = await request(app)
        .post('/api/sessions/orders')
        .set('Authorization', `Bearer ${host.token}`)
        .send({ expectedVersion: 1 });
      expect(res.status).toBe(201);

      const order = await Order.findOne({ sessionId: host.sessionId }).lean();
      expect(order).toBeDefined();
      expect(order.tableNumber).toBe(table.number);
      expect(order.tableAllergies).toEqual([{ nickname: 'Host', allergies: ['dairy'] }]);
      expect(order.items.length).toBe(1);

      const item = order.items[0];
      expect(item.name).toBe('Dal Tadka');
      expect(item.price).toBe(220);
      expect(item.qty).toBe(1);
      expect(item.orderedBy).toBe('Host');
      expect(item.allergyFlags).toEqual([]);
      expect(item.status).toBe('placed');
      expect(typeof item.orderItemId).toBe('string');
      expect(item.orderItemId.length).toBe(36); // UUID
    });

    test('2.3. neither stored Order nor HTTP response contains phone numbers', async () => {
      const table = await makeTable(fixtures.restaurantA._id);
      const host = await setupHost(table);
      const dish = await makeDish(fixtures.restaurantA._id);

      await request(app)
        .post('/api/sessions/cart/items')
        .set('Authorization', `Bearer ${host.token}`)
        .send({ menuItemId: String(dish._id), quantity: 1 });

      const res = await request(app)
        .post('/api/sessions/orders')
        .set('Authorization', `Bearer ${host.token}`)
        .send({ expectedVersion: 1 });
      expect(res.status).toBe(201);

      const order = await Order.findOne({ sessionId: host.sessionId }).lean();
      const orderJson = JSON.stringify(order);
      const responseJson = JSON.stringify(res.body);

      expect(orderJson).not.toContain(host.phone);
      expect(responseJson).not.toContain(host.phone);
    });

    test('2.4. neither stored Order nor HTTP response contains adder id or other guests prices', async () => {
      const table = await makeTable(fixtures.restaurantA._id);
      const host = await setupHost(table);
      const guest = await setupApprovedGuest(table, host.token, 'OtherGuest');
      const dish = await makeDish(fixtures.restaurantA._id);

      await request(app)
        .post('/api/sessions/cart/items')
        .set('Authorization', `Bearer ${guest.token}`)
        .send({ menuItemId: String(dish._id), quantity: 1 });

      const res = await request(app)
        .post('/api/sessions/orders')
        .set('Authorization', `Bearer ${host.token}`)
        .send({ expectedVersion: 1 });
      expect(res.status).toBe(201);

      const order = await Order.findOne({ sessionId: host.sessionId }).lean();
      expect(order.items[0].orderedBy).toBe('OtherGuest'); // Nickname, not participantId
      expect(order.items[0].orderedBy).not.toBe(guest.participantId);
      expect(JSON.stringify(res.body)).not.toContain(guest.participantId);
    });

    test('2.5. placed lines are gone from cart and cartVersion rose by exactly 1', async () => {
      const table = await makeTable(fixtures.restaurantA._id);
      const host = await setupHost(table);
      const dish = await makeDish(fixtures.restaurantA._id);

      await request(app)
        .post('/api/sessions/cart/items')
        .set('Authorization', `Bearer ${host.token}`)
        .send({ menuItemId: String(dish._id), quantity: 1 });

      const res = await request(app)
        .post('/api/sessions/orders')
        .set('Authorization', `Bearer ${host.token}`)
        .send({ expectedVersion: 1 });
      expect(res.status).toBe(201);

      const session = await TableSession.findById(host.sessionId).lean();
      expect(session.cart.length).toBe(0);
      expect(session.cartVersion).toBe(2);
    });

    test('2.6. a dish unsafe for ANOTHER guest is ordered (only adder matters)', async () => {
      const table = await makeTable(fixtures.restaurantA._id);
      // Host has peanut allergy
      const host = await setupHost(table, ['peanut']);
      // Guest has no allergies
      const guest = await setupApprovedGuest(table, host.token, 'Diner', []);
      // Dish has peanut
      const dishWithPeanut = await makeDish(fixtures.restaurantA._id, {
        name: 'Peanut Satay',
        allergens: ['peanut'],
        allergensConfirmed: true,
      });

      // Guest (who has no allergies) adds peanut dish
      await request(app)
        .post('/api/sessions/cart/items')
        .set('Authorization', `Bearer ${guest.token}`)
        .send({ menuItemId: String(dishWithPeanut._id), quantity: 1 });

      // Host places the order
      const res = await request(app)
        .post('/api/sessions/orders')
        .set('Authorization', `Bearer ${host.token}`)
        .send({ expectedVersion: 1 });

      expect(res.status).toBe(201);
      expect(res.body.placed).toBe(1);
      expect(res.body.left).toEqual([]);
    });

    test('2.7. a dish unsafe for ITS ADDER stays in cart with reason not-suitable', async () => {
      const table = await makeTable(fixtures.restaurantA._id);
      const host = await setupHost(table, []);
      const dish = await makeDish(fixtures.restaurantA._id, {
        allergens: ['peanut'],
        allergensConfirmed: true,
      });

      // Host adds dish with peanut while having no allergies declared
      await request(app)
        .post('/api/sessions/cart/items')
        .set('Authorization', `Bearer ${host.token}`)
        .send({ menuItemId: String(dish._id), quantity: 1 });

      // Host updates allergies to include peanut
      await request(app)
        .post('/api/sessions/allergies')
        .set('Authorization', `Bearer ${host.token}`)
        .send({ allergies: ['peanut'] });

      // Host attempts to place order
      const res = await request(app)
        .post('/api/sessions/orders')
        .set('Authorization', `Bearer ${host.token}`)
        .send({ expectedVersion: 1 });

      expect(res.status).toBe(409);
      expect(res.body.code).toBe('NOTHING_TO_ORDER');
      expect(res.body.left.length).toBe(1);
      expect(res.body.left[0].reason).toBe('not-suitable');

      const session = await TableSession.findById(host.sessionId).lean();
      expect(session.cart.length).toBe(1);
    });

    test('2.8. dish owner hid (available: false) stays in cart with reason unavailable', async () => {
      const table = await makeTable(fixtures.restaurantA._id);
      const host = await setupHost(table);
      const dish = await makeDish(fixtures.restaurantA._id);

      await request(app)
        .post('/api/sessions/cart/items')
        .set('Authorization', `Bearer ${host.token}`)
        .send({ menuItemId: String(dish._id), quantity: 1 });

      // Owner hides the dish
      await MenuItem.findByIdAndUpdate(dish._id, { available: false });

      const res = await request(app)
        .post('/api/sessions/orders')
        .set('Authorization', `Bearer ${host.token}`)
        .send({ expectedVersion: 1 });

      expect(res.status).toBe(409);
      expect(res.body.code).toBe('NOTHING_TO_ORDER');
      expect(res.body.left[0].reason).toBe('unavailable');
    });

    test('2.9. dish owner archived stays in cart with reason unavailable', async () => {
      const table = await makeTable(fixtures.restaurantA._id);
      const host = await setupHost(table);
      const dish = await makeDish(fixtures.restaurantA._id);

      await request(app)
        .post('/api/sessions/cart/items')
        .set('Authorization', `Bearer ${host.token}`)
        .send({ menuItemId: String(dish._id), quantity: 1 });

      // Owner archives the dish
      await MenuItem.collection.updateOne({ _id: dish._id }, { $set: { archived: true } });

      const res = await request(app)
        .post('/api/sessions/orders')
        .set('Authorization', `Bearer ${host.token}`)
        .send({ expectedVersion: 1 });

      expect(res.status).toBe(409);
      expect(res.body.code).toBe('NOTHING_TO_ORDER');
      expect(res.body.left[0].reason).toBe('unavailable');
    });

    test('2.10. line whose adder was removed stays in cart with reason adder-left', async () => {
      const table = await makeTable(fixtures.restaurantA._id);
      const host = await setupHost(table);
      const guest = await setupApprovedGuest(table, host.token, 'Leaver');
      const dish = await makeDish(fixtures.restaurantA._id);

      await request(app)
        .post('/api/sessions/cart/items')
        .set('Authorization', `Bearer ${guest.token}`)
        .send({ menuItemId: String(dish._id), quantity: 1 });

      // Staff removes the guest
      await request(app)
        .post(`/api/sessions/staff/${host.sessionId}/participants/${guest.participantId}/remove`)
        .set('Authorization', `Bearer ${fixtures.ownerAToken}`);

      const res = await request(app)
        .post('/api/sessions/orders')
        .set('Authorization', `Bearer ${host.token}`)
        .send({ expectedVersion: 1 });

      expect(res.status).toBe(409);
      expect(res.body.code).toBe('NOTHING_TO_ORDER');
      expect(res.body.left[0].reason).toBe('adder-left');
    });

    test('2.11. mixed cart: unavailable stays, ready lines are ordered', async () => {
      const table = await makeTable(fixtures.restaurantA._id);
      const host = await setupHost(table);
      const goodDish = await makeDish(fixtures.restaurantA._id, { name: 'Good Naan' });
      const badDish = await makeDish(fixtures.restaurantA._id, { name: 'Hidden Curry' });

      await request(app)
        .post('/api/sessions/cart/items')
        .set('Authorization', `Bearer ${host.token}`)
        .send({ menuItemId: String(goodDish._id), quantity: 1 });

      await request(app)
        .post('/api/sessions/cart/items')
        .set('Authorization', `Bearer ${host.token}`)
        .send({ menuItemId: String(badDish._id), quantity: 1 });

      // Hide badDish
      await MenuItem.findByIdAndUpdate(badDish._id, { available: false });

      const res = await request(app)
        .post('/api/sessions/orders')
        .set('Authorization', `Bearer ${host.token}`)
        .send({ expectedVersion: 2 });

      expect(res.status).toBe(201);
      expect(res.body.placed).toBe(1);
      expect(res.body.left.length).toBe(1);
      expect(res.body.left[0].reason).toBe('unavailable');
      expect(res.body.summary.total).toBe(1);
      expect(res.body.summary.byReason['unavailable']).toBe(1);

      // Remaining cart has 1 line
      const session = await TableSession.findById(host.sessionId).lean();
      expect(session.cart.length).toBe(1);
      expect(session.cart[0].itemId.toString()).toBe(badDish._id.toString());
    });

    test('2.12. nothing orderable gives 409 NOTHING_TO_ORDER and leaves cart intact', async () => {
      const table = await makeTable(fixtures.restaurantA._id);
      const host = await setupHost(table);

      // Empty cart
      const res = await request(app)
        .post('/api/sessions/orders')
        .set('Authorization', `Bearer ${host.token}`)
        .send({ expectedVersion: 0 });

      expect(res.status).toBe(409);
      expect(res.body.code).toBe('NOTHING_TO_ORDER');
      expect(res.body.message).toBe('Nothing in the cart can be ordered right now');
    });

    test('2.13. stale expectedVersion gives 409 CART_CHANGED and writes nothing', async () => {
      const table = await makeTable(fixtures.restaurantA._id);
      const host = await setupHost(table);
      const dish = await makeDish(fixtures.restaurantA._id);

      await request(app)
        .post('/api/sessions/cart/items')
        .set('Authorization', `Bearer ${host.token}`)
        .send({ menuItemId: String(dish._id), quantity: 1 });

      // Cart version is now 1, but host sends 0
      const res = await request(app)
        .post('/api/sessions/orders')
        .set('Authorization', `Bearer ${host.token}`)
        .send({ expectedVersion: 0 });

      expect(res.status).toBe(409);
      expect(res.body.code).toBe('CART_CHANGED');
      expect(res.body.message).toBe(
        'The order just changed. Please check it and press Place order again'
      );

      const orderCount = await Order.countDocuments({ sessionId: host.sessionId });
      expect(orderCount).toBe(0);
    });

    test('2.14. placing again gives a SECOND order document with its own items', async () => {
      const table = await makeTable(fixtures.restaurantA._id);
      const host = await setupHost(table);
      const dish1 = await makeDish(fixtures.restaurantA._id, { name: 'Starter Salad' });
      const dish2 = await makeDish(fixtures.restaurantA._id, { name: 'Dessert Halwa' });

      // First order
      await request(app)
        .post('/api/sessions/cart/items')
        .set('Authorization', `Bearer ${host.token}`)
        .send({ menuItemId: String(dish1._id), quantity: 1 });
      const res1 = await request(app)
        .post('/api/sessions/orders')
        .set('Authorization', `Bearer ${host.token}`)
        .send({ expectedVersion: 1 });
      expect(res1.status).toBe(201);

      // Add second dish and place
      await request(app)
        .post('/api/sessions/cart/items')
        .set('Authorization', `Bearer ${host.token}`)
        .send({ menuItemId: String(dish2._id), quantity: 1 });
      const res2 = await request(app)
        .post('/api/sessions/orders')
        .set('Authorization', `Bearer ${host.token}`)
        .send({ expectedVersion: 3 });
      expect(res2.status).toBe(201);

      const orders = await Order.find({ sessionId: host.sessionId }).sort({ createdAt: 1 }).lean();
      expect(orders.length).toBe(2);
      expect(orders[0].items[0].name).toBe('Starter Salad');
      expect(orders[1].items[0].name).toBe('Dessert Halwa');
    });

    test('2.15. changing dish price/name in menu afterwards does not change stored order', async () => {
      const table = await makeTable(fixtures.restaurantA._id);
      const host = await setupHost(table);
      const dish = await makeDish(fixtures.restaurantA._id, { name: 'Original Name', price: 100 });

      await request(app)
        .post('/api/sessions/cart/items')
        .set('Authorization', `Bearer ${host.token}`)
        .send({ menuItemId: String(dish._id), quantity: 1 });

      await request(app)
        .post('/api/sessions/orders')
        .set('Authorization', `Bearer ${host.token}`)
        .send({ expectedVersion: 1 });

      // Update menu item
      await MenuItem.findByIdAndUpdate(dish._id, { name: 'Changed Name', price: 999 });

      const storedOrder = await Order.findOne({ sessionId: host.sessionId }).lean();
      expect(storedOrder.items[0].name).toBe('Original Name');
      expect(storedOrder.items[0].price).toBe(100);
    });

    test('2.16. placing when session is closed gives 401 SESSION_CLOSED', async () => {
      const table = await makeTable(fixtures.restaurantA._id);
      const host = await setupHost(table);
      const dish = await makeDish(fixtures.restaurantA._id);

      await request(app)
        .post('/api/sessions/cart/items')
        .set('Authorization', `Bearer ${host.token}`)
        .send({ menuItemId: String(dish._id), quantity: 1 });

      await TableSession.findByIdAndUpdate(host.sessionId, { status: 'closed' });

      const res = await request(app)
        .post('/api/sessions/orders')
        .set('Authorization', `Bearer ${host.token}`)
        .send({ expectedVersion: 1 });

      expect(res.status).toBe(401);
      expect(res.body.code).toBe('SESSION_CLOSED');
    });

    test('2.17. placing when host is removed gives 401 PARTICIPANT_REMOVED', async () => {
      const table = await makeTable(fixtures.restaurantA._id);
      const host = await setupHost(table);
      const dish = await makeDish(fixtures.restaurantA._id);

      await request(app)
        .post('/api/sessions/cart/items')
        .set('Authorization', `Bearer ${host.token}`)
        .send({ menuItemId: String(dish._id), quantity: 1 });

      await TableSession.updateOne(
        { _id: host.sessionId, 'participants.id': host.participantId },
        { $set: { 'participants.$.status': 'removed' } }
      );

      const res = await request(app)
        .post('/api/sessions/orders')
        .set('Authorization', `Bearer ${host.token}`)
        .send({ expectedVersion: 1 });

      expect(res.status).toBe(401);
      expect(res.body.code).toBe('PARTICIPANT_REMOVED');
    });
  });

  describe('3. Concurrency and Atomicity', () => {
    test(
      '3.1. two simultaneous placements with same expectedVersion give exactly one 201, one 409 and ONE Order doc',
      async () => {
        const table = await makeTable(fixtures.restaurantA._id);
        const host = await setupHost(table);
        const dish = await makeDish(fixtures.restaurantA._id);

        await request(app)
          .post('/api/sessions/cart/items')
          .set('Authorization', `Bearer ${host.token}`)
          .send({ menuItemId: String(dish._id), quantity: 2 });

        const [req1, req2] = await Promise.all([
          request(app)
            .post('/api/sessions/orders')
            .set('Authorization', `Bearer ${host.token}`)
            .send({ expectedVersion: 1 }),
          request(app)
            .post('/api/sessions/orders')
            .set('Authorization', `Bearer ${host.token}`)
            .send({ expectedVersion: 1 }),
        ]);

        const statuses = [req1.status, req2.status].sort();
        expect(statuses).toEqual([201, 409]);

        const conflictRes = req1.status === 409 ? req1 : req2;
        expect(conflictRes.body.code).toBe('CART_CHANGED');

        const orderCount = await Order.countDocuments({ sessionId: host.sessionId });
        expect(orderCount).toBe(1);
      },
      180000
    );

    test(
      '3.2. ten rounds of concurrent add and place: nothing lost, no duplicate orders',
      async () => {
        for (let round = 0; round < 10; round++) {
          const table = await makeTable(fixtures.restaurantA._id);
          const host = await setupHost(table);
          const guest = await setupApprovedGuest(table, host.token, 'Racer');
          const dish1 = await makeDish(fixtures.restaurantA._id);
          const dish2 = await makeDish(fixtures.restaurantA._id);

          // Seed cart with dish1
          await request(app)
            .post('/api/sessions/cart/items')
            .set('Authorization', `Bearer ${host.token}`)
            .send({ menuItemId: String(dish1._id), quantity: 1 });

          // Concurrent: guest adds dish2 while host places expectedVersion 1
          const [addRes, placeRes] = await Promise.all([
            request(app)
              .post('/api/sessions/cart/items')
              .set('Authorization', `Bearer ${guest.token}`)
              .send({ menuItemId: String(dish2._id), quantity: 1 }),
            request(app)
              .post('/api/sessions/orders')
              .set('Authorization', `Bearer ${host.token}`)
              .send({ expectedVersion: 1 }),
          ]);

          expect(addRes.status).toBe(200);

          if (placeRes.status === 201) {
            // Place won before add or placed dish1
            const session = await TableSession.findById(host.sessionId).lean();
            const order = await Order.findOne({ sessionId: host.sessionId }).lean();
            expect(order).toBeDefined();

            // Total dish count in order + cart must be 2
            const itemsInOrder = order.items.reduce((acc, it) => acc + it.qty, 0);
            const itemsInCart = (session.cart || []).reduce((acc, it) => acc + it.qty, 0);
            expect(itemsInOrder + itemsInCart).toBe(2);
          } else {
            // Add won, host got 409 CART_CHANGED
            expect(placeRes.status).toBe(409);
            expect(placeRes.body.code).toBe('CART_CHANGED');
            const session = await TableSession.findById(host.sessionId).lean();
            expect(session.cart.length).toBe(2);
          }
        }
      },
      180000
    );

    test('3.3. atomicity: Order.create error aborts transaction and leaves cart untouched', async () => {
      const table = await makeTable(fixtures.restaurantA._id);
      const host = await setupHost(table);
      const dish = await makeDish(fixtures.restaurantA._id);

      await request(app)
        .post('/api/sessions/cart/items')
        .set('Authorization', `Bearer ${host.token}`)
        .send({ menuItemId: String(dish._id), quantity: 1 });

      const spy = jest.spyOn(Order, 'create').mockImplementationOnce(() => {
        throw new Error('Database write fault on Order');
      });

      const res = await request(app)
        .post('/api/sessions/orders')
        .set('Authorization', `Bearer ${host.token}`)
        .send({ expectedVersion: 1 });

      expect(res.status).toBe(500);
      expect(spy).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ session: expect.anything() })
      );

      // Verify cart and cartVersion are untouched
      const session = await TableSession.findById(host.sessionId).lean();
      expect(session.cart.length).toBe(1);
      expect(session.cartVersion).toBe(1);

      const orderCount = await Order.countDocuments({ sessionId: host.sessionId });
      expect(orderCount).toBe(0);

      spy.mockRestore();
    });

    test('3.4. session closed between read and write gives 401 SESSION_CLOSED', async () => {
      const table = await makeTable(fixtures.restaurantA._id);
      const host = await setupHost(table);
      const dish = await makeDish(fixtures.restaurantA._id);

      await request(app)
        .post('/api/sessions/cart/items')
        .set('Authorization', `Bearer ${host.token}`)
        .send({ menuItemId: String(dish._id), quantity: 1 });

      const originalUpdateOne = TableSession.updateOne;
      const spy = jest
        .spyOn(TableSession, 'updateOne')
        .mockImplementation(async function (...args) {
          if (args[1]?.$pull) {
            spy.mockRestore();
            // Close session before update
            await originalUpdateOne.call(TableSession, { _id: host.sessionId }, { $set: { status: 'closed' } });
            return await originalUpdateOne.apply(this, args);
          }
          return await originalUpdateOne.apply(this, args);
        });

      const res = await request(app)
        .post('/api/sessions/orders')
        .set('Authorization', `Bearer ${host.token}`)
        .send({ expectedVersion: 1 });

      expect(res.status).toBe(401);
      expect(res.body.code).toBe('SESSION_CLOSED');

      const orderCount = await Order.countDocuments({ sessionId: host.sessionId });
      expect(orderCount).toBe(0);

      spy.mockRestore();
    });

    test('3.5. host removed between read and write gives 401 PARTICIPANT_REMOVED', async () => {
      const table = await makeTable(fixtures.restaurantA._id);
      const host = await setupHost(table);
      const dish = await makeDish(fixtures.restaurantA._id);

      await request(app)
        .post('/api/sessions/cart/items')
        .set('Authorization', `Bearer ${host.token}`)
        .send({ menuItemId: String(dish._id), quantity: 1 });

      const originalUpdateOne = TableSession.updateOne;
      const spy = jest
        .spyOn(TableSession, 'updateOne')
        .mockImplementation(async function (...args) {
          if (args[1]?.$pull) {
            spy.mockRestore();
            // Remove host before update
            await originalUpdateOne.call(
              TableSession,
              { _id: host.sessionId, 'participants.id': host.participantId },
              { $set: { 'participants.$.status': 'removed' } }
            );
            return await originalUpdateOne.apply(this, args);
          }
          return await originalUpdateOne.apply(this, args);
        });

      const res = await request(app)
        .post('/api/sessions/orders')
        .set('Authorization', `Bearer ${host.token}`)
        .send({ expectedVersion: 1 });

      expect(res.status).toBe(401);
      expect(res.body.code).toBe('PARTICIPANT_REMOVED');

      const orderCount = await Order.countDocuments({ sessionId: host.sessionId });
      expect(orderCount).toBe(0);

      spy.mockRestore();
    });

    test('3.6. cart version changed between read and write gives 409 CART_CHANGED', async () => {
      const table = await makeTable(fixtures.restaurantA._id);
      const host = await setupHost(table);
      const dish = await makeDish(fixtures.restaurantA._id);

      await request(app)
        .post('/api/sessions/cart/items')
        .set('Authorization', `Bearer ${host.token}`)
        .send({ menuItemId: String(dish._id), quantity: 1 });

      const originalUpdateOne = TableSession.updateOne;
      const spy = jest
        .spyOn(TableSession, 'updateOne')
        .mockImplementation(async function (...args) {
          if (args[1]?.$pull) {
            spy.mockRestore();
            // Increment cartVersion before update
            await originalUpdateOne.call(TableSession, { _id: host.sessionId }, { $inc: { cartVersion: 1 } });
            return await originalUpdateOne.apply(this, args);
          }
          return await originalUpdateOne.apply(this, args);
        });

      const res = await request(app)
        .post('/api/sessions/orders')
        .set('Authorization', `Bearer ${host.token}`)
        .send({ expectedVersion: 1 });

      expect(res.status).toBe(409);
      expect(res.body.code).toBe('CART_CHANGED');

      const orderCount = await Order.countDocuments({ sessionId: host.sessionId });
      expect(orderCount).toBe(0);

      spy.mockRestore();
    });
  });

  describe('4. Placed List (/api/sessions/orders/placed)', () => {
    test('4.1. returns placed dishes from this session only', async () => {
      const table = await makeTable(fixtures.restaurantA._id);
      const host = await setupHost(table);
      const dish = await makeDish(fixtures.restaurantA._id, { name: 'Mutton Kebab' });

      await request(app)
        .post('/api/sessions/cart/items')
        .set('Authorization', `Bearer ${host.token}`)
        .send({ menuItemId: String(dish._id), quantity: 2 });

      await request(app)
        .post('/api/sessions/orders')
        .set('Authorization', `Bearer ${host.token}`)
        .send({ expectedVersion: 1 });

      const res = await request(app)
        .get('/api/sessions/orders/placed')
        .set('Authorization', `Bearer ${host.token}`);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.items)).toBe(true);
      expect(res.body.items.length).toBe(1);
      expect(res.body.items[0].name).toBe('Mutton Kebab');
      expect(res.body.items[0].qty).toBe(2);
      expect(res.body.items[0].orderedBy).toBe('Host');
      expect(res.body.items[0].orderItemId).toBeDefined();
    });

    test('4.2. never includes dishes from another table session', async () => {
      const table1 = await makeTable(fixtures.restaurantA._id);
      const host1 = await setupHost(table1);
      const table2 = await makeTable(fixtures.restaurantA._id);
      const host2 = await setupHost(table2);

      const dish = await makeDish(fixtures.restaurantA._id);

      await request(app)
        .post('/api/sessions/cart/items')
        .set('Authorization', `Bearer ${host2.token}`)
        .send({ menuItemId: String(dish._id), quantity: 1 });
      await request(app)
        .post('/api/sessions/orders')
        .set('Authorization', `Bearer ${host2.token}`)
        .send({ expectedVersion: 1 });

      const res1 = await request(app)
        .get('/api/sessions/orders/placed')
        .set('Authorization', `Bearer ${host1.token}`);

      expect(res1.status).toBe(200);
      expect(res1.body.items).toEqual([]);
    });

    test('4.3. does not include dishes with status preparing, ready, served, or cancelled', async () => {
      const table = await makeTable(fixtures.restaurantA._id);
      const host = await setupHost(table);
      const dish = await makeDish(fixtures.restaurantA._id);

      await request(app)
        .post('/api/sessions/cart/items')
        .set('Authorization', `Bearer ${host.token}`)
        .send({ menuItemId: String(dish._id), quantity: 1 });
      await request(app)
        .post('/api/sessions/orders')
        .set('Authorization', `Bearer ${host.token}`)
        .send({ expectedVersion: 1 });

      // Change status to preparing
      await Order.updateOne(
        { sessionId: host.sessionId },
        { $set: { 'items.0.status': 'preparing' } }
      );

      const res = await request(app)
        .get('/api/sessions/orders/placed')
        .set('Authorization', `Bearer ${host.token}`);

      expect(res.status).toBe(200);
      expect(res.body.items).toEqual([]);
    });
  });

  describe('5. Cancel Placed Item', () => {
    test('5.1. host cancels a placed dish: 200, status cancelled, ordersChanged called', async () => {
      const ordersChangedSpy = jest.spyOn(realtime, 'ordersChanged');

      const table = await makeTable(fixtures.restaurantA._id);
      const host = await setupHost(table);
      const dish = await makeDish(fixtures.restaurantA._id);

      await request(app)
        .post('/api/sessions/cart/items')
        .set('Authorization', `Bearer ${host.token}`)
        .send({ menuItemId: String(dish._id), quantity: 1 });
      await request(app)
        .post('/api/sessions/orders')
        .set('Authorization', `Bearer ${host.token}`)
        .send({ expectedVersion: 1 });

      const placedRes = await request(app)
        .get('/api/sessions/orders/placed')
        .set('Authorization', `Bearer ${host.token}`);
      const itemToCancel = placedRes.body.items[0];

      ordersChangedSpy.mockClear();

      const cancelRes = await request(app)
        .post(`/api/sessions/orders/${itemToCancel.orderId}/items/${itemToCancel.orderItemId}/cancel`)
        .set('Authorization', `Bearer ${host.token}`);

      expect(cancelRes.status).toBe(200);
      expect(cancelRes.body.cancelled).toBe(true);
      expect(ordersChangedSpy).toHaveBeenCalledTimes(1);

      const order = await Order.findById(itemToCancel.orderId).lean();
      expect(order.items[0].status).toBe('cancelled');

      ordersChangedSpy.mockRestore();
    });

    test('5.2. dish that kitchen already started gives 409 ALREADY_STARTED and does not change', async () => {
      const table = await makeTable(fixtures.restaurantA._id);
      const host = await setupHost(table);
      const dish = await makeDish(fixtures.restaurantA._id);

      await request(app)
        .post('/api/sessions/cart/items')
        .set('Authorization', `Bearer ${host.token}`)
        .send({ menuItemId: String(dish._id), quantity: 1 });
      await request(app)
        .post('/api/sessions/orders')
        .set('Authorization', `Bearer ${host.token}`)
        .send({ expectedVersion: 1 });

      const order = await Order.findOne({ sessionId: host.sessionId }).lean();
      const orderItemId = order.items[0].orderItemId;

      // Kitchen starts preparing
      await Order.updateOne(
        { _id: order._id, 'items.orderItemId': orderItemId },
        { $set: { 'items.$.status': 'preparing' } }
      );

      const cancelRes = await request(app)
        .post(`/api/sessions/orders/${order._id}/items/${orderItemId}/cancel`)
        .set('Authorization', `Bearer ${host.token}`);

      expect(cancelRes.status).toBe(409);
      expect(cancelRes.body.code).toBe('ALREADY_STARTED');
      expect(cancelRes.body.message).toBe('The kitchen has already started this dish');

      const rechecked = await Order.findById(order._id).lean();
      expect(rechecked.items[0].status).toBe('preparing');
    });

    test('5.3. unknown orderId gives 404 ORDER_ITEM_NOT_FOUND', async () => {
      const table = await makeTable(fixtures.restaurantA._id);
      const host = await setupHost(table);
      const randomOrderId = new mongoose.Types.ObjectId();
      const randomItemId = crypto.randomUUID();

      const res = await request(app)
        .post(`/api/sessions/orders/${randomOrderId}/items/${randomItemId}/cancel`)
        .set('Authorization', `Bearer ${host.token}`);

      expect(res.status).toBe(404);
      expect(res.body.code).toBe('ORDER_ITEM_NOT_FOUND');
    });

    test('5.4. another session order gives 404 ORDER_ITEM_NOT_FOUND', async () => {
      const table1 = await makeTable(fixtures.restaurantA._id);
      const host1 = await setupHost(table1);
      const table2 = await makeTable(fixtures.restaurantA._id);
      const host2 = await setupHost(table2);

      const dish = await makeDish(fixtures.restaurantA._id);

      await request(app)
        .post('/api/sessions/cart/items')
        .set('Authorization', `Bearer ${host2.token}`)
        .send({ menuItemId: String(dish._id), quantity: 1 });
      await request(app)
        .post('/api/sessions/orders')
        .set('Authorization', `Bearer ${host2.token}`)
        .send({ expectedVersion: 1 });

      const order2 = await Order.findOne({ sessionId: host2.sessionId }).lean();
      const orderItemId2 = order2.items[0].orderItemId;

      // Host 1 attempts to cancel Host 2's order item
      const res = await request(app)
        .post(`/api/sessions/orders/${order2._id}/items/${orderItemId2}/cancel`)
        .set('Authorization', `Bearer ${host1.token}`);

      expect(res.status).toBe(404);
      expect(res.body.code).toBe('ORDER_ITEM_NOT_FOUND');
    });

    test('5.5. unknown orderItemId in valid order gives 404 ORDER_ITEM_NOT_FOUND', async () => {
      const table = await makeTable(fixtures.restaurantA._id);
      const host = await setupHost(table);
      const dish = await makeDish(fixtures.restaurantA._id);

      await request(app)
        .post('/api/sessions/cart/items')
        .set('Authorization', `Bearer ${host.token}`)
        .send({ menuItemId: String(dish._id), quantity: 1 });
      await request(app)
        .post('/api/sessions/orders')
        .set('Authorization', `Bearer ${host.token}`)
        .send({ expectedVersion: 1 });

      const order = await Order.findOne({ sessionId: host.sessionId }).lean();
      const nonExistentItemId = crypto.randomUUID();

      const res = await request(app)
        .post(`/api/sessions/orders/${order._id}/items/${nonExistentItemId}/cancel`)
        .set('Authorization', `Bearer ${host.token}`);

      expect(res.status).toBe(404);
      expect(res.body.code).toBe('ORDER_ITEM_NOT_FOUND');
    });

    test('5.6. cancelling twice gives 409 ALREADY_STARTED on second cancel', async () => {
      const table = await makeTable(fixtures.restaurantA._id);
      const host = await setupHost(table);
      const dish = await makeDish(fixtures.restaurantA._id);

      await request(app)
        .post('/api/sessions/cart/items')
        .set('Authorization', `Bearer ${host.token}`)
        .send({ menuItemId: String(dish._id), quantity: 1 });
      await request(app)
        .post('/api/sessions/orders')
        .set('Authorization', `Bearer ${host.token}`)
        .send({ expectedVersion: 1 });

      const order = await Order.findOne({ sessionId: host.sessionId }).lean();
      const orderItemId = order.items[0].orderItemId;

      const firstCancel = await request(app)
        .post(`/api/sessions/orders/${order._id}/items/${orderItemId}/cancel`)
        .set('Authorization', `Bearer ${host.token}`);
      expect(firstCancel.status).toBe(200);

      const secondCancel = await request(app)
        .post(`/api/sessions/orders/${order._id}/items/${orderItemId}/cancel`)
        .set('Authorization', `Bearer ${host.token}`);
      expect(secondCancel.status).toBe(409);
      expect(secondCancel.body.code).toBe('ALREADY_STARTED');
    });

    test('5.7. notifications: ordersChanged called once per successful placement and cancel, never on failure', async () => {
      const ordersChangedSpy = jest.spyOn(realtime, 'ordersChanged');
      ordersChangedSpy.mockClear();

      const table = await makeTable(fixtures.restaurantA._id);
      const host = await setupHost(table);
      const dish = await makeDish(fixtures.restaurantA._id);

      // Failed placement
      await request(app)
        .post('/api/sessions/orders')
        .set('Authorization', `Bearer ${host.token}`)
        .send({ expectedVersion: 99 });
      expect(ordersChangedSpy).not.toHaveBeenCalled();

      // Successful placement
      await request(app)
        .post('/api/sessions/cart/items')
        .set('Authorization', `Bearer ${host.token}`)
        .send({ menuItemId: String(dish._id), quantity: 1 });

      await request(app)
        .post('/api/sessions/orders')
        .set('Authorization', `Bearer ${host.token}`)
        .send({ expectedVersion: 1 });
      expect(ordersChangedSpy).toHaveBeenCalledTimes(1);

      // Failed cancel
      ordersChangedSpy.mockClear();
      await request(app)
        .post(`/api/sessions/orders/${new mongoose.Types.ObjectId()}/items/${crypto.randomUUID()}/cancel`)
        .set('Authorization', `Bearer ${host.token}`);
      expect(ordersChangedSpy).not.toHaveBeenCalled();

      ordersChangedSpy.mockRestore();
    });

    test('5.8. realtime.cartChanged is called on placement with the new cartVersion', async () => {
      const cartChangedSpy = jest.spyOn(realtime, 'cartChanged');
      cartChangedSpy.mockClear();

      const table = await makeTable(fixtures.restaurantA._id);
      const host = await setupHost(table);
      const dish = await makeDish(fixtures.restaurantA._id);

      await request(app)
        .post('/api/sessions/cart/items')
        .set('Authorization', `Bearer ${host.token}`)
        .send({ menuItemId: String(dish._id), quantity: 1 });

      cartChangedSpy.mockClear();

      await request(app)
        .post('/api/sessions/orders')
        .set('Authorization', `Bearer ${host.token}`)
        .send({ expectedVersion: 1 });

      expect(cartChangedSpy).toHaveBeenCalledTimes(1);
      expect(cartChangedSpy).toHaveBeenCalledWith(host.sessionId, 2);

      cartChangedSpy.mockRestore();
    });
  });
});
