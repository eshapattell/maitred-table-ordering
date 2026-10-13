// cartRoutes.test.js: Integration tests for shared live table cart routes
import crypto from 'crypto';
import mongoose from 'mongoose';
import request from 'supertest';
import { jest } from '@jest/globals';
import { app } from '../server.js';
import Table from '../models/Table.js';
import TableSession from '../models/TableSession.js';
import MenuItem from '../models/MenuItem.js';
import { CART_LIMITS } from '../utils/cartRules.js';
import { realtime } from '../utils/realtime.js';
import { connectTestDb, clearTestDb, disconnectTestDb } from '../config/testDb.js';
import { createFixtures } from '../config/testFixtures.js';

describe('Shared Table Cart Routes (/api/sessions/cart)', () => {
  let fixtures;

  beforeAll(async () => {
    await connectTestDb();
    await clearTestDb();
    fixtures = await createFixtures();
    await TableSession.init();
  });

  afterAll(async () => {
    await disconnectTestDb();
  });

  let tableCounter = 10;
  let phoneCounter = 9825000000;

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
    };
  };

  describe('1. Guards and Input Validation', () => {
    test('1.1. no token gives 401 INVALID_TOKEN', async () => {
      const res = await request(app).get('/api/sessions/cart');
      expect(res.status).toBe(401);
      expect(res.body.code).toBe('INVALID_TOKEN');
    });

    test('1.2. staff token gives 401 INVALID_TOKEN', async () => {
      const res = await request(app)
        .get('/api/sessions/cart')
        .set('Authorization', `Bearer ${fixtures.ownerAToken}`);
      expect(res.status).toBe(401);
      expect(res.body.code).toBe('INVALID_TOKEN');
    });

    test('1.3. garbage token gives 401 INVALID_TOKEN', async () => {
      const res = await request(app)
        .get('/api/sessions/cart')
        .set('Authorization', 'Bearer garbage.jwt.token');
      expect(res.status).toBe(401);
      expect(res.body.code).toBe('INVALID_TOKEN');
    });

    test('1.4. waiting (pending) guest gets 403 APPROVAL_PENDING', async () => {
      const table = await makeTable(fixtures.restaurantA._id);
      await joinGuest(table, 'Host');
      const pendingGuest = await joinGuest(table, 'Pending');
      const res = await request(app)
        .get('/api/sessions/cart')
        .set('Authorization', `Bearer ${pendingGuest.token}`);
      expect(res.status).toBe(403);
      expect(res.body.code).toBe('APPROVAL_PENDING');
    });

    test('1.5. guest without allergy answer gets 403 ALLERGIES_REQUIRED', async () => {
      const table = await makeTable(fixtures.restaurantA._id);
      const host = await joinGuest(table, 'HostNoAllergies');
      const res = await request(app)
        .get('/api/sessions/cart')
        .set('Authorization', `Bearer ${host.token}`);
      expect(res.status).toBe(403);
      expect(res.body.code).toBe('ALLERGIES_REQUIRED');
    });

    test('1.6. closed session gives 401 SESSION_CLOSED', async () => {
      const table = await makeTable(fixtures.restaurantA._id);
      const host = await setupHost(table);
      await TableSession.updateOne({ _id: host.sessionId }, { $set: { status: 'closed' } });
      const res = await request(app)
        .get('/api/sessions/cart')
        .set('Authorization', `Bearer ${host.token}`);
      expect(res.status).toBe(401);
      expect(res.body.code).toBe('SESSION_CLOSED');
    });

    test('1.7. removed guest gives 401 PARTICIPANT_REMOVED', async () => {
      const table = await makeTable(fixtures.restaurantA._id);
      const host = await setupHost(table);
      const guest = await setupApprovedGuest(table, host.token, 'RemovedGuest');
      await TableSession.updateOne(
        { _id: host.sessionId },
        { $pull: { participants: { id: guest.participantId } } }
      );
      const res = await request(app)
        .get('/api/sessions/cart')
        .set('Authorization', `Bearer ${guest.token}`);
      expect(res.status).toBe(401);
      expect(res.body.code).toBe('PARTICIPANT_REMOVED');
    });

    test('1.8. POST /items with malicious menuItemId { "$ne": null } gives 400 INVALID_INPUT', async () => {
      const table = await makeTable(fixtures.restaurantA._id);
      const host = await setupHost(table);
      const res = await request(app)
        .post('/api/sessions/cart/items')
        .set('Authorization', `Bearer ${host.token}`)
        .send({ menuItemId: { $ne: null } });
      expect(res.status).toBe(400);
      expect(res.body.code).toBe('INVALID_INPUT');
    });

    test('1.9. POST /items with string quantity ("2") gives 400 INVALID_INPUT', async () => {
      const table = await makeTable(fixtures.restaurantA._id);
      const host = await setupHost(table);
      const dish = await makeDish(fixtures.restaurantA._id);
      const res = await request(app)
        .post('/api/sessions/cart/items')
        .set('Authorization', `Bearer ${host.token}`)
        .send({ menuItemId: String(dish._id), quantity: '2' });
      expect(res.status).toBe(400);
      expect(res.body.code).toBe('INVALID_INPUT');
    });

    test('1.10. POST /items with quantity 0, 21, and 1.5 give 400 INVALID_INPUT', async () => {
      const table = await makeTable(fixtures.restaurantA._id);
      const host = await setupHost(table);
      const dish = await makeDish(fixtures.restaurantA._id);

      for (const q of [0, 21, 1.5, -1]) {
        const res = await request(app)
          .post('/api/sessions/cart/items')
          .set('Authorization', `Bearer ${host.token}`)
          .send({ menuItemId: String(dish._id), quantity: q });
        expect(res.status).toBe(400);
        expect(res.body.code).toBe('INVALID_INPUT');
      }
    });

    test('1.11. POST /items ignores isSurprise: true in body and succeeds as normal line', async () => {
      const table = await makeTable(fixtures.restaurantA._id);
      const host = await setupHost(table);
      const dish = await makeDish(fixtures.restaurantA._id);

      const res = await request(app)
        .post('/api/sessions/cart/items')
        .set('Authorization', `Bearer ${host.token}`)
        .send({ menuItemId: String(dish._id), isSurprise: true });
      expect(res.status).toBe(200);
      expect(res.body.cart.lines[0].isSurprise).toBe(false);
      expect(res.body.cart.lines[0].name).toBe(dish.name);
    });

    test('1.12. PATCH with invalid cartItemId gives 400 INVALID_INPUT', async () => {
      const table = await makeTable(fixtures.restaurantA._id);
      const host = await setupHost(table);
      const res = await request(app)
        .patch('/api/sessions/cart/items/not-a-uuid')
        .set('Authorization', `Bearer ${host.token}`)
        .send({ delta: -1 });
      expect(res.status).toBe(400);
      expect(res.body.code).toBe('INVALID_INPUT');
    });

    test('1.13. PATCH with invalid body (delta: 1, delta: -2, empty body) gives 400 INVALID_INPUT', async () => {
      const table = await makeTable(fixtures.restaurantA._id);
      const host = await setupHost(table);
      const fakeUuid = crypto.randomUUID();

      for (const b of [{ delta: 1 }, { delta: -2 }, {}, { delta: 'minus-one' }]) {
        const res = await request(app)
          .patch(`/api/sessions/cart/items/${fakeUuid}`)
          .set('Authorization', `Bearer ${host.token}`)
          .send(b);
        expect(res.status).toBe(400);
        expect(res.body.code).toBe('INVALID_INPUT');
      }
    });

    test('1.14. DELETE with invalid cartItemId gives 400 INVALID_INPUT', async () => {
      const table = await makeTable(fixtures.restaurantA._id);
      const host = await setupHost(table);
      const res = await request(app)
        .delete('/api/sessions/cart/items/invalid-uuid')
        .set('Authorization', `Bearer ${host.token}`);
      expect(res.status).toBe(400);
      expect(res.body.code).toBe('INVALID_INPUT');
    });
  });

  describe('2. Adding Items (POST /items)', () => {
    test('2.1. first add creates one line with quantity 1 and stored shape of newCartLine', async () => {
      const table = await makeTable(fixtures.restaurantA._id);
      const host = await setupHost(table);
      const dish = await makeDish(fixtures.restaurantA._id, { price: 300 });

      const res = await request(app)
        .post('/api/sessions/cart/items')
        .set('Authorization', `Bearer ${host.token}`)
        .send({ menuItemId: String(dish._id) });

      expect(res.status).toBe(200);
      expect(res.body.cart.version).toBe(1);
      expect(res.body.cart.lines).toHaveLength(1);
      const line = res.body.cart.lines[0];
      expect(line.quantity).toBe(1);
      expect(line.menuItemId).toBe(String(dish._id));
      expect(line.price).toBe(300);
      expect(line.lineTotal).toBe(300);
      expect(line.canEdit).toBe(true);
    });

    test('2.2. raw collection read shows itemId is an ObjectId and not a string', async () => {
      const table = await makeTable(fixtures.restaurantA._id);
      const host = await setupHost(table);
      const dish = await makeDish(fixtures.restaurantA._id);

      await request(app)
        .post('/api/sessions/cart/items')
        .set('Authorization', `Bearer ${host.token}`)
        .send({ menuItemId: String(dish._id) });

      const raw = await TableSession.collection.findOne({
        _id: new mongoose.Types.ObjectId(host.sessionId),
      });
      expect(raw.cart).toHaveLength(1);
      const rawLine = raw.cart[0];
      expect(rawLine.itemId).toBeInstanceOf(mongoose.Types.ObjectId);
      expect(String(rawLine.itemId)).toBe(String(dish._id));
      expect(typeof rawLine.itemId).toBe('object');
    });

    test('2.3. same guest adding again raises existing line instead of making second line', async () => {
      const table = await makeTable(fixtures.restaurantA._id);
      const host = await setupHost(table);
      const dish = await makeDish(fixtures.restaurantA._id);

      await request(app)
        .post('/api/sessions/cart/items')
        .set('Authorization', `Bearer ${host.token}`)
        .send({ menuItemId: String(dish._id) });

      const res2 = await request(app)
        .post('/api/sessions/cart/items')
        .set('Authorization', `Bearer ${host.token}`)
        .send({ menuItemId: String(dish._id) });

      expect(res2.status).toBe(200);
      expect(res2.body.cart.version).toBe(2);
      expect(res2.body.cart.lines).toHaveLength(1);
      expect(res2.body.cart.lines[0].quantity).toBe(2);
    });

    test('2.4. second guest adding same dish gets their own line', async () => {
      const table = await makeTable(fixtures.restaurantA._id);
      const host = await setupHost(table);
      const guest = await setupApprovedGuest(table, host.token, 'GuestTwo');
      const dish = await makeDish(fixtures.restaurantA._id);

      await request(app)
        .post('/api/sessions/cart/items')
        .set('Authorization', `Bearer ${host.token}`)
        .send({ menuItemId: String(dish._id) });

      const resGuest = await request(app)
        .post('/api/sessions/cart/items')
        .set('Authorization', `Bearer ${guest.token}`)
        .send({ menuItemId: String(dish._id) });

      expect(resGuest.status).toBe(200);
      expect(resGuest.body.cart.lines).toHaveLength(2);
      const lines = resGuest.body.cart.lines;
      expect(lines[0].addedBy.id).toBe(host.participantId);
      expect(lines[1].addedBy.id).toBe(guest.participantId);
    });

    test('2.5. quantity in request body is honored', async () => {
      const table = await makeTable(fixtures.restaurantA._id);
      const host = await setupHost(table);
      const dish = await makeDish(fixtures.restaurantA._id);

      const res = await request(app)
        .post('/api/sessions/cart/items')
        .set('Authorization', `Bearer ${host.token}`)
        .send({ menuItemId: String(dish._id), quantity: 5 });

      expect(res.status).toBe(200);
      expect(res.body.cart.lines[0].quantity).toBe(5);
    });

    test('2.6. QTY_LIMIT: line at 19 adding 2 answers 409 QTY_LIMIT and changes nothing', async () => {
      const table = await makeTable(fixtures.restaurantA._id);
      const host = await setupHost(table);
      const dish = await makeDish(fixtures.restaurantA._id);

      await request(app)
        .post('/api/sessions/cart/items')
        .set('Authorization', `Bearer ${host.token}`)
        .send({ menuItemId: String(dish._id), quantity: 19 });

      const res = await request(app)
        .post('/api/sessions/cart/items')
        .set('Authorization', `Bearer ${host.token}`)
        .send({ menuItemId: String(dish._id), quantity: 2 });

      expect(res.status).toBe(409);
      expect(res.body.code).toBe('QTY_LIMIT');

      const cartRes = await request(app)
        .get('/api/sessions/cart')
        .set('Authorization', `Bearer ${host.token}`);
      expect(cartRes.body.cart.lines[0].quantity).toBe(19);
      expect(cartRes.body.cart.version).toBe(1);
    });

    test('2.7. CART_FULL: cart holding 40 lines answers 409 CART_FULL when adding 41st line', async () => {
      const table = await makeTable(fixtures.restaurantA._id);
      const host = await setupHost(table);

      // Seed 40 lines directly through model
      const lines = [];
      for (let i = 0; i < CART_LIMITS.maxLines; i++) {
        lines.push({
          cartItemId: crypto.randomUUID(),
          itemId: new mongoose.Types.ObjectId(),
          qty: 1,
          addedBy: host.participantId,
          isSurprise: false,
        });
      }
      await TableSession.updateOne({ _id: host.sessionId }, { $set: { cart: lines } });

      const dish = await makeDish(fixtures.restaurantA._id);
      const res = await request(app)
        .post('/api/sessions/cart/items')
        .set('Authorization', `Bearer ${host.token}`)
        .send({ menuItemId: String(dish._id) });

      expect(res.status).toBe(409);
      expect(res.body.code).toBe('CART_FULL');
    });

    test('2.8. adding dish from another restaurant gives 404 ITEM_NOT_FOUND', async () => {
      const table = await makeTable(fixtures.restaurantA._id);
      const host = await setupHost(table);
      const dishB = await makeDish(fixtures.restaurantB._id);

      const res = await request(app)
        .post('/api/sessions/cart/items')
        .set('Authorization', `Bearer ${host.token}`)
        .send({ menuItemId: String(dishB._id) });

      expect(res.status).toBe(404);
      expect(res.body.code).toBe('ITEM_NOT_FOUND');
    });

    test('2.9. adding unavailable (hidden) dish gives 404 ITEM_NOT_FOUND', async () => {
      const table = await makeTable(fixtures.restaurantA._id);
      const host = await setupHost(table);
      const hiddenDish = await makeDish(fixtures.restaurantA._id, { available: false });

      const res = await request(app)
        .post('/api/sessions/cart/items')
        .set('Authorization', `Bearer ${host.token}`)
        .send({ menuItemId: String(hiddenDish._id) });

      expect(res.status).toBe(404);
      expect(res.body.code).toBe('ITEM_NOT_FOUND');
    });

    test('2.10. adding non-existent dish gives 404 ITEM_NOT_FOUND', async () => {
      const table = await makeTable(fixtures.restaurantA._id);
      const host = await setupHost(table);
      const fakeId = new mongoose.Types.ObjectId().toString();

      const res = await request(app)
        .post('/api/sessions/cart/items')
        .set('Authorization', `Bearer ${host.token}`)
        .send({ menuItemId: fakeId });

      expect(res.status).toBe(404);
      expect(res.body.code).toBe('ITEM_NOT_FOUND');
    });
  });

  describe('3. Safety and Allergy Checks on Add', () => {
    test('3.1. guest with peanut allergy gets 409 NOT_SAFE on peanut dish, cart unchanged', async () => {
      const table = await makeTable(fixtures.restaurantA._id);
      const host = await setupHost(table, ['peanut']);
      const peanutDish = await makeDish(fixtures.restaurantA._id, {
        allergens: ['peanut'],
        allergensConfirmed: true,
      });

      const res = await request(app)
        .post('/api/sessions/cart/items')
        .set('Authorization', `Bearer ${host.token}`)
        .send({ menuItemId: String(peanutDish._id) });

      expect(res.status).toBe(409);
      expect(res.body.code).toBe('NOT_SAFE');
      expect(res.body.reason).toBe('allergen');
      expect(res.body.clashes).toContain('peanut');

      const cartRes = await request(app)
        .get('/api/sessions/cart')
        .set('Authorization', `Bearer ${host.token}`);
      expect(cartRes.body.cart.lines).toHaveLength(0);
      expect(cartRes.body.cart.version).toBe(0);
    });

    test('3.2. unconfirmed dish is NOT_SAFE for allergic guest with reason unconfirmed', async () => {
      const table = await makeTable(fixtures.restaurantA._id);
      const host = await setupHost(table, ['dairy']);
      const unconfirmedDish = await makeDish(fixtures.restaurantA._id, {
        allergens: [],
        allergensConfirmed: false,
      });

      const res = await request(app)
        .post('/api/sessions/cart/items')
        .set('Authorization', `Bearer ${host.token}`)
        .send({ menuItemId: String(unconfirmedDish._id) });

      expect(res.status).toBe(409);
      expect(res.body.code).toBe('NOT_SAFE');
      expect(res.body.reason).toBe('unconfirmed');
    });

    test('3.3. unconfirmed dish succeeds for guest with no allergies ([])', async () => {
      const table = await makeTable(fixtures.restaurantA._id);
      const host = await setupHost(table, []);
      const unconfirmedDish = await makeDish(fixtures.restaurantA._id, {
        allergens: [],
        allergensConfirmed: false,
      });

      const res = await request(app)
        .post('/api/sessions/cart/items')
        .set('Authorization', `Bearer ${host.token}`)
        .send({ menuItemId: String(unconfirmedDish._id) });

      expect(res.status).toBe(200);
      expect(res.body.cart.lines).toHaveLength(1);
    });

    test('3.4. peanut dish succeeds for guest with no allergies ([])', async () => {
      const table = await makeTable(fixtures.restaurantA._id);
      const host = await setupHost(table, []);
      const peanutDish = await makeDish(fixtures.restaurantA._id, {
        allergens: ['peanut'],
        allergensConfirmed: true,
      });

      const res = await request(app)
        .post('/api/sessions/cart/items')
        .set('Authorization', `Bearer ${host.token}`)
        .send({ menuItemId: String(peanutDish._id) });

      expect(res.status).toBe(200);
      expect(res.body.cart.lines[0].safeForYou).toBe(true);
    });

    test('3.5. safe dish (no allergens) succeeds for guest with dairy allergy', async () => {
      const table = await makeTable(fixtures.restaurantA._id);
      const host = await setupHost(table, ['dairy']);
      const safeDish = await makeDish(fixtures.restaurantA._id, {
        allergens: [],
        allergensConfirmed: true,
      });

      const res = await request(app)
        .post('/api/sessions/cart/items')
        .set('Authorization', `Bearer ${host.token}`)
        .send({ menuItemId: String(safeDish._id) });

      expect(res.status).toBe(200);
      expect(res.body.cart.lines[0].safeForYou).toBe(true);
    });

    test('3.6. repeated failed add due to safety leaves cart empty and cartVersion at 0', async () => {
      const table = await makeTable(fixtures.restaurantA._id);
      const host = await setupHost(table, ['shellfish']);
      const prawnDish = await makeDish(fixtures.restaurantA._id, {
        allergens: ['shellfish'],
        allergensConfirmed: true,
      });

      await request(app)
        .post('/api/sessions/cart/items')
        .set('Authorization', `Bearer ${host.token}`)
        .send({ menuItemId: String(prawnDish._id) });

      await request(app)
        .post('/api/sessions/cart/items')
        .set('Authorization', `Bearer ${host.token}`)
        .send({ menuItemId: String(prawnDish._id) });

      const cartRes = await request(app)
        .get('/api/sessions/cart')
        .set('Authorization', `Bearer ${host.token}`);
      expect(cartRes.body.cart.lines).toHaveLength(0);
      expect(cartRes.body.cart.version).toBe(0);
    });
  });

  describe('4. Personal Cart View (buildCartView)', () => {
    test('4.1. two guests with different allergies get different safeForYou flags for same line', async () => {
      const table = await makeTable(fixtures.restaurantA._id);
      const host = await setupHost(table, ['dairy']);
      const guest = await setupApprovedGuest(table, host.token, 'GuestNoDairy', []);

      const dairyDish = await makeDish(fixtures.restaurantA._id, {
        allergens: ['dairy'],
        allergensConfirmed: true,
      });

      await request(app)
        .post('/api/sessions/cart/items')
        .set('Authorization', `Bearer ${guest.token}`)
        .send({ menuItemId: String(dairyDish._id) });

      const hostView = await request(app)
        .get('/api/sessions/cart')
        .set('Authorization', `Bearer ${host.token}`);
      const guestView = await request(app)
        .get('/api/sessions/cart')
        .set('Authorization', `Bearer ${guest.token}`);

      expect(hostView.body.cart.lines[0].safeForYou).toBe(false);
      expect(hostView.body.cart.lines[0].reason).toBe('allergen');
      expect(hostView.body.cart.lines[0].clashes).toContain('dairy');

      expect(guestView.body.cart.lines[0].safeForYou).toBe(true);
      expect(guestView.body.cart.lines[0].reason).toBe('ok');
      expect(guestView.body.cart.lines[0].clashes).toHaveLength(0);
    });

    test('4.2. no allergy, phone, or token ever appears anywhere in cart response JSON', async () => {
      const table = await makeTable(fixtures.restaurantA._id);
      const host = await setupHost(table, ['peanut']);
      const guestPhone = nextPhone();
      const guest = await setupApprovedGuest(table, host.token, 'GuestSec', ['soy']);
      const dish = await makeDish(fixtures.restaurantA._id);

      await request(app)
        .post('/api/sessions/cart/items')
        .set('Authorization', `Bearer ${host.token}`)
        .send({ menuItemId: String(dish._id) });

      const res = await request(app)
        .get('/api/sessions/cart')
        .set('Authorization', `Bearer ${host.token}`);

      const jsonStr = JSON.stringify(res.body);
      expect(jsonStr).not.toContain('peanut');
      expect(jsonStr).not.toContain('soy');
      expect(jsonStr).not.toContain(guestPhone);
      expect(jsonStr).not.toContain(host.token);
      expect(jsonStr).not.toContain(guest.token);
    });

    test('4.3. dish name and price come live from the menu', async () => {
      const table = await makeTable(fixtures.restaurantA._id);
      const host = await setupHost(table);
      const dish = await makeDish(fixtures.restaurantA._id, { name: 'Live Salad', price: 150 });

      await request(app)
        .post('/api/sessions/cart/items')
        .set('Authorization', `Bearer ${host.token}`)
        .send({ menuItemId: String(dish._id) });

      // Owner updates dish price and name
      await MenuItem.updateOne({ _id: dish._id }, { $set: { name: 'Premium Live Salad', price: 200 } });

      const res = await request(app)
        .get('/api/sessions/cart')
        .set('Authorization', `Bearer ${host.token}`);
      expect(res.body.cart.lines[0].name).toBe('Premium Live Salad');
      expect(res.body.cart.lines[0].price).toBe(200);
      expect(res.body.cart.lines[0].lineTotal).toBe(200);
    });

    test('4.4. dish owner hides after add stays in cart as unavailable and left out of total', async () => {
      const table = await makeTable(fixtures.restaurantA._id);
      const host = await setupHost(table);
      const dish1 = await makeDish(fixtures.restaurantA._id, { price: 100 });
      const dish2 = await makeDish(fixtures.restaurantA._id, { price: 200 });

      await request(app)
        .post('/api/sessions/cart/items')
        .set('Authorization', `Bearer ${host.token}`)
        .send({ menuItemId: String(dish1._id) });
      await request(app)
        .post('/api/sessions/cart/items')
        .set('Authorization', `Bearer ${host.token}`)
        .send({ menuItemId: String(dish2._id) });

      // Owner marks dish 2 unavailable
      await MenuItem.updateOne({ _id: dish2._id }, { $set: { available: false } });

      const res = await request(app)
        .get('/api/sessions/cart')
        .set('Authorization', `Bearer ${host.token}`);

      const l2 = res.body.cart.lines.find((l) => l.menuItemId === String(dish2._id));
      expect(l2.unavailable).toBe(true);
      expect(l2.price).toBeNull();
      expect(l2.lineTotal).toBeNull();
      // Total should only count dish 1 (100)
      expect(res.body.cart.total).toBe(100);
    });

    test('4.5. lines of removed guest show addedBy.nickname "Former guest"', async () => {
      const table = await makeTable(fixtures.restaurantA._id);
      const host = await setupHost(table);
      const guest = await setupApprovedGuest(table, host.token, 'DepartingGuest');
      const dish = await makeDish(fixtures.restaurantA._id);

      await request(app)
        .post('/api/sessions/cart/items')
        .set('Authorization', `Bearer ${guest.token}`)
        .send({ menuItemId: String(dish._id) });

      // Remove guest from session
      await TableSession.updateOne(
        { _id: host.sessionId },
        { $pull: { participants: { id: guest.participantId } } }
      );

      const res = await request(app)
        .get('/api/sessions/cart')
        .set('Authorization', `Bearer ${host.token}`);
      expect(res.body.cart.lines[0].addedBy.nickname).toBe('Former guest');
    });

    test('4.6. only host can edit or remove lines of removed guest', async () => {
      const table = await makeTable(fixtures.restaurantA._id);
      const host = await setupHost(table);
      const guest1 = await setupApprovedGuest(table, host.token, 'GuestOne');
      const guest2 = await setupApprovedGuest(table, host.token, 'GuestTwo');
      const dish = await makeDish(fixtures.restaurantA._id);

      await request(app)
        .post('/api/sessions/cart/items')
        .set('Authorization', `Bearer ${guest1.token}`)
        .send({ menuItemId: String(dish._id), quantity: 3 });

      // Remove guest1
      await TableSession.updateOne(
        { _id: host.sessionId },
        { $pull: { participants: { id: guest1.participantId } } }
      );

      const hostView = await request(app)
        .get('/api/sessions/cart')
        .set('Authorization', `Bearer ${host.token}`);
      const guest2View = await request(app)
        .get('/api/sessions/cart')
        .set('Authorization', `Bearer ${guest2.token}`);

      expect(hostView.body.cart.lines[0].canEdit).toBe(true);
      expect(guest2View.body.cart.lines[0].canEdit).toBe(false);

      const cartItemId = hostView.body.cart.lines[0].id;
      // Guest2 cannot decrease or delete
      const patchGuest2 = await request(app)
        .patch(`/api/sessions/cart/items/${cartItemId}`)
        .set('Authorization', `Bearer ${guest2.token}`)
        .send({ delta: -1 });
      expect(patchGuest2.status).toBe(404);

      // Host can decrease
      const patchHost = await request(app)
        .patch(`/api/sessions/cart/items/${cartItemId}`)
        .set('Authorization', `Bearer ${host.token}`)
        .send({ delta: -1 });
      expect(patchHost.status).toBe(200);
      expect(patchHost.body.cart.lines[0].quantity).toBe(2);
    });

    test('4.7. surprise line inserted via model sets hasHiddenLines true and hides dish details', async () => {
      const table = await makeTable(fixtures.restaurantA._id);
      const host = await setupHost(table);
      const dish = await makeDish(fixtures.restaurantA._id, { price: 400 });

      // Add a surprise line directly through model
      await TableSession.updateOne(
        { _id: host.sessionId },
        {
          $push: {
            cart: {
              cartItemId: crypto.randomUUID(),
              itemId: dish._id,
              qty: 1,
              addedBy: host.participantId,
              isSurprise: true,
            },
          },
        }
      );

      const res = await request(app)
        .get('/api/sessions/cart')
        .set('Authorization', `Bearer ${host.token}`);
      expect(res.body.cart.hasHiddenLines).toBe(true);
      const line = res.body.cart.lines[0];
      expect(line.isSurprise).toBe(true);
      expect(line.menuItemId).toBeNull();
      expect(line.price).toBeNull();
      expect(line.lineTotal).toBeNull();
      expect(line.name).toBe('Surprise dish');
    });

    test('4.8. cartVersion rises by exactly 1 per successful change and 0 on failure', async () => {
      const table = await makeTable(fixtures.restaurantA._id);
      const host = await setupHost(table);
      const dish = await makeDish(fixtures.restaurantA._id);

      // Success add -> version 1
      const res1 = await request(app)
        .post('/api/sessions/cart/items')
        .set('Authorization', `Bearer ${host.token}`)
        .send({ menuItemId: String(dish._id) });
      expect(res1.body.cart.version).toBe(1);

      // Failed add -> version stays 1
      const failRes = await request(app)
        .post('/api/sessions/cart/items')
        .set('Authorization', `Bearer ${host.token}`)
        .send({ menuItemId: 'non-existent-id' });
      expect(failRes.status).toBe(400);

      const check1 = await request(app)
        .get('/api/sessions/cart')
        .set('Authorization', `Bearer ${host.token}`);
      expect(check1.body.cart.version).toBe(1);

      // Success add again -> version 2
      const res2 = await request(app)
        .post('/api/sessions/cart/items')
        .set('Authorization', `Bearer ${host.token}`)
        .send({ menuItemId: String(dish._id) });
      expect(res2.body.cart.version).toBe(2);

      // Success patch -> version 3
      const cartItemId = res2.body.cart.lines[0].id;
      const res3 = await request(app)
        .patch(`/api/sessions/cart/items/${cartItemId}`)
        .set('Authorization', `Bearer ${host.token}`)
        .send({ delta: -1 });
      expect(res3.body.cart.version).toBe(3);

      // Success delete -> version 4
      const res4 = await request(app)
        .delete(`/api/sessions/cart/items/${cartItemId}`)
        .set('Authorization', `Bearer ${host.token}`);
      expect(res4.body.cart.version).toBe(4);
    });
  });

  describe('5. Decreasing Line (PATCH /items/:cartItemId)', () => {
    test('5.1. PATCH 3 becomes 2', async () => {
      const table = await makeTable(fixtures.restaurantA._id);
      const host = await setupHost(table);
      const dish = await makeDish(fixtures.restaurantA._id);

      const addRes = await request(app)
        .post('/api/sessions/cart/items')
        .set('Authorization', `Bearer ${host.token}`)
        .send({ menuItemId: String(dish._id), quantity: 3 });

      const cartItemId = addRes.body.cart.lines[0].id;
      const patchRes = await request(app)
        .patch(`/api/sessions/cart/items/${cartItemId}`)
        .set('Authorization', `Bearer ${host.token}`)
        .send({ delta: -1 });

      expect(patchRes.status).toBe(200);
      expect(patchRes.body.cart.lines[0].quantity).toBe(2);
    });

    test('5.2. PATCH at quantity 1 answers 409 MIN_QTY and changes nothing', async () => {
      const table = await makeTable(fixtures.restaurantA._id);
      const host = await setupHost(table);
      const dish = await makeDish(fixtures.restaurantA._id);

      const addRes = await request(app)
        .post('/api/sessions/cart/items')
        .set('Authorization', `Bearer ${host.token}`)
        .send({ menuItemId: String(dish._id), quantity: 1 });

      const cartItemId = addRes.body.cart.lines[0].id;
      const patchRes = await request(app)
        .patch(`/api/sessions/cart/items/${cartItemId}`)
        .set('Authorization', `Bearer ${host.token}`)
        .send({ delta: -1 });

      expect(patchRes.status).toBe(409);
      expect(patchRes.body.code).toBe('MIN_QTY');

      const cartRes = await request(app)
        .get('/api/sessions/cart')
        .set('Authorization', `Bearer ${host.token}`);
      expect(cartRes.body.cart.lines[0].quantity).toBe(1);
    });

    test('5.3. another guest line is 404 for ordinary guest and allowed for host', async () => {
      const table = await makeTable(fixtures.restaurantA._id);
      const host = await setupHost(table);
      const guest = await setupApprovedGuest(table, host.token, 'GuestPatch');
      const dish = await makeDish(fixtures.restaurantA._id);

      // Guest adds line with quantity 2
      const addRes = await request(app)
        .post('/api/sessions/cart/items')
        .set('Authorization', `Bearer ${guest.token}`)
        .send({ menuItemId: String(dish._id), quantity: 2 });
      const cartItemId = addRes.body.cart.lines[0].id;

      // Another guest attempts to patch
      const guest2 = await setupApprovedGuest(table, host.token, 'GuestOther');
      const failPatch = await request(app)
        .patch(`/api/sessions/cart/items/${cartItemId}`)
        .set('Authorization', `Bearer ${guest2.token}`)
        .send({ delta: -1 });
      expect(failPatch.status).toBe(404);
      expect(failPatch.body.code).toBe('CART_ITEM_NOT_FOUND');

      // Host can patch
      const hostPatch = await request(app)
        .patch(`/api/sessions/cart/items/${cartItemId}`)
        .set('Authorization', `Bearer ${host.token}`)
        .send({ delta: -1 });
      expect(hostPatch.status).toBe(200);
      expect(hostPatch.body.cart.lines[0].quantity).toBe(1);
    });

    test('5.4. surprise line is 404 CART_ITEM_NOT_FOUND for everyone on PATCH', async () => {
      const table = await makeTable(fixtures.restaurantA._id);
      const host = await setupHost(table);
      const dish = await makeDish(fixtures.restaurantA._id);
      const surpriseId = crypto.randomUUID();

      await TableSession.updateOne(
        { _id: host.sessionId },
        {
          $push: {
            cart: {
              cartItemId: surpriseId,
              itemId: dish._id,
              qty: 3,
              addedBy: host.participantId,
              isSurprise: true,
            },
          },
        }
      );

      const res = await request(app)
        .patch(`/api/sessions/cart/items/${surpriseId}`)
        .set('Authorization', `Bearer ${host.token}`)
        .send({ delta: -1 });
      expect(res.status).toBe(404);
      expect(res.body.code).toBe('CART_ITEM_NOT_FOUND');
    });
  });

  describe('6. Removing Line (DELETE /items/:cartItemId)', () => {
    test('6.1. guest deleting own line succeeds (200)', async () => {
      const table = await makeTable(fixtures.restaurantA._id);
      const host = await setupHost(table);
      const dish = await makeDish(fixtures.restaurantA._id);

      const addRes = await request(app)
        .post('/api/sessions/cart/items')
        .set('Authorization', `Bearer ${host.token}`)
        .send({ menuItemId: String(dish._id) });
      const cartItemId = addRes.body.cart.lines[0].id;

      const delRes = await request(app)
        .delete(`/api/sessions/cart/items/${cartItemId}`)
        .set('Authorization', `Bearer ${host.token}`);
      expect(delRes.status).toBe(200);
      expect(delRes.body.cart.lines).toHaveLength(0);
    });

    test('6.2. another guest line is 404 for ordinary guest and allowed for host', async () => {
      const table = await makeTable(fixtures.restaurantA._id);
      const host = await setupHost(table);
      const guest = await setupApprovedGuest(table, host.token, 'GuestDel');
      const guest2 = await setupApprovedGuest(table, host.token, 'GuestDel2');
      const dish = await makeDish(fixtures.restaurantA._id);

      const addRes = await request(app)
        .post('/api/sessions/cart/items')
        .set('Authorization', `Bearer ${guest.token}`)
        .send({ menuItemId: String(dish._id) });
      const cartItemId = addRes.body.cart.lines[0].id;

      // Guest2 cannot delete
      const failDel = await request(app)
        .delete(`/api/sessions/cart/items/${cartItemId}`)
        .set('Authorization', `Bearer ${guest2.token}`);
      expect(failDel.status).toBe(404);
      expect(failDel.body.code).toBe('CART_ITEM_NOT_FOUND');

      // Host can delete
      const hostDel = await request(app)
        .delete(`/api/sessions/cart/items/${cartItemId}`)
        .set('Authorization', `Bearer ${host.token}`);
      expect(hostDel.status).toBe(200);
      expect(hostDel.body.cart.lines).toHaveLength(0);
    });

    test('6.3. second delete of same line is 404 CART_ITEM_NOT_FOUND', async () => {
      const table = await makeTable(fixtures.restaurantA._id);
      const host = await setupHost(table);
      const dish = await makeDish(fixtures.restaurantA._id);

      const addRes = await request(app)
        .post('/api/sessions/cart/items')
        .set('Authorization', `Bearer ${host.token}`)
        .send({ menuItemId: String(dish._id) });
      const cartItemId = addRes.body.cart.lines[0].id;

      await request(app)
        .delete(`/api/sessions/cart/items/${cartItemId}`)
        .set('Authorization', `Bearer ${host.token}`);

      const secondDel = await request(app)
        .delete(`/api/sessions/cart/items/${cartItemId}`)
        .set('Authorization', `Bearer ${host.token}`);
      expect(secondDel.status).toBe(404);
      expect(secondDel.body.code).toBe('CART_ITEM_NOT_FOUND');
    });

    test('6.4. surprise line is 404 CART_ITEM_NOT_FOUND on DELETE for everyone', async () => {
      const table = await makeTable(fixtures.restaurantA._id);
      const host = await setupHost(table);
      const dish = await makeDish(fixtures.restaurantA._id);
      const surpriseId = crypto.randomUUID();

      await TableSession.updateOne(
        { _id: host.sessionId },
        {
          $push: {
            cart: {
              cartItemId: surpriseId,
              itemId: dish._id,
              qty: 1,
              addedBy: host.participantId,
              isSurprise: true,
            },
          },
        }
      );

      const res = await request(app)
        .delete(`/api/sessions/cart/items/${surpriseId}`)
        .set('Authorization', `Bearer ${host.token}`);
      expect(res.status).toBe(404);
      expect(res.body.code).toBe('CART_ITEM_NOT_FOUND');
    });
  });

  describe('7. Concurrency & Operation Guards', () => {
    test(
      '7.1. 12 simultaneous adds of one dish by one guest give exactly one line with quantity 12 and cartVersion up by 12',
      async () => {
        const table = await makeTable(fixtures.restaurantA._id);
        const host = await setupHost(table);
        const dish = await makeDish(fixtures.restaurantA._id);

        const promises = Array.from({ length: 12 }, () =>
          request(app)
            .post('/api/sessions/cart/items')
            .set('Authorization', `Bearer ${host.token}`)
            .send({ menuItemId: String(dish._id), quantity: 1 })
        );

        const results = await Promise.all(promises);
        for (const res of results) {
          expect(res.status).toBe(200);
        }

        const cartRes = await request(app)
          .get('/api/sessions/cart')
          .set('Authorization', `Bearer ${host.token}`);
        expect(cartRes.body.cart.lines).toHaveLength(1);
        expect(cartRes.body.cart.lines[0].quantity).toBe(12);
        expect(cartRes.body.cart.version).toBe(12);
      },
      180000
    );

    test(
      '7.2. two guests adding the same dish 10 times each give exactly two lines of 10',
      async () => {
        const table = await makeTable(fixtures.restaurantA._id);
        const host = await setupHost(table);
        const guest = await setupApprovedGuest(table, host.token, 'GuestTwoTen');
        const dish = await makeDish(fixtures.restaurantA._id);

        const hostAdds = Array.from({ length: 10 }, () =>
          request(app)
            .post('/api/sessions/cart/items')
            .set('Authorization', `Bearer ${host.token}`)
            .send({ menuItemId: String(dish._id), quantity: 1 })
        );
        const guestAdds = Array.from({ length: 10 }, () =>
          request(app)
            .post('/api/sessions/cart/items')
            .set('Authorization', `Bearer ${guest.token}`)
            .send({ menuItemId: String(dish._id), quantity: 1 })
        );

        const results = await Promise.all([...hostAdds, ...guestAdds]);
        for (const res of results) {
          expect(res.status).toBe(200);
        }

        const cartRes = await request(app)
          .get('/api/sessions/cart')
          .set('Authorization', `Bearer ${host.token}`);
        expect(cartRes.body.cart.lines).toHaveLength(2);
        expect(cartRes.body.cart.lines[0].quantity).toBe(10);
        expect(cartRes.body.cart.lines[1].quantity).toBe(10);
        expect(cartRes.body.cart.version).toBe(20);
      },
      180000
    );

    test(
      '7.3. 39 lines race: with 39 lines already in the cart, six simultaneous adds of six different dishes give exactly one 200 and five 409 CART_FULL, cart ends with exactly 40 lines',
      async () => {
        const table = await makeTable(fixtures.restaurantA._id);
        const host = await setupHost(table);

        // Pre-populate 39 lines through model
        const existingLines = [];
        for (let i = 0; i < CART_LIMITS.maxLines - 1; i++) {
          existingLines.push({
            cartItemId: crypto.randomUUID(),
            itemId: new mongoose.Types.ObjectId(),
            qty: 1,
            addedBy: host.participantId,
            isSurprise: false,
          });
        }
        await TableSession.updateOne({ _id: host.sessionId }, { $set: { cart: existingLines } });

        // Create 6 different dishes
        const dishes = await Promise.all(
          Array.from({ length: 6 }, () => makeDish(fixtures.restaurantA._id))
        );

        const results = await Promise.all(
          dishes.map((d) =>
            request(app)
              .post('/api/sessions/cart/items')
              .set('Authorization', `Bearer ${host.token}`)
              .send({ menuItemId: String(d._id), quantity: 1 })
          )
        );

        const successes = results.filter((r) => r.status === 200);
        const fulls = results.filter((r) => r.status === 409 && r.body.code === 'CART_FULL');

        expect(successes).toHaveLength(1);
        expect(fulls).toHaveLength(5);

        const finalSession = await TableSession.findById(host.sessionId).lean();
        expect(finalSession.cart).toHaveLength(40);
      },
      180000
    );

    test(
      '7.4. a line at 18 with five simultaneous adds of one each ends at exactly 20 with exactly two successes and three 409 QTY_LIMIT',
      async () => {
        const table = await makeTable(fixtures.restaurantA._id);
        const host = await setupHost(table);
        const dish = await makeDish(fixtures.restaurantA._id);

        await request(app)
          .post('/api/sessions/cart/items')
          .set('Authorization', `Bearer ${host.token}`)
          .send({ menuItemId: String(dish._id), quantity: 18 });

        const results = await Promise.all(
          Array.from({ length: 5 }, () =>
            request(app)
              .post('/api/sessions/cart/items')
              .set('Authorization', `Bearer ${host.token}`)
              .send({ menuItemId: String(dish._id), quantity: 1 })
          )
        );

        const successes = results.filter((r) => r.status === 200);
        const limits = results.filter((r) => r.status === 409 && r.body.code === 'QTY_LIMIT');

        expect(successes).toHaveLength(2);
        expect(limits).toHaveLength(3);

        const cartRes = await request(app)
          .get('/api/sessions/cart')
          .set('Authorization', `Bearer ${host.token}`);
        expect(cartRes.body.cart.lines[0].quantity).toBe(20);
      },
      180000
    );

    test(
      '7.5. line at 3 with six simultaneous decreases ends at exactly 1 with exactly two successes and four 409 MIN_QTY, never 0',
      async () => {
        const table = await makeTable(fixtures.restaurantA._id);
        const host = await setupHost(table);
        const dish = await makeDish(fixtures.restaurantA._id);

        const addRes = await request(app)
          .post('/api/sessions/cart/items')
          .set('Authorization', `Bearer ${host.token}`)
          .send({ menuItemId: String(dish._id), quantity: 3 });
        const cartItemId = addRes.body.cart.lines[0].id;

        const results = await Promise.all(
          Array.from({ length: 6 }, () =>
            request(app)
              .patch(`/api/sessions/cart/items/${cartItemId}`)
              .set('Authorization', `Bearer ${host.token}`)
              .send({ delta: -1 })
          )
        );

        const successes = results.filter((r) => r.status === 200);
        const mins = results.filter((r) => r.status === 409 && r.body.code === 'MIN_QTY');

        expect(successes).toHaveLength(2);
        expect(mins).toHaveLength(4);

        const cartRes = await request(app)
          .get('/api/sessions/cart')
          .set('Authorization', `Bearer ${host.token}`);
        expect(cartRes.body.cart.lines[0].quantity).toBe(1);
      },
      180000
    );

    test('7.6. allergies changed between safety check and write: updateOne matches nothing, recovers and returns 409 NOT_SAFE with reason allergen', async () => {
      const table = await makeTable(fixtures.restaurantA._id);
      const host = await setupHost(table, []);
      const peanutDish = await makeDish(fixtures.restaurantA._id, {
        allergens: ['peanut'],
        allergensConfirmed: true,
      });

      const origUpdateOne = TableSession.updateOne.bind(TableSession);
      let intervened = false;
      const updateSpy = jest.spyOn(TableSession, 'updateOne').mockImplementation(async (...args) => {
        if (!intervened) {
          intervened = true;
          // Directly mutate participant's allergies in DB before the write executes
          await TableSession.collection.updateOne(
            { _id: new mongoose.Types.ObjectId(host.sessionId) },
            { $set: { 'participants.0.allergies': ['peanut'] } }
          );
        }
        return origUpdateOne(...args);
      });

      try {
        const res = await request(app)
          .post('/api/sessions/cart/items')
          .set('Authorization', `Bearer ${host.token}`)
          .send({ menuItemId: String(peanutDish._id), quantity: 1 });

        expect(res.status).toBe(409);
        expect(res.body.code).toBe('NOT_SAFE');
        expect(res.body.reason).toBe('allergen');
        expect(res.body.clashes).toContain('peanut');

        const session = await TableSession.findById(host.sessionId).lean();
        expect(session.cart).toHaveLength(0);
      } finally {
        updateSpy.mockRestore();
      }
    });

    test('7.7. closed before write: updateOne matches nothing, returns 401 SESSION_CLOSED', async () => {
      const table = await makeTable(fixtures.restaurantA._id);
      const host = await setupHost(table);
      const dish = await makeDish(fixtures.restaurantA._id);

      const origUpdateOne = TableSession.updateOne.bind(TableSession);
      let intervened = false;
      const updateSpy = jest.spyOn(TableSession, 'updateOne').mockImplementation(async (...args) => {
        if (!intervened) {
          intervened = true;
          await TableSession.collection.updateOne(
            { _id: new mongoose.Types.ObjectId(host.sessionId) },
            { $set: { status: 'closed' } }
          );
        }
        return origUpdateOne(...args);
      });

      try {
        const res = await request(app)
          .post('/api/sessions/cart/items')
          .set('Authorization', `Bearer ${host.token}`)
          .send({ menuItemId: String(dish._id) });

        expect(res.status).toBe(401);
        expect(res.body.code).toBe('SESSION_CLOSED');

        const finalSession = await TableSession.findById(host.sessionId).lean();
        expect(finalSession.cart).toHaveLength(0);
        expect(finalSession.cartVersion).toBe(0);
      } finally {
        updateSpy.mockRestore();
      }
    });

    test('7.8. guest removed before write: updateOne matches nothing, returns 401 PARTICIPANT_REMOVED', async () => {
      const table = await makeTable(fixtures.restaurantA._id);
      const host = await setupHost(table);
      const guest = await setupApprovedGuest(table, host.token, 'RemovedMidAir');
      const dish = await makeDish(fixtures.restaurantA._id);

      const origUpdateOne = TableSession.updateOne.bind(TableSession);
      let intervened = false;
      const updateSpy = jest.spyOn(TableSession, 'updateOne').mockImplementation(async (...args) => {
        if (!intervened) {
          intervened = true;
          await TableSession.collection.updateOne(
            { _id: new mongoose.Types.ObjectId(host.sessionId) },
            { $pull: { participants: { id: guest.participantId } } }
          );
        }
        return origUpdateOne(...args);
      });

      try {
        const res = await request(app)
          .post('/api/sessions/cart/items')
          .set('Authorization', `Bearer ${guest.token}`)
          .send({ menuItemId: String(dish._id) });

        expect(res.status).toBe(401);
        expect(res.body.code).toBe('PARTICIPANT_REMOVED');
      } finally {
        updateSpy.mockRestore();
      }
    });

    test('7.9. write matching nothing for unexplained reason retries and answers 503 TRY_AGAIN, never 200', async () => {
      const table = await makeTable(fixtures.restaurantA._id);
      const host = await setupHost(table);
      const dish = await makeDish(fixtures.restaurantA._id);

      // Always return matchedCount 0 on updateOne
      const updateSpy = jest.spyOn(TableSession, 'updateOne').mockResolvedValue({
        matchedCount: 0,
        modifiedCount: 0,
      });

      try {
        const res = await request(app)
          .post('/api/sessions/cart/items')
          .set('Authorization', `Bearer ${host.token}`)
          .send({ menuItemId: String(dish._id) });

        expect(res.status).toBe(503);
        expect(res.body.code).toBe('TRY_AGAIN');
      } finally {
        updateSpy.mockRestore();
      }
    });
  });

  describe('8. Notifications (realtime.cartChanged)', () => {
    let cartNotifySpy;

    beforeEach(() => {
      cartNotifySpy = jest.spyOn(realtime, 'cartChanged');
    });

    afterEach(() => {
      if (cartNotifySpy) cartNotifySpy.mockRestore();
    });

    test('8.1. successful cart changes call realtime.cartChanged once with new version', async () => {
      const table = await makeTable(fixtures.restaurantA._id);
      const host = await setupHost(table);
      const dish = await makeDish(fixtures.restaurantA._id);

      // 1. POST add item -> version 1
      cartNotifySpy.mockClear();
      const addRes = await request(app)
        .post('/api/sessions/cart/items')
        .set('Authorization', `Bearer ${host.token}`)
        .send({ menuItemId: String(dish._id), quantity: 2 });
      expect(addRes.status).toBe(200);
      expect(cartNotifySpy).toHaveBeenCalledTimes(1);
      expect(cartNotifySpy).toHaveBeenCalledWith(host.sessionId, 1);

      const cartItemId = addRes.body.cart.lines[0].id;

      // 2. PATCH decrease item -> version 2
      cartNotifySpy.mockClear();
      const patchRes = await request(app)
        .patch(`/api/sessions/cart/items/${cartItemId}`)
        .set('Authorization', `Bearer ${host.token}`)
        .send({ delta: -1 });
      expect(patchRes.status).toBe(200);
      expect(cartNotifySpy).toHaveBeenCalledTimes(1);
      expect(cartNotifySpy).toHaveBeenCalledWith(host.sessionId, 2);

      // 3. DELETE remove item -> version 3
      cartNotifySpy.mockClear();
      const delRes = await request(app)
        .delete(`/api/sessions/cart/items/${cartItemId}`)
        .set('Authorization', `Bearer ${host.token}`);
      expect(delRes.status).toBe(200);
      expect(cartNotifySpy).toHaveBeenCalledTimes(1);
      expect(cartNotifySpy).toHaveBeenCalledWith(host.sessionId, 3);
    });

    test('8.2. failed cart changes call realtime.cartChanged zero times', async () => {
      const table = await makeTable(fixtures.restaurantA._id);
      const host = await setupHost(table, ['dairy']);
      const dairyDish = await makeDish(fixtures.restaurantA._id, {
        allergens: ['dairy'],
        allergensConfirmed: true,
      });

      // Failed safety check
      cartNotifySpy.mockClear();
      const failSafety = await request(app)
        .post('/api/sessions/cart/items')
        .set('Authorization', `Bearer ${host.token}`)
        .send({ menuItemId: String(dairyDish._id) });
      expect(failSafety.status).toBe(409);
      expect(cartNotifySpy).not.toHaveBeenCalled();

      // Failed validation
      cartNotifySpy.mockClear();
      const failVal = await request(app)
        .post('/api/sessions/cart/items')
        .set('Authorization', `Bearer ${host.token}`)
        .send({ menuItemId: 'invalid-id' });
      expect(failVal.status).toBe(400);
      expect(cartNotifySpy).not.toHaveBeenCalled();

      // Failed PATCH non-existent item
      cartNotifySpy.mockClear();
      const failPatch = await request(app)
        .patch(`/api/sessions/cart/items/${crypto.randomUUID()}`)
        .set('Authorization', `Bearer ${host.token}`)
        .send({ delta: -1 });
      expect(failPatch.status).toBe(404);
      expect(cartNotifySpy).not.toHaveBeenCalled();

      // Failed DELETE non-existent item
      cartNotifySpy.mockClear();
      const failDel = await request(app)
        .delete(`/api/sessions/cart/items/${crypto.randomUUID()}`)
        .set('Authorization', `Bearer ${host.token}`);
      expect(failDel.status).toBe(404);
      expect(cartNotifySpy).not.toHaveBeenCalled();
    });
  });
});
