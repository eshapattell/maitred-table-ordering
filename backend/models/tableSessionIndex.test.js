// tableSessionIndex.test.js: Verifies TableSession partial unique index on the real test database
import mongoose from 'mongoose';
import TableSession from './TableSession.js';
import { closeSession } from '../controllers/sessionController.js';
import { connectTestDb, clearTestDb, disconnectTestDb } from '../config/testDb.js';

describe('TableSession partial unique index on { tableId: 1 } where status: "open"', () => {
  beforeAll(async () => {
    await connectTestDb();
    await clearTestDb();
    // Build schema indexes explicitly on the connected database
    await TableSession.init();
  });

  afterAll(async () => {
    await disconnectTestDb();
  });

  test('TableSession.collection.indexes() contains a unique index on tableId with partialFilterExpression status "open"', async () => {
    const indexes = await TableSession.collection.indexes();
    const openSessionIndex = indexes.find(
      (idx) => idx.key && idx.key.tableId === 1 && idx.unique === true
    );

    expect(openSessionIndex).toBeDefined();
    expect(openSessionIndex.partialFilterExpression).toEqual({ status: 'open' });
  });

  test('two "open" sessions for the same tableId: the second create rejects with MongoDB error code 11000', async () => {
    const tableId = new mongoose.Types.ObjectId();
    const restaurantId = new mongoose.Types.ObjectId();

    await TableSession.create({ tableId, restaurantId, status: 'open' });

    await expect(
      TableSession.create({ tableId, restaurantId, status: 'open' })
    ).rejects.toMatchObject({ code: 11000 });
  });

  test('one "open" and one "closed" for the same table is allowed; two "closed" for the same table are allowed', async () => {
    const tableId = new mongoose.Types.ObjectId();
    const restaurantId = new mongoose.Types.ObjectId();

    const openSession = await TableSession.create({ tableId, restaurantId, status: 'open' });
    const closedSession1 = await TableSession.create({ tableId, restaurantId, status: 'closed' });
    const closedSession2 = await TableSession.create({ tableId, restaurantId, status: 'closed' });

    expect(openSession.status).toBe('open');
    expect(closedSession1.status).toBe('closed');
    expect(closedSession2.status).toBe('closed');
  });

  test('after the open session is closed (updateOne status "closed"), a new "open" session for that table is allowed', async () => {
    const tableId = new mongoose.Types.ObjectId();
    const restaurantId = new mongoose.Types.ObjectId();

    const initialOpen = await TableSession.create({ tableId, restaurantId, status: 'open' });
    await TableSession.updateOne({ _id: initialOpen._id }, { $set: { status: 'closed' } });

    const subsequentOpen = await TableSession.create({ tableId, restaurantId, status: 'open' });
    expect(subsequentOpen).toBeDefined();
    expect(subsequentOpen.status).toBe('open');
  });

  test('two different tables can each have one open session', async () => {
    const table1Id = new mongoose.Types.ObjectId();
    const table2Id = new mongoose.Types.ObjectId();
    const restaurantId = new mongoose.Types.ObjectId();

    const session1 = await TableSession.create({ tableId: table1Id, restaurantId, status: 'open' });
    const session2 = await TableSession.create({ tableId: table2Id, restaurantId, status: 'open' });

    expect(session1.status).toBe('open');
    expect(session2.status).toBe('open');
  });

  test('two creates started at the same moment with Promise.all for one table: exactly one succeeds and one fails with code 11000', async () => {
    const tableId = new mongoose.Types.ObjectId();
    const restaurantId = new mongoose.Types.ObjectId();

    const results = await Promise.allSettled([
      TableSession.create({ tableId, restaurantId, status: 'open' }),
      TableSession.create({ tableId, restaurantId, status: 'open' }),
    ]);

    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter((r) => r.status === 'rejected');

    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect(rejected[0].reason.code).toBe(11000);
  });

  describe('TableSession partial unique index on { "participants.phone": 1 } and closeSession helper', () => {
    test('two open sessions with the same phone: the second create rejects with code 11000 and a keyPattern containing "participants.phone"', async () => {
      const phone = '+919824079988';
      const restaurantId = new mongoose.Types.ObjectId();

      await TableSession.create({
        tableId: new mongoose.Types.ObjectId(),
        restaurantId,
        status: 'open',
        participants: [{ id: 'p1', nickname: 'Alice', phone }],
      });

      let duplicateError;
      try {
        await TableSession.create({
          tableId: new mongoose.Types.ObjectId(),
          restaurantId,
          status: 'open',
          participants: [{ id: 'p2', nickname: 'Bob', phone }],
        });
      } catch (err) {
        duplicateError = err;
      }

      expect(duplicateError).toBeDefined();
      expect(duplicateError.code).toBe(11000);
      expect(duplicateError.keyPattern).toBeDefined();
      expect(duplicateError.keyPattern['participants.phone']).toBe(1);
    });

    test('the same phone in an open and a closed session is allowed', async () => {
      const phone = '+919824079981';
      const restaurantId = new mongoose.Types.ObjectId();

      const closedSession = await TableSession.create({
        tableId: new mongoose.Types.ObjectId(),
        restaurantId,
        status: 'closed',
        participants: [{ id: 'p1', nickname: 'Alice', phone }],
      });

      const openSession = await TableSession.create({
        tableId: new mongoose.Types.ObjectId(),
        restaurantId,
        status: 'open',
        participants: [{ id: 'p2', nickname: 'Alice', phone }],
      });

      expect(closedSession.status).toBe('closed');
      expect(openSession.status).toBe('open');
    });

    test('after closeSession (phones nulled) a new open session with that phone is allowed', async () => {
      const phone = '+919824079982';
      const restaurantId = new mongoose.Types.ObjectId();

      const firstSession = await TableSession.create({
        tableId: new mongoose.Types.ObjectId(),
        restaurantId,
        status: 'open',
        participants: [{ id: 'p1', nickname: 'Alice', phone }],
      });

      const closed = await closeSession(firstSession._id, 'reset');
      expect(closed).toBe(true);

      const refreshed = await TableSession.findById(firstSession._id);
      expect(refreshed.status).toBe('closed');
      expect(refreshed.participants[0].phone).toBeNull();

      const newOpenSession = await TableSession.create({
        tableId: new mongoose.Types.ObjectId(),
        restaurantId,
        status: 'open',
        participants: [{ id: 'p2', nickname: 'Alice', phone }],
      });

      expect(newOpenSession).toBeDefined();
      expect(newOpenSession.status).toBe('open');
    });

    test('participants with a null phone in different open sessions are allowed', async () => {
      const restaurantId = new mongoose.Types.ObjectId();

      const session1 = await TableSession.create({
        tableId: new mongoose.Types.ObjectId(),
        restaurantId,
        status: 'open',
        participants: [{ id: 'p1', nickname: 'Alice', phone: null }],
      });

      const session2 = await TableSession.create({
        tableId: new mongoose.Types.ObjectId(),
        restaurantId,
        status: 'open',
        participants: [{ id: 'p2', nickname: 'Bob', phone: null }],
      });

      expect(session1.status).toBe('open');
      expect(session2.status).toBe('open');
    });

    test('closeSession is safe to call twice (the second call returns false) and nulls every phone while keeping the nicknames', async () => {
      const restaurantId = new mongoose.Types.ObjectId();
      const phone1 = '+919824079983';
      const phone2 = '+919824079984';

      const session = await TableSession.create({
        tableId: new mongoose.Types.ObjectId(),
        restaurantId,
        status: 'open',
        participants: [
          { id: 'p1', nickname: 'Ravi', phone: phone1, role: 'host', status: 'approved' },
          { id: 'p2', nickname: 'Priya', phone: phone2, role: 'guest', status: 'approved' },
        ],
      });

      const firstClose = await closeSession(session._id, 'timeout');
      expect(firstClose).toBe(true);

      const secondClose = await closeSession(session._id, 'timeout');
      expect(secondClose).toBe(false);

      const refreshed = await TableSession.findById(session._id);
      expect(refreshed.status).toBe('closed');
      expect(refreshed.closedReason).toBe('timeout');
      expect(refreshed.closedAt).toBeInstanceOf(Date);
      expect(refreshed.participants).toHaveLength(2);
      expect(refreshed.participants[0].phone).toBeNull();
      expect(refreshed.participants[0].nickname).toBe('Ravi');
      expect(refreshed.participants[1].phone).toBeNull();
      expect(refreshed.participants[1].nickname).toBe('Priya');
    });
  });
});
