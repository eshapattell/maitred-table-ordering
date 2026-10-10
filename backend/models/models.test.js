// models.test.js: Unit tests for Mongoose schema validation in maitred
import mongoose from 'mongoose';
import User from './User.js';
import Restaurant from './Restaurant.js';
import Table from './Table.js';
import MenuItem from './MenuItem.js';
import TableSession from './TableSession.js';
import Order from './Order.js';
import Bill from './Bill.js';
import Feedback from './Feedback.js';

describe('Mongoose Models Schema Validation', () => {
  const dummyObjectId = () => new mongoose.Types.ObjectId();

  // Viva note: Schema validation verifies that required fields and constraints
  // are satisfied synchronously before saving data to MongoDB.
  describe('Required field validation for all models', () => {
    test('User: valid document passes, missing required field fails', () => {
      const validUser = new User({
        name: 'Chef Gordon',
        email: 'gordon@maitred.dining',
        passwordHash: 'hashed_secret_123',
        role: 'kitchen',
        restaurantId: dummyObjectId(),
      });
      expect(validUser.validateSync()).toBeUndefined();

      const invalidUser = new User({
        name: 'Chef Gordon',
        // email is required
        passwordHash: 'hashed_secret_123',
        role: 'kitchen',
        restaurantId: dummyObjectId(),
      });
      const error = invalidUser.validateSync();
      expect(error).toBeDefined();
      expect(error.errors.email).toBeDefined();
    });

    test('Restaurant: valid document passes, missing name fails', () => {
      const validRestaurant = new Restaurant({
        name: 'Le Maitre',
        ownerId: dummyObjectId(),
      });
      expect(validRestaurant.validateSync()).toBeUndefined();

      const invalidRestaurant = new Restaurant({});
      const error = invalidRestaurant.validateSync();
      expect(error).toBeDefined();
      expect(error.errors.name).toBeDefined();
    });

    test('Table: valid document passes, missing qrToken fails', () => {
      const validTable = new Table({
        restaurantId: dummyObjectId(),
        number: 4,
        qrToken: 'qr_tbl_4_secret',
      });
      expect(validTable.validateSync()).toBeUndefined();

      const invalidTable = new Table({
        restaurantId: dummyObjectId(),
        number: 4,
      });
      const error = invalidTable.validateSync();
      expect(error).toBeDefined();
      expect(error.errors.qrToken).toBeDefined();
    });

    test('MenuItem: valid document passes, missing name fails', () => {
      const validItem = new MenuItem({
        restaurantId: dummyObjectId(),
        name: 'Truffle Risotto',
        price: 38,
        category: 'Mains',
        isVeg: true,
      });
      expect(validItem.validateSync()).toBeUndefined();

      const invalidItem = new MenuItem({
        restaurantId: dummyObjectId(),
        price: 38,
        category: 'Mains',
      });
      const error = invalidItem.validateSync();
      expect(error).toBeDefined();
      expect(error.errors.name).toBeDefined();
    });

    test('TableSession: valid document passes, missing tableId fails', () => {
      const validSession = new TableSession({
        tableId: dummyObjectId(),
        restaurantId: dummyObjectId(),
        status: 'open',
      });
      expect(validSession.validateSync()).toBeUndefined();

      const invalidSession = new TableSession({
        restaurantId: dummyObjectId(),
        status: 'open',
      });
      const error = invalidSession.validateSync();
      expect(error).toBeDefined();
      expect(error.errors.tableId).toBeDefined();
    });

    test('Order: valid document passes, missing sessionId fails', () => {
      const validOrder = new Order({
        sessionId: dummyObjectId(),
        restaurantId: dummyObjectId(),
        tableNumber: 2,
        items: [
          {
            itemId: dummyObjectId(),
            name: 'Wagyu Striploin',
            price: 75,
            qty: 1,
            orderedBy: 'guest-uuid-1',
          },
        ],
        status: 'placed',
      });
      expect(validOrder.validateSync()).toBeUndefined();

      const invalidOrder = new Order({
        restaurantId: dummyObjectId(),
        tableNumber: 2,
        items: [
          {
            itemId: dummyObjectId(),
            name: 'Wagyu Striploin',
            price: 75,
            qty: 1,
            orderedBy: 'guest-uuid-1',
          },
        ],
      });
      const error = invalidOrder.validateSync();
      expect(error).toBeDefined();
      expect(error.errors.sessionId).toBeDefined();
    });

    test('Bill: valid document passes, missing total fails', () => {
      const validBill = new Bill({
        sessionId: dummyObjectId(),
        splitMode: 'equal',
        total: 150,
        shares: [
          {
            participantId: 'guest-uuid-1',
            amount: 75,
            paid: false,
          },
        ],
      });
      expect(validBill.validateSync()).toBeUndefined();

      const invalidBill = new Bill({
        sessionId: dummyObjectId(),
        splitMode: 'equal',
      });
      const error = invalidBill.validateSync();
      expect(error).toBeDefined();
      expect(error.errors.total).toBeDefined();
    });

    test('Feedback: valid document passes, missing rating fails', () => {
      const validFeedback = new Feedback({
        itemId: dummyObjectId(),
        participantId: 'guest-uuid-1',
        rating: 5,
        wasSurprise: true,
      });
      expect(validFeedback.validateSync()).toBeUndefined();

      const invalidFeedback = new Feedback({
        itemId: dummyObjectId(),
        participantId: 'guest-uuid-1',
      });
      const error = invalidFeedback.validateSync();
      expect(error).toBeDefined();
      expect(error.errors.rating).toBeDefined();
    });
  });

  // Viva note: Mongoose enum validators guarantee only allowed workflow statuses are stored.
  describe('Enum validation', () => {
    test('User.role rejects invalid values', () => {
      const user = new User({
        name: 'Tester',
        email: 'test@example.com',
        passwordHash: 'hashed',
        role: 'unauthorized_role',
        restaurantId: dummyObjectId(),
      });
      const error = user.validateSync();
      expect(error).toBeDefined();
      expect(error.errors.role).toBeDefined();
    });

    test('TableSession.status rejects invalid values', () => {
      const session = new TableSession({
        tableId: dummyObjectId(),
        restaurantId: dummyObjectId(),
        status: 'archived',
      });
      const error = session.validateSync();
      expect(error).toBeDefined();
      expect(error.errors.status).toBeDefined();
    });

    test('Order.status rejects invalid values', () => {
      const order = new Order({
        sessionId: dummyObjectId(),
        restaurantId: dummyObjectId(),
        tableNumber: 1,
        items: [
          {
            itemId: dummyObjectId(),
            name: 'Salad',
            price: 15,
            qty: 1,
            orderedBy: 'p1',
          },
        ],
        status: 'cancelled',
      });
      const error = order.validateSync();
      expect(error).toBeDefined();
      expect(error.errors.status).toBeDefined();
    });

    test('Bill.splitMode rejects invalid values', () => {
      const bill = new Bill({
        sessionId: dummyObjectId(),
        splitMode: 'crypto',
        total: 50,
      });
      const error = bill.validateSync();
      expect(error).toBeDefined();
      expect(error.errors.splitMode).toBeDefined();
    });
  });

  // Viva note: Numeric range validations protect business rules (e.g. positive prices and valid ratings).
  describe('Range and numerical constraints', () => {
    test('MenuItem.spiceLevel rejects 0 and 6, but accepts 1 and 5', () => {
      const itemLow = new MenuItem({
        restaurantId: dummyObjectId(),
        name: 'Dish',
        price: 20,
        category: 'Mains',
        isVeg: true,
        spiceLevel: 0,
      });
      expect(itemLow.validateSync().errors.spiceLevel).toBeDefined();

      const itemHigh = new MenuItem({
        restaurantId: dummyObjectId(),
        name: 'Dish',
        price: 20,
        category: 'Mains',
        isVeg: true,
        spiceLevel: 6,
      });
      expect(itemHigh.validateSync().errors.spiceLevel).toBeDefined();

      const itemValidMin = new MenuItem({
        restaurantId: dummyObjectId(),
        name: 'Dish',
        price: 20,
        category: 'Mains',
        isVeg: true,
        spiceLevel: 1,
      });
      expect(itemValidMin.validateSync()).toBeUndefined();

      const itemValidMax = new MenuItem({
        restaurantId: dummyObjectId(),
        name: 'Dish',
        price: 20,
        category: 'Mains',
        isVeg: true,
        spiceLevel: 5,
      });
      expect(itemValidMax.validateSync()).toBeUndefined();
    });

    test('Feedback.rating rejects 0 and 6, but accepts 1 and 5', () => {
      const feedbackZero = new Feedback({
        itemId: dummyObjectId(),
        participantId: 'p1',
        rating: 0,
      });
      expect(feedbackZero.validateSync().errors.rating).toBeDefined();

      const feedbackSix = new Feedback({
        itemId: dummyObjectId(),
        participantId: 'p1',
        rating: 6,
      });
      expect(feedbackSix.validateSync().errors.rating).toBeDefined();

      const feedbackValid = new Feedback({
        itemId: dummyObjectId(),
        participantId: 'p1',
        rating: 3,
      });
      expect(feedbackValid.validateSync()).toBeUndefined();
    });

    test('MenuItem rejects negative price', () => {
      const item = new MenuItem({
        restaurantId: dummyObjectId(),
        name: 'Dish',
        price: -5,
        category: 'Mains',
        isVeg: true,
      });
      const error = item.validateSync();
      expect(error).toBeDefined();
      expect(error.errors.price).toBeDefined();
    });

    test('TableSession cart qty of 0 is rejected', () => {
      const session = new TableSession({
        tableId: dummyObjectId(),
        restaurantId: dummyObjectId(),
        cart: [
          {
            cartItemId: 'cart-1',
            itemId: dummyObjectId(),
            qty: 0,
            addedBy: 'p1',
          },
        ],
      });
      const error = session.validateSync();
      expect(error).toBeDefined();
      expect(error.errors['cart.0.qty']).toBeDefined();
    });
  });

  // Viva note: Seed setup requires creating the restaurant document before the owner user account exists.
  describe('Restaurant model specifics', () => {
    test('A Restaurant with only a name is valid (ownerId is optional)', () => {
      const restaurant = new Restaurant({
        name: 'Luxe Dining Room',
      });
      expect(restaurant.validateSync()).toBeUndefined();
      expect(restaurant.ownerId).toBeNull();
    });
  });

  // Viva note: maitred uses in-person bill settlement; online gateway fields (Razorpay, etc.) are strictly prohibited.
  describe('Bill schema purity', () => {
    test('Bill schema has no path containing "razorpay" or "payment"', () => {
      const topLevelPaths = Object.keys(Bill.schema.paths);
      const subPaths = Object.keys(Bill.schema.paths.shares.schema.paths);
      const allPaths = [...topLevelPaths, ...subPaths];

      const forbidden = allPaths.filter((path) => /razorpay|payment/i.test(path));
      expect(forbidden).toEqual([]);
    });
  });

  // Viva note: Prevents race conditions where multiple patrons scanning table QR simultaneously create competing carts.
  describe('TableSession partial unique index', () => {
    test('TableSession.schema.indexes() contains a unique index on tableId with partialFilterExpression on status "open"', () => {
      const indexes = TableSession.schema.indexes();
      const partialOpenIndex = indexes.find(
        ([fields, options]) =>
          fields.tableId === 1 &&
          options &&
          options.unique === true &&
          options.partialFilterExpression &&
          options.partialFilterExpression.status === 'open'
      );

      expect(partialOpenIndex).toBeDefined();
    });

    test('TableSession.schema.indexes() contains a unique index on participants.phone with partialFilterExpression on status "open" and string phone', () => {
      const indexes = TableSession.schema.indexes();
      const partialPhoneIndex = indexes.find(
        ([fields, options]) =>
          fields['participants.phone'] === 1 &&
          options &&
          options.unique === true &&
          options.partialFilterExpression &&
          options.partialFilterExpression.status === 'open' &&
          options.partialFilterExpression['participants.phone'] &&
          options.partialFilterExpression['participants.phone'].$type === 'string'
      );

      expect(partialPhoneIndex).toBeDefined();
    });
  });

  describe('TableSession new field defaults and enum constraints (Task 9a)', () => {
    test('TableSession and participant new fields have correct defaults', () => {
      const session = new TableSession({
        tableId: dummyObjectId(),
        restaurantId: dummyObjectId(),
        status: 'open',
        participants: [
          {
            id: 'participant-uuid-1',
            nickname: 'Aarav',
          },
        ],
      });

      expect(session.validateSync()).toBeUndefined();
      expect(session.hostId).toBeNull();
      expect(session.lastActivityAt).toBeInstanceOf(Date);
      expect(session.closedAt).toBeNull();
      expect(session.closedReason).toBeNull();

      const p = session.participants[0];
      expect(p.phone).toBeNull();
      expect(p.phoneVerified).toBe(false);
      expect(p.role).toBe('guest');
      expect(p.status).toBe('pending');
      expect(p.allergiesDeclared).toBe(false);
      expect(p.joinedAt).toBeInstanceOf(Date);
    });

    test('participant.role rejects invalid values and accepts allowed enums', () => {
      const invalidRoleSession = new TableSession({
        tableId: dummyObjectId(),
        restaurantId: dummyObjectId(),
        participants: [
          {
            id: 'p1',
            nickname: 'Bob',
            role: 'superuser',
          },
        ],
      });
      const err = invalidRoleSession.validateSync();
      expect(err).toBeDefined();
      expect(err.errors['participants.0.role']).toBeDefined();

      const hostSession = new TableSession({
        tableId: dummyObjectId(),
        restaurantId: dummyObjectId(),
        participants: [
          {
            id: 'p1',
            nickname: 'Bob',
            role: 'host',
          },
        ],
      });
      expect(hostSession.validateSync()).toBeUndefined();
    });

    test('participant.status rejects invalid values and accepts allowed enums', () => {
      const invalidStatusSession = new TableSession({
        tableId: dummyObjectId(),
        restaurantId: dummyObjectId(),
        participants: [
          {
            id: 'p1',
            nickname: 'Bob',
            status: 'active',
          },
        ],
      });
      const err = invalidStatusSession.validateSync();
      expect(err).toBeDefined();
      expect(err.errors['participants.0.status']).toBeDefined();

      const approvedSession = new TableSession({
        tableId: dummyObjectId(),
        restaurantId: dummyObjectId(),
        participants: [
          {
            id: 'p1',
            nickname: 'Bob',
            status: 'approved',
          },
        ],
      });
      expect(approvedSession.validateSync()).toBeUndefined();
    });

    test('TableSession.closedReason rejects invalid values and accepts allowed enums', () => {
      const invalidReasonSession = new TableSession({
        tableId: dummyObjectId(),
        restaurantId: dummyObjectId(),
        closedReason: 'cancelled',
      });
      const err = invalidReasonSession.validateSync();
      expect(err).toBeDefined();
      expect(err.errors.closedReason).toBeDefined();

      for (const validReason of ['reset', 'rejected', 'timeout', 'table-removed']) {
        const validReasonSession = new TableSession({
          tableId: dummyObjectId(),
          restaurantId: dummyObjectId(),
          closedReason: validReason,
        });
        expect(validReasonSession.validateSync()).toBeUndefined();
      }
    });
  });
});
