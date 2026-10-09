// tableSessionIndex.test.js: Verifies TableSession partial unique index on the real test database
import mongoose from 'mongoose';
import TableSession from './TableSession.js';
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
});
