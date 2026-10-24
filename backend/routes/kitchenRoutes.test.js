// kitchenRoutes.test.js: Integration tests for staff kitchen board routes (/api/orders)
import crypto from 'crypto';
import mongoose from 'mongoose';
import request from 'supertest';
import { jest } from '@jest/globals';
import { app } from '../server.js';
import User from '../models/User.js';
import Order from '../models/Order.js';
import MenuItem from '../models/MenuItem.js';
import { realtime } from '../utils/realtime.js';
import { generateToken, generateGuestToken } from '../utils/generateToken.js';
import { connectTestDb, clearTestDb, disconnectTestDb } from '../config/testDb.js';
import { createFixtures } from '../config/testFixtures.js';

describe('Staff Kitchen Routes (/api/orders)', () => {
  let fixtures;
  let kitchenBToken;
  let waiterAToken;
  let ordersChangedSpy;

  beforeAll(async () => {
    await connectTestDb();
    await clearTestDb();
    fixtures = await createFixtures();
    await Order.init();

    // Create a kitchen user for restaurant B to test cross-tenant access
    const passwordHash = fixtures.ownerA.passwordHash;
    const kitchenB = await User.create({
      name: 'Kitchen B',
      email: `kitchen_b_${crypto.randomUUID()}@maitred.test`,
      passwordHash,
      role: 'kitchen',
      restaurantId: fixtures.restaurantB._id,
    });
    kitchenBToken = generateToken(kitchenB);

    // Create an unauthorized staff user (e.g. role 'waiter') for restaurant A using collection.insertOne
    const waiterId = new mongoose.Types.ObjectId();
    await User.collection.insertOne({
      _id: waiterId,
      name: 'Waiter A',
      email: `waiter_a_${crypto.randomUUID()}@maitred.test`,
      passwordHash,
      role: 'waiter',
      restaurantId: fixtures.restaurantA._id,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    waiterAToken = generateToken({ _id: waiterId, role: 'waiter', restaurantId: fixtures.restaurantA._id });
  });

  afterAll(async () => {
    await disconnectTestDb();
  });

  beforeEach(() => {
    ordersChangedSpy = jest.spyOn(realtime, 'ordersChanged');
  });

  afterEach(() => {
    if (ordersChangedSpy && typeof ordersChangedSpy.mockRestore === 'function') {
      ordersChangedSpy.mockRestore();
    }
  });

  const makeDish = async (restaurantId, overrides = {}) => {
    const uid = crypto.randomUUID().slice(0, 6);
    return await MenuItem.create({
      restaurantId,
      name: `Dish ${uid}`,
      price: 250,
      category: 'Mains',
      isVeg: true,
      allergens: ['gluten'],
      allergensConfirmed: true,
      available: true,
      spiceLevel: 2,
      ...overrides,
    });
  };

  const makeOrder = async (restaurantId, overrides = {}) => {
    const dish = await makeDish(restaurantId);
    const orderItemId = crypto.randomUUID();
    const order = await Order.create({
      sessionId: new mongoose.Types.ObjectId(),
      restaurantId,
      tableNumber: 12,
      status: 'placed',
      items: [
        {
          orderItemId,
          itemId: dish._id,
          name: dish.name,
          price: dish.price,
          qty: 2,
          orderedBy: 'Alice',
          allergyFlags: ['gluten'],
          isSurprise: false,
          revealed: false,
          status: 'placed',
        },
      ],
      tableAllergies: [
        {
          nickname: 'Alice',
          allergies: ['gluten'],
        },
      ],
      ...overrides,
    });
    return { order, dish, orderItemId };
  };

  const makeMultiItemOrder = async (restaurantId, itemSpecs = [], overrides = {}) => {
    const items = [];
    for (const spec of itemSpecs) {
      const dishOverrides = {};
      if (spec.name) dishOverrides.name = spec.name;
      if (spec.allergens) dishOverrides.allergens = spec.allergens;
      const dish = await makeDish(restaurantId, dishOverrides);
      items.push({
        orderItemId: spec.orderItemId || crypto.randomUUID(),
        itemId: dish._id,
        name: dish.name,
        price: dish.price,
        qty: spec.qty ?? 1,
        orderedBy: spec.orderedBy || 'Bob',
        allergyFlags: spec.allergens || [],
        isSurprise: false,
        revealed: false,
        status: spec.status || 'placed',
      });
    }

    const order = await Order.create({
      sessionId: new mongoose.Types.ObjectId(),
      restaurantId,
      tableNumber: 15,
      status: 'placed',
      items,
      tableAllergies: [
        {
          nickname: 'Bob',
          allergies: ['peanuts'],
        },
      ],
      ...overrides,
    });
    return { order, items };
  };

  // 1. Authentication & Guards
  describe('1. Authentication & Guards', () => {
    test('1.1 GET /api/orders returns 401 when no token is provided', async () => {
      const res = await request(app).get('/api/orders');
      expect(res.status).toBe(401);
      expect(res.body.message).toBe('Not authorised');
    });

    test('1.2 GET /api/orders returns 401 when a guest token is provided', async () => {
      const guestToken = generateGuestToken({
        sessionId: new mongoose.Types.ObjectId(),
        participantId: 'p-guest-1',
      });
      const res = await request(app)
        .get('/api/orders')
        .set('Authorization', `Bearer ${guestToken}`);
      expect(res.status).toBe(401);
      expect(res.body.message).toBe('Not authorised');
    });

    test('1.3 GET /api/orders returns 403 when user does not have owner or kitchen role', async () => {
      const res = await request(app)
        .get('/api/orders')
        .set('Authorization', `Bearer ${waiterAToken}`);
      expect(res.status).toBe(403);
      expect(res.body.message).toBe('Forbidden');
    });

    test('1.4 GET /api/orders returns 200 for owner role and kitchen role', async () => {
      const resOwner = await request(app)
        .get('/api/orders')
        .set('Authorization', `Bearer ${fixtures.ownerAToken}`);
      expect(resOwner.status).toBe(200);
      expect(Array.isArray(resOwner.body.orders)).toBe(true);

      const resKitchen = await request(app)
        .get('/api/orders')
        .set('Authorization', `Bearer ${fixtures.kitchenAToken}`);
      expect(resKitchen.status).toBe(200);
      expect(Array.isArray(resKitchen.body.orders)).toBe(true);
    });

    test('1.5 PATCH returns 401 when no token is provided', async () => {
      const hexId = new mongoose.Types.ObjectId().toString();
      const uuid = crypto.randomUUID();
      const res = await request(app)
        .patch(`/api/orders/${hexId}/items/${uuid}/status`)
        .send({ status: 'preparing' });
      expect(res.status).toBe(401);
      expect(res.body.message).toBe('Not authorised');
    });

    test('1.6 PATCH returns 401 when guest token is provided', async () => {
      const hexId = new mongoose.Types.ObjectId().toString();
      const uuid = crypto.randomUUID();
      const guestToken = generateGuestToken({
        sessionId: new mongoose.Types.ObjectId(),
        participantId: 'p-guest-1',
      });
      const res = await request(app)
        .patch(`/api/orders/${hexId}/items/${uuid}/status`)
        .set('Authorization', `Bearer ${guestToken}`)
        .send({ status: 'preparing' });
      expect(res.status).toBe(401);
      expect(res.body.message).toBe('Not authorised');
    });

    test('1.7 PATCH returns 403 when user has unauthorized role', async () => {
      const hexId = new mongoose.Types.ObjectId().toString();
      const uuid = crypto.randomUUID();
      const res = await request(app)
        .patch(`/api/orders/${hexId}/items/${uuid}/status`)
        .set('Authorization', `Bearer ${waiterAToken}`)
        .send({ status: 'preparing' });
      expect(res.status).toBe(403);
      expect(res.body.message).toBe('Forbidden');
    });

    test('1.8 Kitchen user from restaurant B cannot see restaurant A orders via GET /api/orders', async () => {
      await makeOrder(fixtures.restaurantA._id);

      const resB = await request(app)
        .get('/api/orders')
        .set('Authorization', `Bearer ${kitchenBToken}`);
      expect(resB.status).toBe(200);
      expect(resB.body.orders).toHaveLength(0);
    });
  });

  // 2. Input Validation
  describe('2. Input Validation', () => {
    test('2.1 PATCH returns 400 when orderId is not a 24-character hex string', async () => {
      const uuid = crypto.randomUUID();
      const res = await request(app)
        .patch(`/api/orders/not-a-valid-hex-id/items/${uuid}/status`)
        .set('Authorization', `Bearer ${fixtures.kitchenAToken}`)
        .send({ status: 'preparing' });
      expect(res.status).toBe(400);
      expect(res.body.code).toBe('INVALID_INPUT');
    });

    test('2.2 PATCH returns 400 when orderItemId is not a valid UUID', async () => {
      const hexId = new mongoose.Types.ObjectId().toString();
      const res = await request(app)
        .patch(`/api/orders/${hexId}/items/not-a-uuid/status`)
        .set('Authorization', `Bearer ${fixtures.kitchenAToken}`)
        .send({ status: 'preparing' });
      expect(res.status).toBe(400);
      expect(res.body.code).toBe('INVALID_INPUT');
    });

    test('2.3 PATCH returns 400 when status is "placed" (cannot move to placed)', async () => {
      const hexId = new mongoose.Types.ObjectId().toString();
      const uuid = crypto.randomUUID();
      const res = await request(app)
        .patch(`/api/orders/${hexId}/items/${uuid}/status`)
        .set('Authorization', `Bearer ${fixtures.kitchenAToken}`)
        .send({ status: 'placed' });
      expect(res.status).toBe(400);
      expect(res.body.code).toBe('INVALID_INPUT');
    });

    test('2.4 PATCH returns 400 when status is an unknown string', async () => {
      const hexId = new mongoose.Types.ObjectId().toString();
      const uuid = crypto.randomUUID();
      const res = await request(app)
        .patch(`/api/orders/${hexId}/items/${uuid}/status`)
        .set('Authorization', `Bearer ${fixtures.kitchenAToken}`)
        .send({ status: 'flying' });
      expect(res.status).toBe(400);
      expect(res.body.code).toBe('INVALID_INPUT');
    });

    test('2.5 PATCH returns 400 when status is missing (empty body)', async () => {
      const hexId = new mongoose.Types.ObjectId().toString();
      const uuid = crypto.randomUUID();
      const res = await request(app)
        .patch(`/api/orders/${hexId}/items/${uuid}/status`)
        .set('Authorization', `Bearer ${fixtures.kitchenAToken}`)
        .send({});
      expect(res.status).toBe(400);
      expect(res.body.code).toBe('INVALID_INPUT');
    });

    test('2.6 PATCH returns 400 when status is a non-string type', async () => {
      const hexId = new mongoose.Types.ObjectId().toString();
      const uuid = crypto.randomUUID();
      const res = await request(app)
        .patch(`/api/orders/${hexId}/items/${uuid}/status`)
        .set('Authorization', `Bearer ${fixtures.kitchenAToken}`)
        .send({ status: 123 });
      expect(res.status).toBe(400);
      expect(res.body.code).toBe('INVALID_INPUT');
    });
  });

  // 3. Active Orders Board: GET /api/orders
  describe('3. Active Orders Board (GET /api/orders)', () => {
    beforeEach(async () => {
      await Order.deleteMany({});
    });

    test('3.1 Returns 200 with active orders array', async () => {
      await makeOrder(fixtures.restaurantA._id);
      const res = await request(app)
        .get('/api/orders')
        .set('Authorization', `Bearer ${fixtures.kitchenAToken}`);
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.orders)).toBe(true);
      expect(res.body.orders).toHaveLength(1);
    });

    test('3.2 Orders are sorted chronologically by createdAt ascending', async () => {
      const { order: o1 } = await makeOrder(fixtures.restaurantA._id, { tableNumber: 1 });
      // Small pause to ensure distinct timestamp
      await new Promise((r) => setTimeout(r, 10));
      const { order: o2 } = await makeOrder(fixtures.restaurantA._id, { tableNumber: 2 });
      await new Promise((r) => setTimeout(r, 10));
      const { order: o3 } = await makeOrder(fixtures.restaurantA._id, { tableNumber: 3 });

      const res = await request(app)
        .get('/api/orders')
        .set('Authorization', `Bearer ${fixtures.kitchenAToken}`);
      expect(res.status).toBe(200);
      expect(res.body.orders).toHaveLength(3);
      expect(res.body.orders[0].id).toBe(String(o1._id));
      expect(res.body.orders[1].id).toBe(String(o2._id));
      expect(res.body.orders[2].id).toBe(String(o3._id));
    });

    test('3.3 Strict kitchenOrderView shape: NO price anywhere in response JSON', async () => {
      const { order, dish } = await makeOrder(fixtures.restaurantA._id, {
        tableNumber: 10,
      });

      const res = await request(app)
        .get('/api/orders')
        .set('Authorization', `Bearer ${fixtures.kitchenAToken}`);
      expect(res.status).toBe(200);

      // Collect all keys recursively
      const keys = [];
      const extractKeys = (obj) => {
        if (Array.isArray(obj)) obj.forEach(extractKeys);
        else if (obj && typeof obj === 'object') {
          Object.keys(obj).forEach((k) => {
            keys.push(k);
            extractKeys(obj[k]);
          });
        }
      };
      extractKeys(res.body);

      expect(keys).not.toContain('price');
      expect(keys).not.toContain('unitPrice');
      expect(keys).not.toContain('total');

      const rawJson = JSON.stringify(res.body);
      expect(rawJson).not.toContain('"price"');
      expect(rawJson).not.toContain(String(dish.price));
    });

    test('3.4 Strict kitchenOrderView shape: NO sessionId anywhere in response JSON', async () => {
      const { order } = await makeOrder(fixtures.restaurantA._id);

      const res = await request(app)
        .get('/api/orders')
        .set('Authorization', `Bearer ${fixtures.kitchenAToken}`);
      expect(res.status).toBe(200);

      const keys = [];
      const extractKeys = (obj) => {
        if (Array.isArray(obj)) obj.forEach(extractKeys);
        else if (obj && typeof obj === 'object') {
          Object.keys(obj).forEach((k) => {
            keys.push(k);
            extractKeys(obj[k]);
          });
        }
      };
      extractKeys(res.body);

      expect(keys).not.toContain('sessionId');
      expect(JSON.stringify(res.body)).not.toContain(String(order.sessionId));
    });

    test('3.5 Strict kitchenOrderView shape: NO itemId anywhere in response JSON', async () => {
      const { dish } = await makeOrder(fixtures.restaurantA._id);

      const res = await request(app)
        .get('/api/orders')
        .set('Authorization', `Bearer ${fixtures.kitchenAToken}`);
      expect(res.status).toBe(200);

      const keys = [];
      const extractKeys = (obj) => {
        if (Array.isArray(obj)) obj.forEach(extractKeys);
        else if (obj && typeof obj === 'object') {
          Object.keys(obj).forEach((k) => {
            keys.push(k);
            extractKeys(obj[k]);
          });
        }
      };
      extractKeys(res.body);

      expect(keys).not.toContain('itemId');
      expect(JSON.stringify(res.body)).not.toContain(String(dish._id));
    });

    test('3.6 Strict kitchenOrderView shape: NO phone anywhere in response JSON', async () => {
      await makeOrder(fixtures.restaurantA._id);

      const res = await request(app)
        .get('/api/orders')
        .set('Authorization', `Bearer ${fixtures.kitchenAToken}`);
      expect(res.status).toBe(200);

      const keys = [];
      const extractKeys = (obj) => {
        if (Array.isArray(obj)) obj.forEach(extractKeys);
        else if (obj && typeof obj === 'object') {
          Object.keys(obj).forEach((k) => {
            keys.push(k);
            extractKeys(obj[k]);
          });
        }
      };
      extractKeys(res.body);

      expect(keys).not.toContain('phone');
    });

    test('3.7 Does not return inactive orders where all items are served or cancelled', async () => {
      // Order with all served items
      await makeMultiItemOrder(fixtures.restaurantA._id, [
        { status: 'served' },
        { status: 'served' },
      ]);
      // Order with all cancelled items
      await makeMultiItemOrder(fixtures.restaurantA._id, [
        { status: 'cancelled' },
      ]);
      // Order with mixed served and cancelled (no active items)
      await makeMultiItemOrder(fixtures.restaurantA._id, [
        { status: 'served' },
        { status: 'cancelled' },
      ]);
      // Active order
      const { order: activeOrder } = await makeMultiItemOrder(fixtures.restaurantA._id, [
        { status: 'placed' },
        { status: 'served' },
      ]);

      const res = await request(app)
        .get('/api/orders')
        .set('Authorization', `Bearer ${fixtures.kitchenAToken}`);
      expect(res.status).toBe(200);
      expect(res.body.orders).toHaveLength(1);
      expect(res.body.orders[0].id).toBe(String(activeOrder._id));
    });

    test('3.8 Mixed order has derived status and only kitchenOrderView shape', async () => {
      const { order } = await makeMultiItemOrder(fixtures.restaurantA._id, [
        { status: 'served', name: 'Dish Served' },
        { status: 'preparing', name: 'Dish Preparing' },
      ]);

      const res = await request(app)
        .get('/api/orders')
        .set('Authorization', `Bearer ${fixtures.kitchenAToken}`);
      expect(res.status).toBe(200);
      expect(res.body.orders).toHaveLength(1);
      const returnedOrder = res.body.orders[0];
      expect(returnedOrder.id).toBe(String(order._id));
      expect(returnedOrder.status).toBe('preparing');
      expect(returnedOrder.tableNumber).toBe(15);
      expect(returnedOrder.items).toHaveLength(2);
      expect(returnedOrder.tableAllergies).toEqual([
        { nickname: 'Bob', allergies: ['peanuts'] },
      ]);
    });
  });

  // 4. Item Status Transitions: PATCH /api/orders/:orderId/items/:orderItemId/status
  describe('4. Item Status Transitions (PATCH)', () => {
    test('4.1 Moves status from placed to preparing (200, calls ordersChanged)', async () => {
      const { order, orderItemId } = await makeOrder(fixtures.restaurantA._id);

      const res = await request(app)
        .patch(`/api/orders/${order._id}/items/${orderItemId}/status`)
        .set('Authorization', `Bearer ${fixtures.kitchenAToken}`)
        .send({ status: 'preparing' });

      expect(res.status).toBe(200);
      expect(res.body.order).toBeDefined();
      expect(res.body.order.id).toBe(String(order._id));
      expect(res.body.order.status).toBe('preparing');
      const item = res.body.order.items.find((i) => i.id === orderItemId);
      expect(item.status).toBe('preparing');

      expect(ordersChangedSpy).toHaveBeenCalledTimes(1);
      expect(ordersChangedSpy).toHaveBeenCalledWith(String(fixtures.restaurantA._id));

      // Verify database persistence
      const inDb = await Order.findById(order._id).lean();
      expect(inDb.items[0].status).toBe('preparing');
    });

    test('4.2 Moves status from preparing to ready (200, calls ordersChanged)', async () => {
      const { order, items } = await makeMultiItemOrder(fixtures.restaurantA._id, [
        { status: 'preparing' },
      ]);
      const orderItemId = items[0].orderItemId;

      const res = await request(app)
        .patch(`/api/orders/${order._id}/items/${orderItemId}/status`)
        .set('Authorization', `Bearer ${fixtures.kitchenAToken}`)
        .send({ status: 'ready' });

      expect(res.status).toBe(200);
      expect(res.body.order.status).toBe('ready');
      const item = res.body.order.items.find((i) => i.id === orderItemId);
      expect(item.status).toBe('ready');

      expect(ordersChangedSpy).toHaveBeenCalledTimes(1);
      expect(ordersChangedSpy).toHaveBeenCalledWith(String(fixtures.restaurantA._id));
    });

    test('4.3 Moves status from ready to served (200, calls ordersChanged)', async () => {
      const { order, items } = await makeMultiItemOrder(fixtures.restaurantA._id, [
        { status: 'ready' },
      ]);
      const orderItemId = items[0].orderItemId;

      const res = await request(app)
        .patch(`/api/orders/${order._id}/items/${orderItemId}/status`)
        .set('Authorization', `Bearer ${fixtures.kitchenAToken}`)
        .send({ status: 'served' });

      expect(res.status).toBe(200);
      expect(res.body.order.status).toBe('served');
      const item = res.body.order.items.find((i) => i.id === orderItemId);
      expect(item.status).toBe('served');

      expect(ordersChangedSpy).toHaveBeenCalledTimes(1);
      expect(ordersChangedSpy).toHaveBeenCalledWith(String(fixtures.restaurantA._id));
    });

    test('4.4 Moves status from placed to cancelled (200, calls ordersChanged)', async () => {
      const { order, orderItemId } = await makeOrder(fixtures.restaurantA._id);

      const res = await request(app)
        .patch(`/api/orders/${order._id}/items/${orderItemId}/status`)
        .set('Authorization', `Bearer ${fixtures.kitchenAToken}`)
        .send({ status: 'cancelled' });

      expect(res.status).toBe(200);
      expect(res.body.order.status).toBe('cancelled');
      const item = res.body.order.items.find((i) => i.id === orderItemId);
      expect(item.status).toBe('cancelled');

      expect(ordersChangedSpy).toHaveBeenCalledTimes(1);
      expect(ordersChangedSpy).toHaveBeenCalledWith(String(fixtures.restaurantA._id));
    });

    test('4.5 Owner user can update item status', async () => {
      const { order, orderItemId } = await makeOrder(fixtures.restaurantA._id);

      const res = await request(app)
        .patch(`/api/orders/${order._id}/items/${orderItemId}/status`)
        .set('Authorization', `Bearer ${fixtures.ownerAToken}`)
        .send({ status: 'preparing' });

      expect(res.status).toBe(200);
      const item = res.body.order.items.find((i) => i.id === orderItemId);
      expect(item.status).toBe('preparing');
    });

    test('4.6 Kitchen user can update item status', async () => {
      const { order, orderItemId } = await makeOrder(fixtures.restaurantA._id);

      const res = await request(app)
        .patch(`/api/orders/${order._id}/items/${orderItemId}/status`)
        .set('Authorization', `Bearer ${fixtures.kitchenAToken}`)
        .send({ status: 'preparing' });

      expect(res.status).toBe(200);
      const item = res.body.order.items.find((i) => i.id === orderItemId);
      expect(item.status).toBe('preparing');
    });
  });

  // 5. Invalid Transitions: PATCH returns 409 INVALID_MOVE
  describe('5. Invalid Transitions (409 INVALID_MOVE)', () => {
    test('5.1 Cannot skip from placed to ready (409 INVALID_TRANSITION)', async () => {
      const { order, orderItemId } = await makeOrder(fixtures.restaurantA._id);

      const res = await request(app)
        .patch(`/api/orders/${order._id}/items/${orderItemId}/status`)
        .set('Authorization', `Bearer ${fixtures.kitchenAToken}`)
        .send({ status: 'ready' });

      expect(res.status).toBe(409);
      expect(res.body.code).toBe('INVALID_MOVE');
      expect(res.body.current).toBe('placed');
      expect(ordersChangedSpy).not.toHaveBeenCalled();
    });

    test('5.2 Cannot skip from placed to served (409 INVALID_TRANSITION)', async () => {
      const { order, orderItemId } = await makeOrder(fixtures.restaurantA._id);

      const res = await request(app)
        .patch(`/api/orders/${order._id}/items/${orderItemId}/status`)
        .set('Authorization', `Bearer ${fixtures.kitchenAToken}`)
        .send({ status: 'served' });

      expect(res.status).toBe(409);
      expect(res.body.code).toBe('INVALID_MOVE');
      expect(res.body.current).toBe('placed');
      expect(ordersChangedSpy).not.toHaveBeenCalled();
    });

    test('5.3 Cannot cancel once preparing (409 INVALID_TRANSITION)', async () => {
      const { order, items } = await makeMultiItemOrder(fixtures.restaurantA._id, [
        { status: 'preparing' },
      ]);
      const orderItemId = items[0].orderItemId;

      const res = await request(app)
        .patch(`/api/orders/${order._id}/items/${orderItemId}/status`)
        .set('Authorization', `Bearer ${fixtures.kitchenAToken}`)
        .send({ status: 'cancelled' });

      expect(res.status).toBe(409);
      expect(res.body.code).toBe('INVALID_MOVE');
      expect(res.body.current).toBe('preparing');
      expect(ordersChangedSpy).not.toHaveBeenCalled();
    });

    test('5.4 Cannot cancel once ready (409 INVALID_TRANSITION)', async () => {
      const { order, items } = await makeMultiItemOrder(fixtures.restaurantA._id, [
        { status: 'ready' },
      ]);
      const orderItemId = items[0].orderItemId;

      const res = await request(app)
        .patch(`/api/orders/${order._id}/items/${orderItemId}/status`)
        .set('Authorization', `Bearer ${fixtures.kitchenAToken}`)
        .send({ status: 'cancelled' });

      expect(res.status).toBe(409);
      expect(res.body.code).toBe('INVALID_MOVE');
      expect(res.body.current).toBe('ready');
      expect(ordersChangedSpy).not.toHaveBeenCalled();
    });

    test('5.5 Cannot transition out of terminal state served (409 INVALID_TRANSITION)', async () => {
      const { order, items } = await makeMultiItemOrder(fixtures.restaurantA._id, [
        { status: 'served' },
      ]);
      const orderItemId = items[0].orderItemId;

      const res = await request(app)
        .patch(`/api/orders/${order._id}/items/${orderItemId}/status`)
        .set('Authorization', `Bearer ${fixtures.kitchenAToken}`)
        .send({ status: 'preparing' });

      expect(res.status).toBe(409);
      expect(res.body.code).toBe('INVALID_MOVE');
      expect(res.body.current).toBe('served');
      expect(ordersChangedSpy).not.toHaveBeenCalled();
    });

    test('5.6 Cannot transition out of terminal state cancelled (409 INVALID_TRANSITION)', async () => {
      const { order, items } = await makeMultiItemOrder(fixtures.restaurantA._id, [
        { status: 'cancelled' },
      ]);
      const orderItemId = items[0].orderItemId;

      const res = await request(app)
        .patch(`/api/orders/${order._id}/items/${orderItemId}/status`)
        .set('Authorization', `Bearer ${fixtures.kitchenAToken}`)
        .send({ status: 'preparing' });

      expect(res.status).toBe(409);
      expect(res.body.code).toBe('INVALID_MOVE');
      expect(res.body.current).toBe('cancelled');
      expect(ordersChangedSpy).not.toHaveBeenCalled();
    });

    test('5.7 Cannot transition to same status: preparing to preparing (409 INVALID_TRANSITION)', async () => {
      const { order, items } = await makeMultiItemOrder(fixtures.restaurantA._id, [
        { status: 'preparing' },
      ]);
      const orderItemId = items[0].orderItemId;

      const res = await request(app)
        .patch(`/api/orders/${order._id}/items/${orderItemId}/status`)
        .set('Authorization', `Bearer ${fixtures.kitchenAToken}`)
        .send({ status: 'preparing' });

      expect(res.status).toBe(409);
      expect(res.body.code).toBe('INVALID_MOVE');
      expect(res.body.current).toBe('preparing');
      expect(ordersChangedSpy).not.toHaveBeenCalled();
    });

    test('5.8 Cannot transition to same status: ready to ready (409 INVALID_TRANSITION)', async () => {
      const { order, items } = await makeMultiItemOrder(fixtures.restaurantA._id, [
        { status: 'ready' },
      ]);
      const orderItemId = items[0].orderItemId;

      const res = await request(app)
        .patch(`/api/orders/${order._id}/items/${orderItemId}/status`)
        .set('Authorization', `Bearer ${fixtures.kitchenAToken}`)
        .send({ status: 'ready' });

      expect(res.status).toBe(409);
      expect(res.body.code).toBe('INVALID_MOVE');
      expect(res.body.current).toBe('ready');
      expect(ordersChangedSpy).not.toHaveBeenCalled();
    });
  });

  // 6. Error Paths & Cross-Tenant Protection
  describe('6. Error Paths & Cross-Tenant Protection', () => {
    test('6.1 Returns 404 ORDER_ITEM_NOT_FOUND if orderId does not exist', async () => {
      const nonExistentOrderId = new mongoose.Types.ObjectId().toString();
      const uuid = crypto.randomUUID();

      const res = await request(app)
        .patch(`/api/orders/${nonExistentOrderId}/items/${uuid}/status`)
        .set('Authorization', `Bearer ${fixtures.kitchenAToken}`)
        .send({ status: 'preparing' });

      expect(res.status).toBe(404);
      expect(res.body.code).toBe('ORDER_NOT_FOUND');
      expect(ordersChangedSpy).not.toHaveBeenCalled();
    });

    test('6.2 Returns 404 ORDER_ITEM_NOT_FOUND if orderItemId does not exist in order', async () => {
      const { order } = await makeOrder(fixtures.restaurantA._id);
      const nonExistentItemId = crypto.randomUUID();

      const res = await request(app)
        .patch(`/api/orders/${order._id}/items/${nonExistentItemId}/status`)
        .set('Authorization', `Bearer ${fixtures.kitchenAToken}`)
        .send({ status: 'preparing' });

      expect(res.status).toBe(404);
      expect(res.body.code).toBe('ORDER_NOT_FOUND');
      expect(ordersChangedSpy).not.toHaveBeenCalled();
    });

    test('6.3 Returns 404 ORDER_ITEM_NOT_FOUND if order belongs to another restaurant', async () => {
      const { order, orderItemId } = await makeOrder(fixtures.restaurantA._id);

      // Kitchen B attempts to update restaurant A's order
      const res = await request(app)
        .patch(`/api/orders/${order._id}/items/${orderItemId}/status`)
        .set('Authorization', `Bearer ${kitchenBToken}`)
        .send({ status: 'preparing' });

      expect(res.status).toBe(404);
      expect(res.body.code).toBe('ORDER_NOT_FOUND');
      expect(ordersChangedSpy).not.toHaveBeenCalled();
    });

    test('6.4 Does not notify realtime.ordersChanged on error', async () => {
      const nonExistentOrderId = new mongoose.Types.ObjectId().toString();
      const uuid = crypto.randomUUID();

      await request(app)
        .patch(`/api/orders/${nonExistentOrderId}/items/${uuid}/status`)
        .set('Authorization', `Bearer ${fixtures.kitchenAToken}`)
        .send({ status: 'preparing' });

      expect(ordersChangedSpy).not.toHaveBeenCalled();
    });
  });

  // 7. Concurrency
  describe('7. Concurrency', () => {
    test('7.1 Concurrent status updates on DIFFERENT items in the same order both succeed', async () => {
      const { order, items } = await makeMultiItemOrder(fixtures.restaurantA._id, [
        { status: 'placed' },
        { status: 'placed' },
      ]);
      const [item1, item2] = items;

      const [res1, res2] = await Promise.all([
        request(app)
          .patch(`/api/orders/${order._id}/items/${item1.orderItemId}/status`)
          .set('Authorization', `Bearer ${fixtures.kitchenAToken}`)
          .send({ status: 'preparing' }),
        request(app)
          .patch(`/api/orders/${order._id}/items/${item2.orderItemId}/status`)
          .set('Authorization', `Bearer ${fixtures.kitchenAToken}`)
          .send({ status: 'preparing' }),
      ]);

      expect(res1.status).toBe(200);
      expect(res2.status).toBe(200);

      // Verify final database state
      const reloaded = await Order.findById(order._id).lean();
      expect(reloaded.items[0].status).toBe('preparing');
      expect(reloaded.items[1].status).toBe('preparing');
    });

    test('7.2 Concurrent identical status updates on the SAME item: one succeeds (200), one gets 409 INVALID_TRANSITION', async () => {
      const { order, orderItemId } = await makeOrder(fixtures.restaurantA._id);

      const [res1, res2] = await Promise.all([
        request(app)
          .patch(`/api/orders/${order._id}/items/${orderItemId}/status`)
          .set('Authorization', `Bearer ${fixtures.kitchenAToken}`)
          .send({ status: 'preparing' }),
        request(app)
          .patch(`/api/orders/${order._id}/items/${orderItemId}/status`)
          .set('Authorization', `Bearer ${fixtures.kitchenAToken}`)
          .send({ status: 'preparing' }),
      ]);

      const statuses = [res1.status, res2.status].sort();
      expect(statuses).toEqual([200, 409]);

      const errorRes = res1.status === 409 ? res1 : res2;
      expect(errorRes.body.code).toBe('INVALID_MOVE');
      expect(errorRes.body.current).toBe('preparing');
    });
  });

  describe('8. Session Notifications on Cancellation', () => {
    test('8.1 Staff cancel of a placed dish calls realtime.sessionChanged exactly once with orders sessionId, and ordersChanged', async () => {
      const sessionChangedSpy = jest.spyOn(realtime, 'sessionChanged');
      sessionChangedSpy.mockClear();
      ordersChangedSpy.mockClear();

      const { order, orderItemId } = await makeOrder(fixtures.restaurantA._id);

      const res = await request(app)
        .patch(`/api/orders/${order._id}/items/${orderItemId}/status`)
        .set('Authorization', `Bearer ${fixtures.kitchenAToken}`)
        .send({ status: 'cancelled' });

      expect(res.status).toBe(200);
      expect(sessionChangedSpy).toHaveBeenCalledTimes(1);
      expect(sessionChangedSpy).toHaveBeenCalledWith(order.sessionId);
      expect(ordersChangedSpy).toHaveBeenCalledTimes(1);
      expect(ordersChangedSpy).toHaveBeenCalledWith(String(fixtures.restaurantA._id));

      sessionChangedSpy.mockRestore();
    });

    test('8.2 Status transitions to preparing, ready, and served never call realtime.sessionChanged', async () => {
      const sessionChangedSpy = jest.spyOn(realtime, 'sessionChanged');
      sessionChangedSpy.mockClear();
      ordersChangedSpy.mockClear();

      const { order, orderItemId } = await makeOrder(fixtures.restaurantA._id);

      // placed -> preparing
      const resPrep = await request(app)
        .patch(`/api/orders/${order._id}/items/${orderItemId}/status`)
        .set('Authorization', `Bearer ${fixtures.kitchenAToken}`)
        .send({ status: 'preparing' });
      expect(resPrep.status).toBe(200);
      expect(sessionChangedSpy).not.toHaveBeenCalled();
      expect(ordersChangedSpy).toHaveBeenCalledTimes(1);

      // preparing -> ready
      ordersChangedSpy.mockClear();
      const resReady = await request(app)
        .patch(`/api/orders/${order._id}/items/${orderItemId}/status`)
        .set('Authorization', `Bearer ${fixtures.kitchenAToken}`)
        .send({ status: 'ready' });
      expect(resReady.status).toBe(200);
      expect(sessionChangedSpy).not.toHaveBeenCalled();
      expect(ordersChangedSpy).toHaveBeenCalledTimes(1);

      // ready -> served
      ordersChangedSpy.mockClear();
      const resServed = await request(app)
        .patch(`/api/orders/${order._id}/items/${orderItemId}/status`)
        .set('Authorization', `Bearer ${fixtures.kitchenAToken}`)
        .send({ status: 'served' });
      expect(resServed.status).toBe(200);
      expect(sessionChangedSpy).not.toHaveBeenCalled();
      expect(ordersChangedSpy).toHaveBeenCalledTimes(1);

      sessionChangedSpy.mockRestore();
    });

    test('8.3 Failed status transitions never call realtime.sessionChanged', async () => {
      const sessionChangedSpy = jest.spyOn(realtime, 'sessionChanged');
      sessionChangedSpy.mockClear();

      const { order, orderItemId } = await makeOrder(fixtures.restaurantA._id);

      // Invalid move: placed -> served
      const invalidRes = await request(app)
        .patch(`/api/orders/${order._id}/items/${orderItemId}/status`)
        .set('Authorization', `Bearer ${fixtures.kitchenAToken}`)
        .send({ status: 'served' });
      expect(invalidRes.status).toBe(409);
      expect(sessionChangedSpy).not.toHaveBeenCalled();

      // Unknown order
      const unknownOrderRes = await request(app)
        .patch(`/api/orders/${new mongoose.Types.ObjectId()}/items/${orderItemId}/status`)
        .set('Authorization', `Bearer ${fixtures.kitchenAToken}`)
        .send({ status: 'cancelled' });
      expect(unknownOrderRes.status).toBe(404);
      expect(sessionChangedSpy).not.toHaveBeenCalled();

      // Unknown item in order
      const unknownItemRes = await request(app)
        .patch(`/api/orders/${order._id}/items/${crypto.randomUUID()}/status`)
        .set('Authorization', `Bearer ${fixtures.kitchenAToken}`)
        .send({ status: 'cancelled' });
      expect(unknownItemRes.status).toBe(404);
      expect(sessionChangedSpy).not.toHaveBeenCalled();

      // Dish already cancelled: cancelling again gives 409 and no sessionChanged
      await Order.updateOne(
        { _id: order._id, 'items.orderItemId': orderItemId },
        { $set: { 'items.$.status': 'cancelled' } }
      );
      sessionChangedSpy.mockClear();
      const alreadyCancelledRes = await request(app)
        .patch(`/api/orders/${order._id}/items/${orderItemId}/status`)
        .set('Authorization', `Bearer ${fixtures.kitchenAToken}`)
        .send({ status: 'cancelled' });
      expect(alreadyCancelledRes.status).toBe(409);
      expect(sessionChangedSpy).not.toHaveBeenCalled();

      sessionChangedSpy.mockRestore();
    });

    test('8.4 Staff cancel on order without sessionId succeeds without calling sessionChanged', async () => {
      const sessionChangedSpy = jest.spyOn(realtime, 'sessionChanged');
      sessionChangedSpy.mockClear();

      const dish = await makeDish(fixtures.restaurantA._id);
      const orderItemId = crypto.randomUUID();
      const orderDoc = {
        restaurantId: fixtures.restaurantA._id,
        tableNumber: 15,
        status: 'placed',
        items: [
          {
            orderItemId,
            itemId: dish._id,
            name: dish.name,
            price: dish.price,
            qty: 1,
            orderedBy: 'WalkIn',
            allergyFlags: [],
            isSurprise: false,
            revealed: false,
            status: 'placed',
          },
        ],
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      const insertResult = await Order.collection.insertOne(orderDoc);
      const order = { _id: insertResult.insertedId, ...orderDoc };

      const res = await request(app)
        .patch(`/api/orders/${order._id}/items/${orderItemId}/status`)
        .set('Authorization', `Bearer ${fixtures.kitchenAToken}`)
        .send({ status: 'cancelled' });

      expect(res.status).toBe(200);
      expect(sessionChangedSpy).not.toHaveBeenCalled();

      sessionChangedSpy.mockRestore();
    });
  });
});
