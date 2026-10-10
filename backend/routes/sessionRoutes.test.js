// sessionRoutes.test.js: Integration test suite for table session lifecycle, guest auth, approval, allergies and menu
import crypto from 'crypto';
import mongoose from 'mongoose';
import request from 'supertest';
import { jest } from '@jest/globals';
import { app } from '../server.js';
import Table from '../models/Table.js';
import TableSession from '../models/TableSession.js';
import MenuItem from '../models/MenuItem.js';
import { closeSession } from '../controllers/sessionController.js';
import { connectTestDb, clearTestDb, disconnectTestDb } from '../config/testDb.js';
import { createFixtures } from '../config/testFixtures.js';

describe('Table Session Routes (/api/sessions)', () => {
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

  // Helper to provision a test table with an active 32-hex QR token
  let tableCounter = 100;
  const makeTable = async (restaurantId) => {
    tableCounter += 1;
    const qrToken = crypto.randomBytes(16).toString('hex');
    return await Table.create({
      restaurantId,
      number: tableCounter,
      qrToken,
    });
  };

  // Helper to join a table session (never logs or prints phone numbers)
  const join = (table, phone, nickname) => {
    return request(app)
      .post('/api/sessions/join')
      .send({
        restaurantId: String(table.restaurantId),
        tableNumber: table.number,
        qrToken: table.qrToken,
        phone,
        nickname,
      });
  };

  describe('JOIN Endpoint (POST /api/sessions/join)', () => {
    test('first guest: 201; role "host", status "approved"; token; session open; hostId set; normalised phone stored; lastActivityAt set; response JSON contains no full phone number', async () => {
      const table = await makeTable(fixtures.restaurantA._id);
      const rawPhone = '9824079988';
      const res = await join(table, rawPhone, 'Aarav');

      expect(res.status).toBe(201);
      expect(res.body.token).toBeDefined();
      expect(res.body.participant).toMatchObject({
        nickname: 'Aarav',
        role: 'host',
        status: 'approved',
        allergiesDeclared: false,
      });
      expect(res.body.session).toMatchObject({
        tableNumber: table.number,
        status: 'open',
      });

      // Assert database state
      const session = await TableSession.findById(res.body.session.id);
      expect(session).toBeDefined();
      expect(session.status).toBe('open');
      expect(session.hostId).toBe(res.body.participant.id);
      expect(session.participants).toHaveLength(1);
      expect(session.participants[0].phone).toBe('+919824079988');
      expect(session.participants[0].role).toBe('host');
      expect(session.participants[0].status).toBe('approved');
      expect(session.lastActivityAt).toBeInstanceOf(Date);

      // Verify unmasked raw phone is never leaked in the response JSON
      expect(JSON.stringify(res.body)).not.toContain(rawPhone);
      expect(res.body.participant.phone).toBeUndefined();

      // Clean up so phone is not active elsewhere
      await closeSession(session._id, 'reset');
    });

    test.each([
      ['9824079988'],
      ['98240 79988'],
      ['+91 98240 79988'],
      ['09824079988'],
      ['91-9824079988'],
    ])('formats: input %s stores normalised "+919824079988"', async (formattedInput) => {
      // Ensure phone is free
      await TableSession.updateMany(
        { 'participants.phone': '+919824079988', status: 'open' },
        { $set: { status: 'closed', 'participants.$[].phone': null } }
      );
      // Each format on its own table
      const table = await makeTable(fixtures.restaurantA._id);
      const res = await join(table, formattedInput, 'Guest');

      expect(res.status).toBe(201);
      const session = await TableSession.findById(res.body.session.id);
      expect(session.participants[0].phone).toBe('+919824079988');
      // Clean up session so next test has clean phone state
      await closeSession(session._id, 'reset');
    });

    describe('bad input validation (all 400 INVALID_INPUT)', () => {
      test.each([
        ['phone null', { phone: null, nickname: 'Ravi', tableNumber: 1, qrToken: 'a'.repeat(32) }],
        ['phone empty', { phone: '', nickname: 'Ravi', tableNumber: 1, qrToken: 'a'.repeat(32) }],
        ['phone too short ("12345")', { phone: '12345', nickname: 'Ravi', tableNumber: 1, qrToken: 'a'.repeat(32) }],
        ['phone invalid prefix ("5824079988")', { phone: '5824079988', nickname: 'Ravi', tableNumber: 1, qrToken: 'a'.repeat(32) }],
        ['phone non-Indian country ("+1 9824079988")', { phone: '+1 9824079988', nickname: 'Ravi', tableNumber: 1, qrToken: 'a'.repeat(32) }],
        ['phone number type', { phone: 9824079988, nickname: 'Ravi', tableNumber: 1, qrToken: 'a'.repeat(32) }],
        ['nickname missing', { phone: '9824079988', nickname: undefined, tableNumber: 1, qrToken: 'a'.repeat(32) }],
        ['nickname empty', { phone: '9824079988', nickname: '', tableNumber: 1, qrToken: 'a'.repeat(32) }],
        ['nickname 31 characters', { phone: '9824079988', nickname: 'a'.repeat(31), tableNumber: 1, qrToken: 'a'.repeat(32) }],
        ['nickname html tags "<b>x</b>"', { phone: '9824079988', nickname: '<b>x</b>', tableNumber: 1, qrToken: 'a'.repeat(32) }],
        ['nickname emoji', { phone: '9824079988', nickname: 'Ravi 😊', tableNumber: 1, qrToken: 'a'.repeat(32) }],
        ['tableNumber 0', { phone: '9824079988', nickname: 'Ravi', tableNumber: 0, qrToken: 'a'.repeat(32) }],
        ['tableNumber 501', { phone: '9824079988', nickname: 'Ravi', tableNumber: 501, qrToken: 'a'.repeat(32) }],
        ['tableNumber float 1.5', { phone: '9824079988', nickname: 'Ravi', tableNumber: 1.5, qrToken: 'a'.repeat(32) }],
        ['tableNumber string "3"', { phone: '9824079988', nickname: 'Ravi', tableNumber: '3', qrToken: 'a'.repeat(32) }],
        ['tableNumber null', { phone: '9824079988', nickname: 'Ravi', tableNumber: null, qrToken: 'a'.repeat(32) }],
        ['qrToken too short', { phone: '9824079988', nickname: 'Ravi', tableNumber: 1, qrToken: 'abc' }],
        ['qrToken uppercase', { phone: '9824079988', nickname: 'Ravi', tableNumber: 1, qrToken: 'A'.repeat(32) }],
        ['qrToken missing', { phone: '9824079988', nickname: 'Ravi', tableNumber: 1, qrToken: undefined }],
        ['restaurantId not an id', { phone: '9824079988', nickname: 'Ravi', tableNumber: 1, qrToken: 'a'.repeat(32), restaurantId: 'not-an-id' }],
        ['restaurantId missing', { phone: '9824079988', nickname: 'Ravi', tableNumber: 1, qrToken: 'a'.repeat(32), restaurantId: undefined }],
      ])('%s gives 400 INVALID_INPUT', async (_, payload) => {
        const body = {
          restaurantId: Object.prototype.hasOwnProperty.call(payload, 'restaurantId')
            ? payload.restaurantId
            : String(fixtures.restaurantA._id),
          tableNumber: payload.tableNumber,
          qrToken: payload.qrToken,
          phone: payload.phone,
          nickname: payload.nickname,
        };

        const res = await request(app).post('/api/sessions/join').send(body);
        expect(res.status).toBe(400);
        expect(res.body.code).toBe('INVALID_INPUT');
      });
    });

    test('an unknown restaurant, an unknown table number and a wrong qrToken all answer 404 TABLE_NOT_FOUND with identical message and code', async () => {
      const table = await makeTable(fixtures.restaurantA._id, 102);
      const validPhone = '9824079981';

      // 1. Unknown restaurant
      const res1 = await request(app).post('/api/sessions/join').send({
        restaurantId: new mongoose.Types.ObjectId().toString(),
        tableNumber: table.number,
        qrToken: table.qrToken,
        phone: validPhone,
        nickname: 'Alice',
      });
      expect(res1.status).toBe(404);
      expect(res1.body).toEqual({
        message: 'This table link is not valid',
        code: 'TABLE_NOT_FOUND',
      });

      // 2. Unknown table number
      const res2 = await request(app).post('/api/sessions/join').send({
        restaurantId: String(table.restaurantId),
        tableNumber: 499,
        qrToken: table.qrToken,
        phone: validPhone,
        nickname: 'Alice',
      });
      expect(res2.status).toBe(404);
      expect(res2.body).toEqual({
        message: 'This table link is not valid',
        code: 'TABLE_NOT_FOUND',
      });

      // 3. Wrong qrToken
      const res3 = await request(app).post('/api/sessions/join').send({
        restaurantId: String(table.restaurantId),
        tableNumber: table.number,
        qrToken: '0'.repeat(32),
        phone: validPhone,
        nickname: 'Alice',
      });
      expect(res3.status).toBe(404);
      expect(res3.body).toEqual({
        message: 'This table link is not valid',
        code: 'TABLE_NOT_FOUND',
      });
    });

    test('second guest with a different phone: 201 pending; session still has exactly one host', async () => {
      const table = await makeTable(fixtures.restaurantA._id, 103);
      const hostRes = await join(table, '9824079901', 'HostUser');
      expect(hostRes.status).toBe(201);

      const guestRes = await join(table, '9824079902', 'GuestUser');
      expect(guestRes.status).toBe(201);
      expect(guestRes.body.participant).toMatchObject({
        nickname: 'GuestUser',
        role: 'guest',
        status: 'pending',
      });

      const session = await TableSession.findById(hostRes.body.session.id);
      expect(session.participants).toHaveLength(2);
      const hosts = session.participants.filter((p) => p.role === 'host');
      expect(hosts).toHaveLength(1);
      expect(hosts[0].id).toBe(hostRes.body.participant.id);
    });

    test('the same phone again at the same table gives 409 ALREADY_JOINED', async () => {
      const table = await makeTable(fixtures.restaurantA._id, 104);
      const phone = '9824079903';

      const first = await join(table, phone, 'UserOne');
      expect(first.status).toBe(201);

      const second = await join(table, phone, 'UserOne');
      expect(second.status).toBe(409);
      expect(second.body.code).toBe('ALREADY_JOINED');
    });

    test('the same phone at a different table while first session is open gives 409 PHONE_ACTIVE_ELSEWHERE; after closeSession on first, it can start a new session', async () => {
      const table1 = await makeTable(fixtures.restaurantA._id, 105);
      const table2 = await makeTable(fixtures.restaurantA._id, 106);
      const phone = '9824079904';

      const res1 = await join(table1, phone, 'UserM');
      expect(res1.status).toBe(201);

      const res2 = await join(table2, phone, 'UserM');
      expect(res2.status).toBe(409);
      expect(res2.body.code).toBe('PHONE_ACTIVE_ELSEWHERE');

      // Close session 1
      await closeSession(res1.body.session.id, 'reset');

      // Now join on table 2 succeeds
      const res3 = await join(table2, phone, 'UserM');
      expect(res3.status).toBe(201);
      expect(res3.body.participant.role).toBe('host');
    });

    test('full table: with 11 more participants inserted through the model the next join gives 409 TABLE_FULL; with an expired pending request among them it succeeds and the expired entry is removed', async () => {
      const table = await makeTable(fixtures.restaurantA._id, 107);
      const hostRes = await join(table, '9824079910', 'HostGuest');
      expect(hostRes.status).toBe(201);

      // Insert 11 approved participants through model to reach 12
      const extraParticipants = [];
      for (let i = 1; i <= 11; i++) {
        extraParticipants.push({
          id: crypto.randomUUID(),
          nickname: `Guest${i}`,
          phone: `+9198240799${String(10 + i).padStart(2, '0')}`,
          role: 'guest',
          status: 'approved',
          allergiesDeclared: false,
          joinedAt: new Date(),
        });
      }

      await TableSession.updateOne(
        { _id: hostRes.body.session.id },
        { $push: { participants: { $each: extraParticipants } } }
      );

      // Attempt 13th participant -> 409 TABLE_FULL
      const fullRes = await join(table, '9824079930', 'ExtraGuest');
      expect(fullRes.status).toBe(409);
      expect(fullRes.body.code).toBe('TABLE_FULL');

      // Now replace one participant with an expired pending participant (joined 11 minutes ago)
      const expiredId = crypto.randomUUID();
      await TableSession.updateOne(
        { _id: hostRes.body.session.id },
        {
          $pop: { participants: 1 },
        }
      );
      await TableSession.updateOne(
        { _id: hostRes.body.session.id },
        {
          $push: {
            participants: {
              id: expiredId,
              nickname: 'ExpiredPending',
              phone: '+919824079931',
              role: 'guest',
              status: 'pending',
              allergiesDeclared: false,
              joinedAt: new Date(Date.now() - 11 * 60 * 1000),
            },
          },
        }
      );

      // Joining now succeeds as the expired entry is cleaned up
      const joinSuccessRes = await join(table, '9824079932', 'FreshPending');
      expect(joinSuccessRes.status).toBe(201);
      expect(joinSuccessRes.body.participant.status).toBe('pending');

      const rechecked = await TableSession.findById(hostRes.body.session.id);
      expect(rechecked.participants.some((p) => p.id === expiredId)).toBe(false);
    });

    test('an expired pending request (joinedAt 11 minutes ago, set through the model) lets the same phone join again as pending and leaves exactly one entry for that phone', async () => {
      const table = await makeTable(fixtures.restaurantA._id, 108);
      const hostRes = await join(table, '9824079940', 'HostA');
      expect(hostRes.status).toBe(201);

      const phone = '9824079941';
      const guestRes = await join(table, phone, 'PendingA');
      expect(guestRes.status).toBe(201);

      // Mark this pending request as joined 11 minutes ago
      await TableSession.updateOne(
        { _id: hostRes.body.session.id, 'participants.id': guestRes.body.participant.id },
        { $set: { 'participants.$.joinedAt': new Date(Date.now() - 11 * 60 * 1000) } }
      );

      // Same phone joins again: should succeed as pending
      const retryRes = await join(table, phone, 'PendingARetry');
      expect(retryRes.status).toBe(201);
      expect(retryRes.body.participant.status).toBe('pending');

      const session = await TableSession.findById(hostRes.body.session.id);
      const phoneEntries = session.participants.filter((p) => p.phone === '+919824079941');
      expect(phoneEntries).toHaveLength(1);
      expect(phoneEntries[0].id).toBe(retryRes.body.participant.id);
    });

    test('an idle session (lastActivityAt 5 hours ago, set through the model): a new join closes it (closedReason "timeout", every phone null) and starts a new session with new guest as host', async () => {
      const table = await makeTable(fixtures.restaurantA._id, 109);
      const oldHostRes = await join(table, '9824079950', 'OldHost');
      expect(oldHostRes.status).toBe(201);

      // Mark idle for 5 hours
      const fiveHoursAgo = new Date(Date.now() - 5 * 60 * 60 * 1000);
      await TableSession.updateOne(
        { _id: oldHostRes.body.session.id },
        { $set: { lastActivityAt: fiveHoursAgo } }
      );

      // New join with new phone
      const newJoinRes = await join(table, '9824079951', 'NewHost');
      expect(newJoinRes.status).toBe(201);
      expect(newJoinRes.body.participant.role).toBe('host');
      expect(newJoinRes.body.participant.status).toBe('approved');
      expect(newJoinRes.body.session.id).not.toBe(oldHostRes.body.session.id);

      // Check old session was closed properly
      const oldSession = await TableSession.findById(oldHostRes.body.session.id);
      expect(oldSession.status).toBe('closed');
      expect(oldSession.closedReason).toBe('timeout');
      expect(oldSession.closedAt).toBeInstanceOf(Date);
      expect(oldSession.participants[0].phone).toBeNull();
    });

    test('simultaneous joins: Promise.all of 5 different phones on a table with no session gives exactly 1 host and 4 pending, exactly one open session, and no 500', async () => {
      const table = await makeTable(fixtures.restaurantA._id, 110);
      const phones = [
        '9824079961',
        '9824079962',
        '9824079963',
        '9824079964',
        '9824079965',
      ];

      const results = await Promise.all(
        phones.map((phone, idx) => join(table, phone, `Guest${idx + 1}`))
      );

      // Verify no 500 errors
      for (const res of results) {
        expect(res.status).toBe(201);
      }

      const hosts = results.filter((r) => r.body.participant.role === 'host');
      const pending = results.filter(
        (r) => r.body.participant.role === 'guest' && r.body.participant.status === 'pending'
      );

      expect(hosts).toHaveLength(1);
      expect(pending).toHaveLength(4);

      // Exactly one open session in DB
      const openSessions = await TableSession.find({ tableId: table._id, status: 'open' });
      expect(openSessions).toHaveLength(1);
      expect(openSessions[0].participants).toHaveLength(5);
    });

    test('simultaneous joins of the same phone at two different tables: exactly one 201 and one 409 PHONE_ACTIVE_ELSEWHERE', async () => {
      const tableA = await makeTable(fixtures.restaurantA._id, 111);
      const tableB = await makeTable(fixtures.restaurantA._id, 112);
      const phone = '9824079970';

      const results = await Promise.all([
        join(tableA, phone, 'ConcurrentAlice'),
        join(tableB, phone, 'ConcurrentAlice'),
      ]);

      const statuses = results.map((r) => r.status).sort();
      expect(statuses).toEqual([201, 409]);

      const conflictRes = results.find((r) => r.status === 409);
      expect(conflictRes.body.code).toBe('PHONE_ACTIVE_ELSEWHERE');
    });

    test('join-side table race: Table.exists resolves null at re-check: 404 TABLE_NOT_FOUND, session closed with reason "table-removed" and phones null', async () => {
      const table = await makeTable(fixtures.restaurantA._id, 113);
      const phone = '9824079975';

      const existsSpy = jest.spyOn(Table, 'exists').mockResolvedValueOnce(null);

      const res = await join(table, phone, 'RaceGuest');
      expect(res.status).toBe(404);
      expect(res.body).toEqual({
        message: 'This table link is not valid',
        code: 'TABLE_NOT_FOUND',
      });

      existsSpy.mockRestore();

      // Verify session was closed and phone nulled
      const session = await TableSession.findOne({ tableId: table._id });
      expect(session).toBeDefined();
      expect(session.status).toBe('closed');
      expect(session.closedReason).toBe('table-removed');
      expect(session.participants[0].phone).toBeNull();
    });
  });

  describe('GUEST AUTH and /me Endpoint (GET /api/sessions/me)', () => {
    test('/me for host shows approved and pending lists; approved guest sees approved only; pending sees only themself; no full phone numbers exposed', async () => {
      const table = await makeTable(fixtures.restaurantA._id, 201);
      const hostRes = await join(table, '9824080001', 'HostPerson');
      const approvedGuestRes = await join(table, '9824080002', 'ApprovedPerson');
      const pendingGuestRes = await join(table, '9824080003', 'PendingPerson');

      // Approve approvedGuest
      await request(app)
        .post(`/api/sessions/participants/${approvedGuestRes.body.participant.id}/approve`)
        .set('Authorization', `Bearer ${hostRes.body.token}`);

      // 1. Host view
      const hostMe = await request(app)
        .get('/api/sessions/me')
        .set('Authorization', `Bearer ${hostRes.body.token}`);
      expect(hostMe.status).toBe(200);
      expect(hostMe.body.me.nickname).toBe('HostPerson');
      expect(hostMe.body.participants).toHaveLength(2); // Host + ApprovedPerson
      expect(hostMe.body.pending).toHaveLength(1); // PendingPerson
      expect(JSON.stringify(hostMe.body.participants)).not.toContain('9824080002');
      expect(JSON.stringify(hostMe.body.pending)).not.toContain('9824080003');

      // 2. Approved guest view
      const approvedMe = await request(app)
        .get('/api/sessions/me')
        .set('Authorization', `Bearer ${approvedGuestRes.body.token}`);
      expect(approvedMe.status).toBe(200);
      expect(approvedMe.body.me.nickname).toBe('ApprovedPerson');
      expect(approvedMe.body.participants).toHaveLength(2);
      expect(approvedMe.body.pending).toEqual([]); // Non-host sees no pending

      // 3. Pending guest view
      const pendingMe = await request(app)
        .get('/api/sessions/me')
        .set('Authorization', `Bearer ${pendingGuestRes.body.token}`);
      expect(pendingMe.status).toBe(200);
      expect(pendingMe.body.me.nickname).toBe('PendingPerson');
      expect(pendingMe.body.participants).toEqual([]);
      expect(pendingMe.body.pending).toEqual([]);
    });

    test('no token (401 INVALID_TOKEN)', async () => {
      const res = await request(app).get('/api/sessions/me');
      expect(res.status).toBe(401);
      expect(res.body.code).toBe('INVALID_TOKEN');
    });

    test('garbage token (401 INVALID_TOKEN)', async () => {
      const res = await request(app)
        .get('/api/sessions/me')
        .set('Authorization', 'Bearer gibberish.token');
      expect(res.status).toBe(401);
      expect(res.body.code).toBe('INVALID_TOKEN');
    });

    test('staff token fails on guest route (401 INVALID_TOKEN)', async () => {
      const res = await request(app)
        .get('/api/sessions/me')
        .set('Authorization', `Bearer ${fixtures.ownerAToken}`);
      expect(res.status).toBe(401);
      expect(res.body.code).toBe('INVALID_TOKEN');
    });

    test('token for closed session gives 401 SESSION_CLOSED', async () => {
      const table = await makeTable(fixtures.restaurantA._id, 202);
      const joinRes = await join(table, '9824080010', 'GuestClose');
      await closeSession(joinRes.body.session.id, 'reset');

      const res = await request(app)
        .get('/api/sessions/me')
        .set('Authorization', `Bearer ${joinRes.body.token}`);
      expect(res.status).toBe(401);
      expect(res.body.code).toBe('SESSION_CLOSED');
    });

    test('token for removed participant gives 401 PARTICIPANT_REMOVED', async () => {
      const table = await makeTable(fixtures.restaurantA._id, 203);
      const hostRes = await join(table, '9824080020', 'HostRemove');
      const guestRes = await join(table, '9824080021', 'GuestRemove');

      // Reject/remove guest
      await request(app)
        .post(`/api/sessions/participants/${guestRes.body.participant.id}/reject`)
        .set('Authorization', `Bearer ${hostRes.body.token}`);

      const res = await request(app)
        .get('/api/sessions/me')
        .set('Authorization', `Bearer ${guestRes.body.token}`);
      expect(res.status).toBe(401);
      expect(res.body.code).toBe('PARTICIPANT_REMOVED');
    });

    test('token whose session document was deleted gives 401 SESSION_CLOSED', async () => {
      const table = await makeTable(fixtures.restaurantA._id, 204);
      const joinRes = await join(table, '9824080030', 'GuestDel');
      await TableSession.findByIdAndDelete(joinRes.body.session.id);

      const res = await request(app)
        .get('/api/sessions/me')
        .set('Authorization', `Bearer ${joinRes.body.token}`);
      expect(res.status).toBe(401);
      expect(res.body.code).toBe('SESSION_CLOSED');
    });

    test('a guest token on a staff route (GET /api/auth/me) gives 401', async () => {
      const table = await makeTable(fixtures.restaurantA._id, 205);
      const joinRes = await join(table, '9824080040', 'GuestStaffRoute');

      const res = await request(app)
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${joinRes.body.token}`);
      expect(res.status).toBe(401);
    });

    test('a pending guest on /allergies and /menu gets 403 APPROVAL_PENDING', async () => {
      const table = await makeTable(fixtures.restaurantA._id, 206);
      await join(table, '9824080050', 'HostP');
      const pendingGuest = await join(table, '9824080051', 'PendingP');

      const allergyRes = await request(app)
        .post('/api/sessions/allergies')
        .set('Authorization', `Bearer ${pendingGuest.body.token}`)
        .send({ allergies: [] });
      expect(allergyRes.status).toBe(403);
      expect(allergyRes.body.code).toBe('APPROVAL_PENDING');

      const menuRes = await request(app)
        .get('/api/sessions/menu')
        .set('Authorization', `Bearer ${pendingGuest.body.token}`);
      expect(menuRes.status).toBe(403);
      expect(menuRes.body.code).toBe('APPROVAL_PENDING');
    });

    test('an expired pending guest is removed on next request and gets 401 PARTICIPANT_REMOVED', async () => {
      const table = await makeTable(fixtures.restaurantA._id, 207);
      const hostRes = await join(table, '9824080060', 'HostExp');
      const guestRes = await join(table, '9824080061', 'GuestExp');

      // Set joinedAt to 11 minutes ago
      await TableSession.updateOne(
        { _id: hostRes.body.session.id, 'participants.id': guestRes.body.participant.id },
        { $set: { 'participants.$.joinedAt': new Date(Date.now() - 11 * 60 * 1000) } }
      );

      const res = await request(app)
        .get('/api/sessions/me')
        .set('Authorization', `Bearer ${guestRes.body.token}`);
      expect(res.status).toBe(401);
      expect(res.body.code).toBe('PARTICIPANT_REMOVED');

      const session = await TableSession.findById(hostRes.body.session.id);
      expect(session.participants.some((p) => p.id === guestRes.body.participant.id)).toBe(false);
    });

    test('a request on a session idle for 5 hours gives 401 SESSION_CLOSED and closes session with reason "timeout"', async () => {
      const table = await makeTable(fixtures.restaurantA._id, 208);
      const hostRes = await join(table, '9824080070', 'HostIdle');

      await TableSession.updateOne(
        { _id: hostRes.body.session.id },
        { $set: { lastActivityAt: new Date(Date.now() - 5 * 60 * 60 * 1000) } }
      );

      const res = await request(app)
        .get('/api/sessions/me')
        .set('Authorization', `Bearer ${hostRes.body.token}`);
      expect(res.status).toBe(401);
      expect(res.body.code).toBe('SESSION_CLOSED');

      const session = await TableSession.findById(hostRes.body.session.id);
      expect(session.status).toBe('closed');
      expect(session.closedReason).toBe('timeout');
      expect(session.participants[0].phone).toBeNull();
    });

    test('the Table document deleted while session is open: next request is 401 SESSION_CLOSED and session closed with reason "table-removed"', async () => {
      const table = await makeTable(fixtures.restaurantA._id, 209);
      const hostRes = await join(table, '9824080080', 'HostTableDel');

      // Delete table document
      await Table.findByIdAndDelete(table._id);

      const res = await request(app)
        .get('/api/sessions/me')
        .set('Authorization', `Bearer ${hostRes.body.token}`);
      expect(res.status).toBe(401);
      expect(res.body.code).toBe('SESSION_CLOSED');

      const session = await TableSession.findById(hostRes.body.session.id);
      expect(session.status).toBe('closed');
      expect(session.closedReason).toBe('table-removed');
      expect(session.participants[0].phone).toBeNull();
    });

    test('lastActivityAt is updated when older than a minute and left alone when recent', async () => {
      const table = await makeTable(fixtures.restaurantA._id, 210);
      const hostRes = await join(table, '9824080090', 'HostActivity');

      const initialSession = await TableSession.findById(hostRes.body.session.id);
      const initialTime = initialSession.lastActivityAt.getTime();

      // Recent request -> untouched
      await request(app)
        .get('/api/sessions/me')
        .set('Authorization', `Bearer ${hostRes.body.token}`);

      const recentSession = await TableSession.findById(hostRes.body.session.id);
      expect(recentSession.lastActivityAt.getTime()).toBe(initialTime);

      // Set lastActivityAt to 70 seconds ago
      const seventySecondsAgo = new Date(Date.now() - 70 * 1000);
      await TableSession.updateOne(
        { _id: hostRes.body.session.id },
        { $set: { lastActivityAt: seventySecondsAgo } }
      );

      // Now request touches lastActivityAt
      await request(app)
        .get('/api/sessions/me')
        .set('Authorization', `Bearer ${hostRes.body.token}`);

      const updatedSession = await TableSession.findById(hostRes.body.session.id);
      expect(updatedSession.lastActivityAt.getTime()).toBeGreaterThan(seventySecondsAgo.getTime());
    });
  });

  describe('APPROVAL and REJECT Endpoints', () => {
    test('the host approves a pending guest (200; status approved in database)', async () => {
      const table = await makeTable(fixtures.restaurantA._id, 301);
      const hostRes = await join(table, '9824081001', 'HostApprove');
      const guestRes = await join(table, '9824081002', 'GuestApprove');

      const approveRes = await request(app)
        .post(`/api/sessions/participants/${guestRes.body.participant.id}/approve`)
        .set('Authorization', `Bearer ${hostRes.body.token}`);

      expect(approveRes.status).toBe(200);
      expect(approveRes.body.participants.some((p) => p.id === guestRes.body.participant.id && p.status === 'approved')).toBe(true);

      const session = await TableSession.findById(hostRes.body.session.id);
      const guest = session.participants.find((p) => p.id === guestRes.body.participant.id);
      expect(guest.status).toBe('approved');
    });

    test('a non-host guest trying to approve gets 403 NOT_HOST', async () => {
      const table = await makeTable(fixtures.restaurantA._id, 302);
      const hostRes = await join(table, '9824081011', 'HostNonHost');
      const guest1Res = await join(table, '9824081012', 'GuestOne');
      const guest2Res = await join(table, '9824081013', 'GuestTwo');

      // Host approves guest1
      await request(app)
        .post(`/api/sessions/participants/${guest1Res.body.participant.id}/approve`)
        .set('Authorization', `Bearer ${hostRes.body.token}`);

      // Guest1 tries to approve guest2
      const res = await request(app)
        .post(`/api/sessions/participants/${guest2Res.body.participant.id}/approve`)
        .set('Authorization', `Bearer ${guest1Res.body.token}`);

      expect(res.status).toBe(403);
      expect(res.body.code).toBe('NOT_HOST');
    });

    test('approving an unknown id, an already approved id, and an expired request all give 404 NOT_FOUND', async () => {
      const table = await makeTable(fixtures.restaurantA._id, 303);
      const hostRes = await join(table, '9824081021', 'HostChecks');
      const guestRes = await join(table, '9824081022', 'GuestChecks');

      // 1. Unknown id
      const res1 = await request(app)
        .post('/api/sessions/participants/non-existent-id/approve')
        .set('Authorization', `Bearer ${hostRes.body.token}`);
      expect(res1.status).toBe(404);
      expect(res1.body.code).toBe('NOT_FOUND');

      // 2. Approve once -> succeeds
      const resApprove = await request(app)
        .post(`/api/sessions/participants/${guestRes.body.participant.id}/approve`)
        .set('Authorization', `Bearer ${hostRes.body.token}`);
      expect(resApprove.status).toBe(200);

      // Approving already approved id -> 404
      const res2 = await request(app)
        .post(`/api/sessions/participants/${guestRes.body.participant.id}/approve`)
        .set('Authorization', `Bearer ${hostRes.body.token}`);
      expect(res2.status).toBe(404);
      expect(res2.body.code).toBe('NOT_FOUND');

      // 3. Expired request -> 404
      const expiredGuestRes = await join(table, '9824081023', 'GuestExpired');
      await TableSession.updateOne(
        { _id: hostRes.body.session.id, 'participants.id': expiredGuestRes.body.participant.id },
        { $set: { 'participants.$.joinedAt': new Date(Date.now() - 11 * 60 * 1000) } }
      );

      const res3 = await request(app)
        .post(`/api/sessions/participants/${expiredGuestRes.body.participant.id}/approve`)
        .set('Authorization', `Bearer ${hostRes.body.token}`);
      expect(res3.status).toBe(404);
      expect(res3.body.code).toBe('NOT_FOUND');
    });

    test('the host rejects a pending guest (removed from session); host cannot reject an approved guest or themself (404 NOT_FOUND)', async () => {
      const table = await makeTable(fixtures.restaurantA._id, 304);
      const hostRes = await join(table, '9824081031', 'HostReject');
      const pendingRes = await join(table, '9824081032', 'PendingReject');
      const approvedRes = await join(table, '9824081033', 'ApprovedReject');

      // Approve approvedRes
      await request(app)
        .post(`/api/sessions/participants/${approvedRes.body.participant.id}/approve`)
        .set('Authorization', `Bearer ${hostRes.body.token}`);

      // Host rejects pendingRes -> succeeds (removed)
      const rejectPendingRes = await request(app)
        .post(`/api/sessions/participants/${pendingRes.body.participant.id}/reject`)
        .set('Authorization', `Bearer ${hostRes.body.token}`);
      expect(rejectPendingRes.status).toBe(200);

      const sessionAfterReject = await TableSession.findById(hostRes.body.session.id);
      expect(sessionAfterReject.participants.some((p) => p.id === pendingRes.body.participant.id)).toBe(false);

      // Host cannot reject approved guest -> 404
      const rejectApprovedRes = await request(app)
        .post(`/api/sessions/participants/${approvedRes.body.participant.id}/reject`)
        .set('Authorization', `Bearer ${hostRes.body.token}`);
      expect(rejectApprovedRes.status).toBe(404);
      expect(rejectApprovedRes.body.code).toBe('NOT_FOUND');

      // Host cannot reject themself -> 404
      const rejectSelfRes = await request(app)
        .post(`/api/sessions/participants/${hostRes.body.participant.id}/reject`)
        .set('Authorization', `Bearer ${hostRes.body.token}`);
      expect(rejectSelfRes.status).toBe(404);
      expect(rejectSelfRes.body.code).toBe('NOT_FOUND');
    });

    test('a token from another session cannot approve anything here (404 NOT_FOUND)', async () => {
      const tableA = await makeTable(fixtures.restaurantA._id, 305);
      const tableB = await makeTable(fixtures.restaurantA._id, 306);

      const hostARes = await join(tableA, '9824081041', 'HostA');
      const pendingARes = await join(tableA, '9824081042', 'PendingA');

      const hostBRes = await join(tableB, '9824081043', 'HostB');

      // Host B tries to approve Pending A
      const res = await request(app)
        .post(`/api/sessions/participants/${pendingARes.body.participant.id}/approve`)
        .set('Authorization', `Bearer ${hostBRes.body.token}`);
      expect(res.status).toBe(404);
      expect(res.body.code).toBe('NOT_FOUND');
    });
  });

  describe('ALLERGIES and MENU Endpoints', () => {
    test('/menu before declaring gives 403 ALLERGIES_REQUIRED; after /allergies with [] it gives 200 and menu works', async () => {
      const table = await makeTable(fixtures.restaurantA._id, 401);
      const hostRes = await join(table, '9824082001', 'HostAllergy');

      // 1. Menu before declaring allergies
      const menuBefore = await request(app)
        .get('/api/sessions/menu')
        .set('Authorization', `Bearer ${hostRes.body.token}`);
      expect(menuBefore.status).toBe(403);
      expect(menuBefore.body.code).toBe('ALLERGIES_REQUIRED');

      // 2. Declare allergies with []
      const declareRes = await request(app)
        .post('/api/sessions/allergies')
        .set('Authorization', `Bearer ${hostRes.body.token}`)
        .send({ allergies: [] });
      expect(declareRes.status).toBe(200);
      expect(declareRes.body.me.allergiesDeclared).toBe(true);

      // 3. Menu now succeeds
      const menuAfter = await request(app)
        .get('/api/sessions/menu')
        .set('Authorization', `Bearer ${hostRes.body.token}`);
      expect(menuAfter.status).toBe(200);
      expect(Array.isArray(menuAfter.body.items)).toBe(true);
    });

    describe('POST /api/sessions/allergies bad input (all 400 INVALID_INPUT)', () => {
      let badInputHostToken;

      beforeAll(async () => {
        const table = await makeTable(fixtures.restaurantA._id);
        const hostRes = await join(table, '9824082010', 'HostBadAllergy');
        badInputHostToken = hostRes.body.token;
      });

      test.each([
        ['string instead of array', 'peanut'],
        ['array with null', [null]],
        ['array with number', [5]],
        ['misspelled allergen plural ("peanuts")', ['peanuts']],
        ['unrecognised allergen ("wheat")', ['wheat']],
        ['11 entries', ['peanut', 'tree nut', 'dairy', 'egg', 'gluten', 'soy', 'fish', 'shellfish', 'sesame', 'mustard', 'peanut']],
        ['missing field (empty body)', undefined],
      ])('%s gives 400 INVALID_INPUT', async (_, val) => {
        const body = val !== undefined ? { allergies: val } : {};
        const res = await request(app)
          .post('/api/sessions/allergies')
          .set('Authorization', `Bearer ${badInputHostToken}`)
          .send(body);

        expect(res.status).toBe(400);
        expect(res.body.code).toBe('INVALID_INPUT');
      });
    });

    test('[" Peanut ", "SOY"] normalises and stores ["peanut", "soy"]', async () => {
      const table = await makeTable(fixtures.restaurantA._id, 403);
      const hostRes = await join(table, '9824082020', 'HostNormalise');

      const res = await request(app)
        .post('/api/sessions/allergies')
        .set('Authorization', `Bearer ${hostRes.body.token}`)
        .send({ allergies: [' Peanut ', 'SOY'] });
      expect(res.status).toBe(200);

      const session = await TableSession.findById(hostRes.body.session.id);
      expect(session.participants[0].allergies).toEqual(['peanut', 'soy']);
      expect(session.participants[0].allergiesDeclared).toBe(true);
    });

    test('/menu safety flags: guest with ["peanut"]: peanut dish safe=false, unconfirmed dish safe=false, safe dish safe=true; for guest with [] unconfirmed dish is safe', async () => {
      const table = await makeTable(fixtures.restaurantA._id, 404);
      const hostRes = await join(table, '9824082030', 'HostSafety');

      // Create an unconfirmed dish in restaurant A
      const unconfirmedDish = await MenuItem.create({
        restaurantId: fixtures.restaurantA._id,
        name: 'Unconfirmed Soup',
        description: 'Chef special',
        price: 25,
        category: 'Starters',
        isVeg: true,
        allergens: ['dairy'],
        allergensConfirmed: false,
      });

      // Declare peanut allergy
      await request(app)
        .post('/api/sessions/allergies')
        .set('Authorization', `Bearer ${hostRes.body.token}`)
        .send({ allergies: ['peanut'] });

      const menuRes = await request(app)
        .get('/api/sessions/menu')
        .set('Authorization', `Bearer ${hostRes.body.token}`);
      expect(menuRes.status).toBe(200);

      const items = menuRes.body.items;

      // 1. Dish tagged peanut
      const peanutDish = items.find((i) => (i.allergens || []).includes('peanut'));
      if (peanutDish) {
        expect(peanutDish.safe).toBe(false);
        expect(peanutDish.clashes).toContain('peanut');
        expect(peanutDish.reason).toBe('allergen');
      }

      // 2. Unconfirmed dish for guest with allergies
      const unconfirmedInMenu = items.find((i) => i.name === 'Unconfirmed Soup');
      expect(unconfirmedInMenu).toBeDefined();
      expect(unconfirmedInMenu.safe).toBe(false);
      expect(unconfirmedInMenu.reason).toBe('unconfirmed');

      // 3. Dish with no allergen tags
      const safeDish = items.find((i) => (i.allergens || []).length === 0 && i.allergensConfirmed === true);
      if (safeDish) {
        expect(safeDish.safe).toBe(true);
        expect(safeDish.clashes).toEqual([]);
        expect(safeDish.reason).toBe('ok');
      }

      // 4. Change allergies to []
      await request(app)
        .post('/api/sessions/allergies')
        .set('Authorization', `Bearer ${hostRes.body.token}`)
        .send({ allergies: [] });

      const menuEmptyRes = await request(app)
        .get('/api/sessions/menu')
        .set('Authorization', `Bearer ${hostRes.body.token}`);
      expect(menuEmptyRes.status).toBe(200);

      const unconfirmedForEmpty = menuEmptyRes.body.items.find((i) => i.name === 'Unconfirmed Soup');
      expect(unconfirmedForEmpty.safe).toBe(true);
      expect(unconfirmedForEmpty.reason).toBe('ok');

      // Clean up unconfirmed dish
      await MenuItem.findByIdAndDelete(unconfirmedDish._id);
    });

    test('/menu lists only available dishes of this restaurant (no rest B, no unavailable dishes); items have exact expected keys', async () => {
      const table = await makeTable(fixtures.restaurantA._id);
      const hostRes = await join(table, '9824082040', 'HostScope');

      // Create an available dish in restaurant A
      const availableDishA = await MenuItem.create({
        restaurantId: fixtures.restaurantA._id,
        name: 'Visible Delicious Dish',
        description: 'Chef signature',
        price: 45,
        category: 'Mains',
        isVeg: true,
        spiceLevel: 2,
        flavourTags: ['sweet'],
        cuisine: 'French',
        course: 'main',
        portionSize: 'regular',
        prepMinutes: 15,
        allergens: ['dairy'],
        allergensConfirmed: true,
        available: true,
      });

      // Create an unavailable dish in restaurant A
      const unavailableDishA = await MenuItem.create({
        restaurantId: fixtures.restaurantA._id,
        name: 'Hidden Secret Dish',
        description: 'Sold out',
        price: 50,
        category: 'Mains',
        isVeg: true,
        available: false,
      });

      // Create a dish in restaurant B
      const dishB = await MenuItem.create({
        restaurantId: fixtures.restaurantB._id,
        name: 'Restaurant B Special',
        description: 'Other tenant',
        price: 30,
        category: 'Mains',
        isVeg: true,
        available: true,
      });

      // Declare allergies
      await request(app)
        .post('/api/sessions/allergies')
        .set('Authorization', `Bearer ${hostRes.body.token}`)
        .send({ allergies: [] });

      const menuRes = await request(app)
        .get('/api/sessions/menu')
        .set('Authorization', `Bearer ${hostRes.body.token}`);
      expect(menuRes.status).toBe(200);

      const items = menuRes.body.items;
      // Visible dish appears
      expect(items.some((i) => i.name === 'Visible Delicious Dish')).toBe(true);
      // Restaurant B dishes never appear
      expect(items.some((i) => i.name === 'Restaurant B Special')).toBe(false);
      // Unavailable dishes never appear
      expect(items.some((i) => i.name === 'Hidden Secret Dish')).toBe(false);

      // Verify exact publicMenuItem keys plus safe, clashes, reason
      const expectedKeys = [
        'id',
        'name',
        'description',
        'price',
        'category',
        'isVeg',
        'allergens',
        'allergensConfirmed',
        'spiceLevel',
        'flavourTags',
        'cuisine',
        'course',
        'portionSize',
        'prepMinutes',
        'safe',
        'clashes',
        'reason',
      ].sort();

      for (const item of items) {
        expect(Object.keys(item).sort()).toEqual(expectedKeys);
      }

      await MenuItem.deleteMany({ _id: { $in: [availableDishA._id, unavailableDishA._id, dishB._id] } });
    });

    test('a second /allergies call changes the flags on the next /menu call', async () => {
      const table = await makeTable(fixtures.restaurantA._id);
      const hostRes = await join(table, '9824082050', 'HostMultiCall');

      // Create a dairy dish
      const dairyItem = await MenuItem.create({
        restaurantId: fixtures.restaurantA._id,
        name: 'Creamy Panna Cotta',
        price: 15,
        category: 'Desserts',
        isVeg: true,
        allergens: ['dairy'],
        allergensConfirmed: true,
        available: true,
      });

      // Declare dairy allergy
      await request(app)
        .post('/api/sessions/allergies')
        .set('Authorization', `Bearer ${hostRes.body.token}`)
        .send({ allergies: ['dairy'] });

      const menu1 = await request(app)
        .get('/api/sessions/menu')
        .set('Authorization', `Bearer ${hostRes.body.token}`);
      const dish1 = menu1.body.items.find((i) => i.id === String(dairyItem._id));
      expect(dish1.safe).toBe(false);
      expect(dish1.clashes).toContain('dairy');

      // Now change allergies to ["peanut"]
      await request(app)
        .post('/api/sessions/allergies')
        .set('Authorization', `Bearer ${hostRes.body.token}`)
        .send({ allergies: ['peanut'] });

      const menu2 = await request(app)
        .get('/api/sessions/menu')
        .set('Authorization', `Bearer ${hostRes.body.token}`);
      const dish2 = menu2.body.items.find((i) => i.id === String(dairyItem._id));
      expect(dish2.safe).toBe(true);

      await MenuItem.findByIdAndDelete(dairyItem._id);
    });

    test('["peanut", " PEANUT ", "soy"] de-duplicates and stores ["peanut", "soy"]', async () => {
      const table = await makeTable(fixtures.restaurantA._id);
      const hostRes = await join(table, '9824083001', 'HostDedup');

      const res = await request(app)
        .post('/api/sessions/allergies')
        .set('Authorization', `Bearer ${hostRes.body.token}`)
        .send({ allergies: ['peanut', ' PEANUT ', 'soy'] });

      expect(res.status).toBe(200);
      const session = await TableSession.findById(hostRes.body.session.id);
      expect(session.participants[0].allergies).toEqual(['peanut', 'soy']);
    });

    test('GET /api/sessions/menu returns dishes sorted by category ascending then name ascending', async () => {
      const table = await makeTable(fixtures.restaurantA._id);
      const hostRes = await join(table, '9824083002', 'HostMenuSort');

      const item1 = await MenuItem.create({
        restaurantId: fixtures.restaurantA._id,
        name: 'Zucchini Fritters',
        price: 20,
        category: 'Starters',
        isVeg: true,
        available: true,
      });

      const item2 = await MenuItem.create({
        restaurantId: fixtures.restaurantA._id,
        name: 'Avocado Tartine',
        price: 22,
        category: 'Starters',
        isVeg: true,
        available: true,
      });

      const item3 = await MenuItem.create({
        restaurantId: fixtures.restaurantA._id,
        name: 'Chocolate Fondant',
        price: 18,
        category: 'Desserts',
        isVeg: true,
        available: true,
      });

      await request(app)
        .post('/api/sessions/allergies')
        .set('Authorization', `Bearer ${hostRes.body.token}`)
        .send({ allergies: [] });

      const menuRes = await request(app)
        .get('/api/sessions/menu')
        .set('Authorization', `Bearer ${hostRes.body.token}`);

      expect(menuRes.status).toBe(200);
      const items = menuRes.body.items;
      expect(items.length).toBeGreaterThanOrEqual(3);

      for (let i = 0; i < items.length - 1; i++) {
        const curr = items[i];
        const next = items[i + 1];
        if (curr.category === next.category) {
          expect(curr.name.localeCompare(next.name)).toBeLessThanOrEqual(0);
        } else {
          expect(curr.category.localeCompare(next.category)).toBeLessThanOrEqual(0);
        }
      }

      await MenuItem.deleteMany({ _id: { $in: [item1._id, item2._id, item3._id] } });
    });
  });

  describe('Indian scripts and nickname sanitisation', () => {
    test('Hindi script nickname "रवि" is accepted', async () => {
      const table = await makeTable(fixtures.restaurantA._id);
      const res = await join(table, '9824084001', 'रवि');
      expect(res.status).toBe(201);
      expect(res.body.participant.nickname).toBe('रवि');
    });

    test('Gujarati script nickname "અમિત" is accepted', async () => {
      const table = await makeTable(fixtures.restaurantA._id);
      const res = await join(table, '9824084002', 'અમિત');
      expect(res.status).toBe(201);
      expect(res.body.participant.nickname).toBe('અમિત');
    });

    test('punctuation in nickname "O\'Connor-Smith Jr." is accepted', async () => {
      const table = await makeTable(fixtures.restaurantA._id);
      const res = await join(table, '9824084003', "O'Connor-Smith Jr.");
      expect(res.status).toBe(201);
      expect(res.body.participant.nickname).toBe("O'Connor-Smith Jr.");
    });

    test('multiple internal spaces in nickname are collapsed and trimmed ("  Ravi   Kumar  " -> "Ravi Kumar")', async () => {
      const table = await makeTable(fixtures.restaurantA._id);
      const res = await join(table, '9824084004', '  Ravi   Kumar  ');
      expect(res.status).toBe(201);
      expect(res.body.participant.nickname).toBe('Ravi Kumar');
    });
  });
});
