// tableRoutes.test.js: Integration tests for dining table management and QR endpoints
import request from 'supertest';
import mongoose from 'mongoose';
import { app } from '../server.js';
import Table from '../models/Table.js';
import TableSession from '../models/TableSession.js';
import { connectTestDb, clearTestDb, disconnectTestDb } from '../config/testDb.js';
import { createFixtures } from '../config/testFixtures.js';

describe('Table Routes (/api/tables)', () => {
  let fixtures;
  let testTableA;
  const originalClientUrl = process.env.CLIENT_URL;

  beforeAll(async () => {
    await connectTestDb();
    await clearTestDb();
    fixtures = await createFixtures();

    testTableA = await Table.create({
      restaurantId: fixtures.restaurantA._id,
      number: 10,
      qrToken: '1234567890abcdef1234567890abcdef',
    });
  });

  afterAll(async () => {
    process.env.CLIENT_URL = originalClientUrl;
    await disconnectTestDb();
  });

  describe('Authorization on all 4 routes', () => {
    const protectedRoutes = [
      { method: 'get', path: '/api/tables' },
      { method: 'post', path: '/api/tables', body: { number: 99 } },
      { method: 'get', path: '/api/tables/DUMMY_ID/qr' },
      { method: 'delete', path: '/api/tables/DUMMY_ID' },
    ];

    test.each(protectedRoutes)(
      '$method $path fails with 401 without token',
      async ({ method, path, body }) => {
        const targetPath = path.replace('DUMMY_ID', String(testTableA._id));
        const req = request(app)[method](targetPath);
        if (body) req.send(body);

        const res = await req;
        expect(res.status).toBe(401);
      }
    );

    test.each(protectedRoutes)(
      '$method $path fails with 403 with kitchen token',
      async ({ method, path, body }) => {
        const targetPath = path.replace('DUMMY_ID', String(testTableA._id));
        const req = request(app)
          [method](targetPath)
          .set('Authorization', `Bearer ${fixtures.kitchenAToken}`);
        if (body) req.send(body);

        const res = await req;
        expect(res.status).toBe(403);
      }
    );

    test.each(protectedRoutes)(
      '$method $path fails with 401 with garbage token',
      async ({ method, path, body }) => {
        const targetPath = path.replace('DUMMY_ID', String(testTableA._id));
        const req = request(app)
          [method](targetPath)
          .set('Authorization', 'Bearer invalid.token.garbage');
        if (body) req.send(body);

        const res = await req;
        expect(res.status).toBe(401);
      }
    );
  });

  describe('POST /api/tables', () => {
    test('owner creates a table (201) with hex qrToken; two tables get distinct tokens', async () => {
      const res1 = await request(app)
        .post('/api/tables')
        .set('Authorization', `Bearer ${fixtures.ownerAToken}`)
        .send({ number: 1 });

      expect(res1.status).toBe(201);
      expect(res1.body.table).toBeDefined();
      expect(res1.body.table.number).toBe(1);
      expect(res1.body.table.qrToken).toMatch(/^[0-9a-f]{32}$/);

      const res2 = await request(app)
        .post('/api/tables')
        .set('Authorization', `Bearer ${fixtures.ownerAToken}`)
        .send({ number: 2 });

      expect(res2.status).toBe(201);
      expect(res2.body.table.qrToken).toMatch(/^[0-9a-f]{32}$/);
      expect(res1.body.table.qrToken).not.toBe(res2.body.table.qrToken);

      // Verify created in correct restaurant in DB
      const dbTable = await Table.findById(res1.body.table.id);
      expect(String(dbTable.restaurantId)).toBe(String(fixtures.restaurantA._id));
    });

    test.each([
      ['missing number', {}],
      ['zero', { number: 0 }],
      ['negative number', { number: -1 }],
      ['decimal number', { number: 1.5 }],
      ['string number', { number: '3' }],
      ['greater than 500', { number: 501 }],
      ['null', { number: null }],
      ['an object', { number: { val: 5 } }],
      ['an array', { number: [5] }],
    ])('rejects invalid number input (%s) with 400', async (_, body) => {
      const res = await request(app)
        .post('/api/tables')
        .set('Authorization', `Bearer ${fixtures.ownerAToken}`)
        .send(body);

      expect(res.status).toBe(400);
      expect(res.body.message).toBe('Invalid table number');
    });

    test('duplicate number in same restaurant returns 409; same number in restaurant B succeeds with 201', async () => {
      // First creation in restaurant A
      const resA1 = await request(app)
        .post('/api/tables')
        .set('Authorization', `Bearer ${fixtures.ownerAToken}`)
        .send({ number: 3 });
      expect(resA1.status).toBe(201);

      // Duplicate in restaurant A
      const resA2 = await request(app)
        .post('/api/tables')
        .set('Authorization', `Bearer ${fixtures.ownerAToken}`)
        .send({ number: 3 });
      expect(resA2.status).toBe(409);
      expect(resA2.body.message).toBe('Table number already exists');

      // Same number 3 in restaurant B
      const resB = await request(app)
        .post('/api/tables')
        .set('Authorization', `Bearer ${fixtures.ownerBToken}`)
        .send({ number: 3 });
      expect(resB.status).toBe(201);
      expect(resB.body.table.number).toBe(3);
    });

    test('restaurantId provided in body is ignored (table belongs to owner restaurant)', async () => {
      const res = await request(app)
        .post('/api/tables')
        .set('Authorization', `Bearer ${fixtures.ownerAToken}`)
        .send({
          number: 4,
          restaurantId: String(fixtures.restaurantB._id),
        });

      expect(res.status).toBe(201);
      const dbTable = await Table.findById(res.body.table.id);
      expect(String(dbTable.restaurantId)).toBe(String(fixtures.restaurantA._id));
    });
  });

  describe('GET /api/tables', () => {
    test('returns only owner tables sorted by number ascending; restaurant B tables never appear', async () => {
      const res = await request(app)
        .get('/api/tables')
        .set('Authorization', `Bearer ${fixtures.ownerAToken}`);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.tables)).toBe(true);

      const numbers = res.body.tables.map((t) => t.number);
      const sortedNumbers = [...numbers].sort((a, b) => a - b);
      expect(numbers).toEqual(sortedNumbers);

      // Verify none of the tables belong to restaurant B
      for (const t of res.body.tables) {
        const dbTable = await Table.findById(t.id);
        expect(String(dbTable.restaurantId)).toBe(String(fixtures.restaurantA._id));
      }
    });
  });

  describe('GET /api/tables/:tableId/qr', () => {
    test('returns 200 with table, exact url and qrDataUrl', async () => {
      process.env.CLIENT_URL = 'https://luxe.maitred.dining';

      const res = await request(app)
        .get(`/api/tables/${testTableA._id}/qr`)
        .set('Authorization', `Bearer ${fixtures.ownerAToken}`);

      expect(res.status).toBe(200);
      expect(res.body.table).toEqual({
        id: String(testTableA._id),
        number: testTableA.number,
      });

      const expectedUrl = `https://luxe.maitred.dining/r/${testTableA.restaurantId}/table/${testTableA.number}?token=${testTableA.qrToken}`;
      expect(res.body.url).toBe(expectedUrl);
      expect(res.body.qrDataUrl.startsWith('data:image/png;base64,')).toBe(true);
    });

    test('another restaurant table gives 404', async () => {
      const tableB = await Table.create({
        restaurantId: fixtures.restaurantB._id,
        number: 50,
        qrToken: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
      });

      const res = await request(app)
        .get(`/api/tables/${tableB._id}/qr`)
        .set('Authorization', `Bearer ${fixtures.ownerAToken}`);

      expect(res.status).toBe(404);
      expect(res.body.message).toBe('Not found');
    });

    test('invalid tableId format ("not-an-id") gives 404', async () => {
      const res = await request(app)
        .get('/api/tables/not-an-id/qr')
        .set('Authorization', `Bearer ${fixtures.ownerAToken}`);

      expect(res.status).toBe(404);
      expect(res.body.message).toBe('Not found');
    });
  });

  describe('DELETE /api/tables/:tableId', () => {
    test('owner deletes a table (200) and it disappears from the list', async () => {
      const tableToDelete = await Table.create({
        restaurantId: fixtures.restaurantA._id,
        number: 100,
        qrToken: 'to_delete_token_1234567890abcdef',
      });

      const res = await request(app)
        .delete(`/api/tables/${tableToDelete._id}`)
        .set('Authorization', `Bearer ${fixtures.ownerAToken}`);

      expect(res.status).toBe(200);
      expect(res.body.message).toBe('Table deleted');

      const found = await Table.findById(tableToDelete._id);
      expect(found).toBeNull();
    });

    test('table with an open TableSession gives 409 and table is preserved', async () => {
      const tableWithOpenSession = await Table.create({
        restaurantId: fixtures.restaurantA._id,
        number: 101,
        qrToken: 'open_session_token_1234567890abc',
      });

      await TableSession.create({
        tableId: tableWithOpenSession._id,
        restaurantId: fixtures.restaurantA._id,
        status: 'open',
      });

      const res = await request(app)
        .delete(`/api/tables/${tableWithOpenSession._id}`)
        .set('Authorization', `Bearer ${fixtures.ownerAToken}`);

      expect(res.status).toBe(409);
      expect(res.body.message).toBe('Table has an open session');

      const stillExists = await Table.findById(tableWithOpenSession._id);
      expect(stillExists).not.toBeNull();
    });

    test('table with only a closed TableSession gives 200 and is deleted', async () => {
      const tableWithClosedSession = await Table.create({
        restaurantId: fixtures.restaurantA._id,
        number: 102,
        qrToken: 'closed_session_token_1234567890a',
      });

      await TableSession.create({
        tableId: tableWithClosedSession._id,
        restaurantId: fixtures.restaurantA._id,
        status: 'closed',
      });

      const res = await request(app)
        .delete(`/api/tables/${tableWithClosedSession._id}`)
        .set('Authorization', `Bearer ${fixtures.ownerAToken}`);

      expect(res.status).toBe(200);
      expect(res.body.message).toBe('Table deleted');

      const found = await Table.findById(tableWithClosedSession._id);
      expect(found).toBeNull();
    });

    test('another restaurant table gives 404 and is not deleted', async () => {
      const tableB = await Table.create({
        restaurantId: fixtures.restaurantB._id,
        number: 103,
        qrToken: 'table_b_token_1234567890abcdef12',
      });

      const res = await request(app)
        .delete(`/api/tables/${tableB._id}`)
        .set('Authorization', `Bearer ${fixtures.ownerAToken}`);

      expect(res.status).toBe(404);
      expect(res.body.message).toBe('Not found');

      const stillExists = await Table.findById(tableB._id);
      expect(stillExists).not.toBeNull();
    });

    test('invalid tableId format ("not-an-id") gives 404', async () => {
      const res = await request(app)
        .delete('/api/tables/not-an-id')
        .set('Authorization', `Bearer ${fixtures.ownerAToken}`);

      expect(res.status).toBe(404);
      expect(res.body.message).toBe('Not found');
    });
  });
});
