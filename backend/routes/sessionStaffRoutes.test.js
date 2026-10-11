// sessionStaffRoutes.test.js: Integration tests for staff session management, table reset/reject, participant approve/remove, and idle sweeper
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import mongoose from 'mongoose';
import request from 'supertest';
import { jest } from '@jest/globals';
import { app } from '../server.js';
import Table from '../models/Table.js';
import TableSession from '../models/TableSession.js';
import {
  closeSession,
  closeIdleSessions,
  startIdleSweeper,
} from '../controllers/sessionController.js';
import { generateGuestToken } from '../utils/generateToken.js';
import { connectTestDb, clearTestDb, disconnectTestDb } from '../config/testDb.js';
import { createFixtures } from '../config/testFixtures.js';

describe('Staff Table Session Safeguards (/api/sessions/staff)', () => {
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

  let tableCounter = 200;
  const makeTable = async (restaurantId, numberOverride = null) => {
    tableCounter += 1;
    const number = numberOverride !== null ? numberOverride : tableCounter;
    const qrToken = crypto.randomBytes(16).toString('hex');
    return await Table.create({
      restaurantId,
      number,
      qrToken,
    });
  };

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

  describe('ACTIVE LIST (GET /api/sessions/staff/active)', () => {
    test('owner sees open sessions of own restaurant sorted by table number ascending', async () => {
      const table3 = await makeTable(fixtures.restaurantA._id, 63);
      const table1 = await makeTable(fixtures.restaurantA._id, 61);
      const table2 = await makeTable(fixtures.restaurantA._id, 62);

      await join(table3, '9824100001', 'User3');
      await join(table1, '9824100002', 'User1');
      await join(table2, '9824100003', 'User2');

      const res = await request(app)
        .get('/api/sessions/staff/active')
        .set('Authorization', `Bearer ${fixtures.ownerAToken}`);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.sessions)).toBe(true);

      const tableNumbers = res.body.sessions.map((s) => s.tableNumber);
      // Verify sorted order
      for (let i = 0; i < tableNumbers.length - 1; i++) {
        expect(tableNumbers[i]).toBeLessThanOrEqual(tableNumbers[i + 1]);
      }
      expect(tableNumbers).toContain(61);
      expect(tableNumbers).toContain(62);
      expect(tableNumbers).toContain(63);

      await TableSession.updateMany(
        { restaurantId: fixtures.restaurantA._id, status: 'open' },
        { $set: { status: 'closed', 'participants.$[].phone': null } }
      );
    });

    test('kitchen sees open sessions of own restaurant', async () => {
      const table = await makeTable(fixtures.restaurantA._id);
      await join(table, '9824100004', 'KUser');

      const res = await request(app)
        .get('/api/sessions/staff/active')
        .set('Authorization', `Bearer ${fixtures.kitchenAToken}`);

      expect(res.status).toBe(200);
      const session = res.body.sessions.find((s) => s.tableNumber === table.number);
      expect(session).toBeDefined();

      await TableSession.updateMany(
        { restaurantId: fixtures.restaurantA._id, status: 'open' },
        { $set: { status: 'closed', 'participants.$[].phone': null } }
      );
    });

    test('restaurant B sessions never appear in restaurant A active list', async () => {
      const tableA = await makeTable(fixtures.restaurantA._id);
      const tableB = await makeTable(fixtures.restaurantB._id);

      await join(tableA, '9824100005', 'UserA');
      await join(tableB, '9824100006', 'UserB');

      const resA = await request(app)
        .get('/api/sessions/staff/active')
        .set('Authorization', `Bearer ${fixtures.ownerAToken}`);

      expect(resA.status).toBe(200);
      const numsA = resA.body.sessions.map((s) => s.tableNumber);
      expect(numsA).toContain(tableA.number);
      expect(numsA).not.toContain(tableB.number);

      const resB = await request(app)
        .get('/api/sessions/staff/active')
        .set('Authorization', `Bearer ${fixtures.ownerBToken}`);

      expect(resB.status).toBe(200);
      const numsB = resB.body.sessions.map((s) => s.tableNumber);
      expect(numsB).toContain(tableB.number);
      expect(numsB).not.toContain(tableA.number);

      await TableSession.updateMany(
        { status: 'open' },
        { $set: { status: 'closed', 'participants.$[].phone': null } }
      );
    });

    test('closed sessions of restaurant A never appear in active list', async () => {
      const table = await makeTable(fixtures.restaurantA._id);
      const joinRes = await join(table, '9824100007', 'ClosedUser');
      const sessionId = joinRes.body.session.id;

      await closeSession(sessionId, 'reset');

      const res = await request(app)
        .get('/api/sessions/staff/active')
        .set('Authorization', `Bearer ${fixtures.ownerAToken}`);

      expect(res.status).toBe(200);
      const found = res.body.sessions.find((s) => s.id === sessionId);
      expect(found).toBeUndefined();
    });

    test('each item has exactly the documented keys: createdAt, host, id, idleMinutes, lastActivityAt, participantCount, participants, pendingCount, tableNumber', async () => {
      const table = await makeTable(fixtures.restaurantA._id);
      await join(table, '9824100008', 'ShapeUser');

      const res = await request(app)
        .get('/api/sessions/staff/active')
        .set('Authorization', `Bearer ${fixtures.ownerAToken}`);

      expect(res.status).toBe(200);
      const session = res.body.sessions.find((s) => s.tableNumber === table.number);
      expect(session).toBeDefined();

      const expectedKeys = [
        'createdAt',
        'host',
        'id',
        'idleMinutes',
        'lastActivityAt',
        'participantCount',
        'participants',
        'pendingCount',
        'tableNumber',
      ].sort();

      expect(Object.keys(session).sort()).toEqual(expectedKeys);

      await TableSession.updateMany(
        { status: 'open' },
        { $set: { status: 'closed', 'participants.$[].phone': null } }
      );
    });

    test('idleMinutes matches lastActivityAt (set through the model)', async () => {
      const table = await makeTable(fixtures.restaurantA._id);
      const joinRes = await join(table, '9824100009', 'IdleUser');
      const sessionId = joinRes.body.session.id;

      const fifteenMinsAgo = new Date(Date.now() - 15 * 60 * 1000);
      await TableSession.updateOne({ _id: sessionId }, { $set: { lastActivityAt: fifteenMinsAgo } });

      const res = await request(app)
        .get('/api/sessions/staff/active')
        .set('Authorization', `Bearer ${fixtures.ownerAToken}`);

      expect(res.status).toBe(200);
      const item = res.body.sessions.find((s) => s.id === sessionId);
      expect(item.idleMinutes).toBe(15);

      await TableSession.updateMany(
        { status: 'open' },
        { $set: { status: 'closed', 'participants.$[].phone': null } }
      );
    });

    test('pendingCount and participantCount exclude an expired pending request (>10 minutes)', async () => {
      const table = await makeTable(fixtures.restaurantA._id);
      const hostRes = await join(table, '9824100010', 'HostCount');
      const pendingRes = await join(table, '9824100011', 'PendingCount');

      const elevenMinsAgo = new Date(Date.now() - 11 * 60 * 1000);
      await TableSession.updateOne(
        { _id: hostRes.body.session.id, 'participants.id': pendingRes.body.participant.id },
        { $set: { 'participants.$.joinedAt': elevenMinsAgo } }
      );

      const res = await request(app)
        .get('/api/sessions/staff/active')
        .set('Authorization', `Bearer ${fixtures.ownerAToken}`);

      expect(res.status).toBe(200);
      const item = res.body.sessions.find((s) => s.id === hostRes.body.session.id);
      expect(item.participantCount).toBe(1);
      expect(item.pendingCount).toBe(0);
      expect(item.participants).toHaveLength(1);
      expect(item.participants[0].id).toBe(hostRes.body.participant.id);

      await TableSession.updateMany(
        { status: 'open' },
        { $set: { status: 'closed', 'participants.$[].phone': null } }
      );
    });

    test('response JSON contains no full phone number and none of the stored digits', async () => {
      const table = await makeTable(fixtures.restaurantA._id);
      const rawPhone = '9824100012';
      await join(table, rawPhone, 'MaskUser');

      const res = await request(app)
        .get('/api/sessions/staff/active')
        .set('Authorization', `Bearer ${fixtures.ownerAToken}`);

      expect(res.status).toBe(200);
      const rawText = JSON.stringify(res.body);

      expect(rawText).not.toContain(rawPhone);
      expect(rawText).not.toContain('+919824100012');
      expect(rawText).toContain('+91 98••• ••012');

      await TableSession.updateMany(
        { status: 'open' },
        { $set: { status: 'closed', 'participants.$[].phone': null } }
      );
    });

    test('no token answers 401', async () => {
      const res = await request(app).get('/api/sessions/staff/active');
      expect(res.status).toBe(401);
      expect(res.body.message).toBe('Not authorised');
    });

    test('guest token answers 401', async () => {
      const guestToken = generateGuestToken({
        sessionId: new mongoose.Types.ObjectId().toString(),
        participantId: 'part-1',
      });

      const res = await request(app)
        .get('/api/sessions/staff/active')
        .set('Authorization', `Bearer ${guestToken}`);

      expect(res.status).toBe(401);
      expect(res.body.message).toBe('Not authorised');
    });

    test('garbage token answers 401', async () => {
      const res = await request(app)
        .get('/api/sessions/staff/active')
        .set('Authorization', 'Bearer invalid.token.garbage');

      expect(res.status).toBe(401);
      expect(res.body.message).toBe('Not authorised');
    });

    test('empty active sessions list returns { sessions: [] }', async () => {
      await TableSession.updateMany(
        { restaurantId: fixtures.restaurantA._id, status: 'open' },
        { $set: { status: 'closed', 'participants.$[].phone': null } }
      );

      const res = await request(app)
        .get('/api/sessions/staff/active')
        .set('Authorization', `Bearer ${fixtures.ownerAToken}`);

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ sessions: [] });
    });
  });

  describe('CLOSE TABLE (POST /api/sessions/staff/:sessionId/close)', () => {
    test('reset: 200 { message: "Table reset" }, database status "closed", closedReason "reset", closedAt set, phones null', async () => {
      const table = await makeTable(fixtures.restaurantA._id);
      const hostRes = await join(table, '9824100013', 'ResetHost');
      const sessionId = hostRes.body.session.id;
      const hostToken = hostRes.body.token;

      const res = await request(app)
        .post(`/api/sessions/staff/${sessionId}/close`)
        .set('Authorization', `Bearer ${fixtures.ownerAToken}`)
        .send({ reason: 'reset' });

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ message: 'Table reset' });

      const closed = await TableSession.findById(sessionId);
      expect(closed.status).toBe('closed');
      expect(closed.closedReason).toBe('reset');
      expect(closed.closedAt).toBeInstanceOf(Date);
      expect(closed.participants[0].phone).toBeNull();

      // Guest token answers 401 SESSION_CLOSED
      const meRes = await request(app)
        .get('/api/sessions/me')
        .set('Authorization', `Bearer ${hostToken}`);
      expect(meRes.status).toBe(401);
      expect(meRes.body.code).toBe('SESSION_CLOSED');

      // A new guest can start a fresh session on that table (201 host)
      const freshJoin = await join(table, '9824100014', 'FreshHost');
      expect(freshJoin.status).toBe(201);
      expect(freshJoin.body.participant.role).toBe('host');

      // The original phone can join another table
      const otherTable = await makeTable(fixtures.restaurantA._id);
      const otherJoin = await join(otherTable, '9824100013', 'ReusedPhone');
      expect(otherJoin.status).toBe(201);

      await TableSession.updateMany(
        { status: 'open' },
        { $set: { status: 'closed', 'participants.$[].phone': null } }
      );
    });

    test('rejected: 200 { message: "Session rejected" }, closedReason "rejected"', async () => {
      const table = await makeTable(fixtures.restaurantA._id);
      const hostRes = await join(table, '9824100015', 'RejectHost');
      const sessionId = hostRes.body.session.id;

      const res = await request(app)
        .post(`/api/sessions/staff/${sessionId}/close`)
        .set('Authorization', `Bearer ${fixtures.ownerAToken}`)
        .send({ reason: 'rejected' });

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ message: 'Session rejected' });

      const closed = await TableSession.findById(sessionId);
      expect(closed.status).toBe('closed');
      expect(closed.closedReason).toBe('rejected');
    });

    test('kitchen user can close table with reset', async () => {
      const table = await makeTable(fixtures.restaurantA._id);
      const hostRes = await join(table, '9824100016', 'KitchenClose');
      const sessionId = hostRes.body.session.id;

      const res = await request(app)
        .post(`/api/sessions/staff/${sessionId}/close`)
        .set('Authorization', `Bearer ${fixtures.kitchenAToken}`)
        .send({ reason: 'reset' });

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ message: 'Table reset' });
    });

    test('kitchen user can close table with rejected', async () => {
      const table = await makeTable(fixtures.restaurantA._id);
      const hostRes = await join(table, '9824100017', 'KitchenReject');
      const sessionId = hostRes.body.session.id;

      const res = await request(app)
        .post(`/api/sessions/staff/${sessionId}/close`)
        .set('Authorization', `Bearer ${fixtures.kitchenAToken}`)
        .send({ reason: 'rejected' });

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ message: 'Session rejected' });
    });

    test('missing reason in body answers 400 INVALID_INPUT', async () => {
      const table = await makeTable(fixtures.restaurantA._id);
      const hostRes = await join(table, '9824100018', 'BadReason1');
      const sessionId = hostRes.body.session.id;

      const res = await request(app)
        .post(`/api/sessions/staff/${sessionId}/close`)
        .set('Authorization', `Bearer ${fixtures.ownerAToken}`)
        .send({});

      expect(res.status).toBe(400);
      expect(res.body.code).toBe('INVALID_INPUT');

      await TableSession.updateOne({ _id: sessionId }, { $set: { status: 'closed', 'participants.$[].phone': null } });
    });

    test('wrong reason string answers 400 INVALID_INPUT', async () => {
      const table = await makeTable(fixtures.restaurantA._id);
      const hostRes = await join(table, '9824100019', 'BadReason2');
      const sessionId = hostRes.body.session.id;

      const res = await request(app)
        .post(`/api/sessions/staff/${sessionId}/close`)
        .set('Authorization', `Bearer ${fixtures.ownerAToken}`)
        .send({ reason: 'cancelled' });

      expect(res.status).toBe(400);
      expect(res.body.code).toBe('INVALID_INPUT');

      await TableSession.updateOne({ _id: sessionId }, { $set: { status: 'closed', 'participants.$[].phone': null } });
    });

    test('non-string reason answers 400 INVALID_INPUT', async () => {
      const table = await makeTable(fixtures.restaurantA._id);
      const hostRes = await join(table, '9824100020', 'BadReason3');
      const sessionId = hostRes.body.session.id;

      const res = await request(app)
        .post(`/api/sessions/staff/${sessionId}/close`)
        .set('Authorization', `Bearer ${fixtures.ownerAToken}`)
        .send({ reason: 123 });

      expect(res.status).toBe(400);
      expect(res.body.code).toBe('INVALID_INPUT');

      await TableSession.updateOne({ _id: sessionId }, { $set: { status: 'closed', 'participants.$[].phone': null } });
    });

    test('invalid ObjectId sessionId ("not-an-id") answers 404 NOT_FOUND', async () => {
      const res = await request(app)
        .post('/api/sessions/staff/not-an-id/close')
        .set('Authorization', `Bearer ${fixtures.ownerAToken}`)
        .send({ reason: 'reset' });

      expect(res.status).toBe(404);
      expect(res.body.code).toBe('NOT_FOUND');
    });

    test('unknown session answers 404 NOT_FOUND', async () => {
      const nonExistent = new mongoose.Types.ObjectId();
      const res = await request(app)
        .post(`/api/sessions/staff/${nonExistent}/close`)
        .set('Authorization', `Bearer ${fixtures.ownerAToken}`)
        .send({ reason: 'reset' });

      expect(res.status).toBe(404);
      expect(res.body.code).toBe('NOT_FOUND');
    });

    test('another restaurant\'s session answers 404 NOT_FOUND', async () => {
      const tableB = await makeTable(fixtures.restaurantB._id);
      const joinB = await join(tableB, '9824100021', 'UserRestB');
      const sessionId = joinB.body.session.id;

      const res = await request(app)
        .post(`/api/sessions/staff/${sessionId}/close`)
        .set('Authorization', `Bearer ${fixtures.ownerAToken}`)
        .send({ reason: 'reset' });

      expect(res.status).toBe(404);
      expect(res.body.code).toBe('NOT_FOUND');

      await TableSession.updateOne({ _id: sessionId }, { $set: { status: 'closed', 'participants.$[].phone': null } });
    });

    test('already closed session answers 404 NOT_FOUND', async () => {
      const table = await makeTable(fixtures.restaurantA._id);
      const joinRes = await join(table, '9824100022', 'ClosedSession');
      const sessionId = joinRes.body.session.id;

      await closeSession(sessionId, 'reset');

      const res = await request(app)
        .post(`/api/sessions/staff/${sessionId}/close`)
        .set('Authorization', `Bearer ${fixtures.ownerAToken}`)
        .send({ reason: 'reset' });

      expect(res.status).toBe(404);
      expect(res.body.code).toBe('NOT_FOUND');
    });

    test('closing twice: second call answers 404 NOT_FOUND', async () => {
      const table = await makeTable(fixtures.restaurantA._id);
      const joinRes = await join(table, '9824100023', 'CloseTwice');
      const sessionId = joinRes.body.session.id;

      const res1 = await request(app)
        .post(`/api/sessions/staff/${sessionId}/close`)
        .set('Authorization', `Bearer ${fixtures.ownerAToken}`)
        .send({ reason: 'reset' });
      expect(res1.status).toBe(200);

      const res2 = await request(app)
        .post(`/api/sessions/staff/${sessionId}/close`)
        .set('Authorization', `Bearer ${fixtures.ownerAToken}`)
        .send({ reason: 'reset' });
      expect(res2.status).toBe(404);
    });

    test('guest token answers 401', async () => {
      const guestToken = generateGuestToken({
        sessionId: new mongoose.Types.ObjectId().toString(),
        participantId: 'p1',
      });
      const res = await request(app)
        .post(`/api/sessions/staff/${new mongoose.Types.ObjectId()}/close`)
        .set('Authorization', `Bearer ${guestToken}`)
        .send({ reason: 'reset' });
      expect(res.status).toBe(401);
    });

    test('session closes concurrently between check and write: answers 404, never 200', async () => {
      const table = await makeTable(fixtures.restaurantA._id);
      const joinRes = await join(table, '9824100024', 'RaceClose');
      const sessionId = joinRes.body.session.id;

      const origUpdateOne = TableSession.updateOne.bind(TableSession);
      const updateSpy = jest.spyOn(TableSession, 'updateOne').mockImplementation((filter, doc, options) => {
        if (doc && doc.$set && doc.$set.status === 'closed') {
          return Promise.resolve({ matchedCount: 0, modifiedCount: 0 });
        }
        return origUpdateOne(filter, doc, options);
      });

      try {
        const res = await request(app)
          .post(`/api/sessions/staff/${sessionId}/close`)
          .set('Authorization', `Bearer ${fixtures.ownerAToken}`)
          .send({ reason: 'reset' });

        expect(res.status).toBe(404);
        expect(res.body.code).toBe('NOT_FOUND');
      } finally {
        updateSpy.mockRestore();
        await TableSession.updateOne({ _id: sessionId }, { $set: { status: 'closed', 'participants.$[].phone': null } });
      }
    });
  });

  describe('STAFF APPROVE (POST /api/sessions/staff/:sessionId/participants/:participantId/approve)', () => {
    test('approves a pending guest (200 with staff view, status "approved" in database) while host never acts', async () => {
      const table = await makeTable(fixtures.restaurantA._id);
      const hostRes = await join(table, '9824100025', 'HostSleeps');
      const pendingRes = await join(table, '9824100026', 'PendingGuest');
      const sessionId = hostRes.body.session.id;
      const participantId = pendingRes.body.participant.id;

      const res = await request(app)
        .post(`/api/sessions/staff/${sessionId}/participants/${participantId}/approve`)
        .set('Authorization', `Bearer ${fixtures.ownerAToken}`);

      expect(res.status).toBe(200);
      expect(res.body.id).toBe(sessionId);
      expect(res.body.tableNumber).toBe(table.number);
      expect(res.body.participantCount).toBe(2);
      expect(res.body.pendingCount).toBe(0);

      const approvedParticipant = res.body.participants.find((p) => p.id === participantId);
      expect(approvedParticipant.status).toBe('approved');
      expect(approvedParticipant.role).toBe('guest');

      // Database verification
      const session = await TableSession.findById(sessionId);
      const stored = session.participants.find((p) => p.id === participantId);
      expect(stored.status).toBe('approved');

      await TableSession.updateOne({ _id: sessionId }, { $set: { status: 'closed', 'participants.$[].phone': null } });
    });

    test('approved response has exact same shape as one /staff/active item', async () => {
      const table = await makeTable(fixtures.restaurantA._id);
      const hostRes = await join(table, '9824100027', 'HostShape');
      const pendingRes = await join(table, '9824100028', 'GuestShape');
      const sessionId = hostRes.body.session.id;
      const participantId = pendingRes.body.participant.id;

      const res = await request(app)
        .post(`/api/sessions/staff/${sessionId}/participants/${participantId}/approve`)
        .set('Authorization', `Bearer ${fixtures.ownerAToken}`);

      expect(res.status).toBe(200);
      const expectedKeys = [
        'createdAt',
        'host',
        'id',
        'idleMinutes',
        'lastActivityAt',
        'participantCount',
        'participants',
        'pendingCount',
        'tableNumber',
      ].sort();

      expect(Object.keys(res.body).sort()).toEqual(expectedKeys);

      await TableSession.updateOne({ _id: sessionId }, { $set: { status: 'closed', 'participants.$[].phone': null } });
    });

    test('kitchen user can approve pending guest', async () => {
      const table = await makeTable(fixtures.restaurantA._id);
      const hostRes = await join(table, '9824100029', 'HostKitchen');
      const pendingRes = await join(table, '9824100030', 'GuestKitchen');
      const sessionId = hostRes.body.session.id;
      const participantId = pendingRes.body.participant.id;

      const res = await request(app)
        .post(`/api/sessions/staff/${sessionId}/participants/${participantId}/approve`)
        .set('Authorization', `Bearer ${fixtures.kitchenAToken}`);

      expect(res.status).toBe(200);
      const approved = res.body.participants.find((p) => p.id === participantId);
      expect(approved.status).toBe('approved');

      await TableSession.updateOne({ _id: sessionId }, { $set: { status: 'closed', 'participants.$[].phone': null } });
    });

    test('approving unknown participantId answers 404 NOT_FOUND', async () => {
      const table = await makeTable(fixtures.restaurantA._id);
      const hostRes = await join(table, '9824100031', 'HostUnknown');
      const sessionId = hostRes.body.session.id;

      const res = await request(app)
        .post(`/api/sessions/staff/${sessionId}/participants/non-existent-part/approve`)
        .set('Authorization', `Bearer ${fixtures.ownerAToken}`);

      expect(res.status).toBe(404);
      expect(res.body.code).toBe('NOT_FOUND');

      await TableSession.updateOne({ _id: sessionId }, { $set: { status: 'closed', 'participants.$[].phone': null } });
    });

    test('approving already approved participant answers 404 NOT_FOUND', async () => {
      const table = await makeTable(fixtures.restaurantA._id);
      const hostRes = await join(table, '9824100032', 'HostAlready');
      const sessionId = hostRes.body.session.id;
      const hostId = hostRes.body.participant.id;

      // Host is already approved
      const res = await request(app)
        .post(`/api/sessions/staff/${sessionId}/participants/${hostId}/approve`)
        .set('Authorization', `Bearer ${fixtures.ownerAToken}`);

      expect(res.status).toBe(404);
      expect(res.body.code).toBe('NOT_FOUND');

      await TableSession.updateOne({ _id: sessionId }, { $set: { status: 'closed', 'participants.$[].phone': null } });
    });

    test('approving expired pending request answers 404 NOT_FOUND', async () => {
      const table = await makeTable(fixtures.restaurantA._id);
      const hostRes = await join(table, '9824100033', 'HostExpired');
      const pendingRes = await join(table, '9824100034', 'GuestExpired');
      const sessionId = hostRes.body.session.id;
      const participantId = pendingRes.body.participant.id;

      const fifteenMinsAgo = new Date(Date.now() - 15 * 60 * 1000);
      await TableSession.updateOne(
        { _id: sessionId, 'participants.id': participantId },
        { $set: { 'participants.$.joinedAt': fifteenMinsAgo } }
      );

      const res = await request(app)
        .post(`/api/sessions/staff/${sessionId}/participants/${participantId}/approve`)
        .set('Authorization', `Bearer ${fixtures.ownerAToken}`);

      expect(res.status).toBe(404);
      expect(res.body.code).toBe('NOT_FOUND');

      await TableSession.updateOne({ _id: sessionId }, { $set: { status: 'closed', 'participants.$[].phone': null } });
    });

    test('approving participant with "weird" status answers 404 NOT_FOUND', async () => {
      const table = await makeTable(fixtures.restaurantA._id);
      const hostRes = await join(table, '9824100035', 'HostWeird');
      const guestRes = await join(table, '9824100036', 'GuestWeird');
      const sessionId = hostRes.body.session.id;
      const participantId = guestRes.body.participant.id;

      await TableSession.collection.updateOne(
        { _id: new mongoose.Types.ObjectId(sessionId), 'participants.id': participantId },
        { $set: { 'participants.$.status': 'weird' } }
      );

      const res = await request(app)
        .post(`/api/sessions/staff/${sessionId}/participants/${participantId}/approve`)
        .set('Authorization', `Bearer ${fixtures.ownerAToken}`);

      expect(res.status).toBe(404);
      expect(res.body.code).toBe('NOT_FOUND');

      await TableSession.updateOne({ _id: sessionId }, { $set: { status: 'closed', 'participants.$[].phone': null } });
    });

    test('approving on another restaurant\'s session answers 404 NOT_FOUND', async () => {
      const tableB = await makeTable(fixtures.restaurantB._id);
      const hostB = await join(tableB, '9824100037', 'HostB');
      const pendingB = await join(tableB, '9824100038', 'GuestB');
      const sessionId = hostB.body.session.id;
      const participantId = pendingB.body.participant.id;

      const res = await request(app)
        .post(`/api/sessions/staff/${sessionId}/participants/${participantId}/approve`)
        .set('Authorization', `Bearer ${fixtures.ownerAToken}`);

      expect(res.status).toBe(404);
      expect(res.body.code).toBe('NOT_FOUND');

      await TableSession.updateOne({ _id: sessionId }, { $set: { status: 'closed', 'participants.$[].phone': null } });
    });

    test('approving on a closed session answers 404 NOT_FOUND', async () => {
      const table = await makeTable(fixtures.restaurantA._id);
      const hostRes = await join(table, '9824100039', 'HostClosed');
      const pendingRes = await join(table, '9824100040', 'GuestClosed');
      const sessionId = hostRes.body.session.id;
      const participantId = pendingRes.body.participant.id;

      await closeSession(sessionId, 'reset');

      const res = await request(app)
        .post(`/api/sessions/staff/${sessionId}/participants/${participantId}/approve`)
        .set('Authorization', `Bearer ${fixtures.ownerAToken}`);

      expect(res.status).toBe(404);
      expect(res.body.code).toBe('NOT_FOUND');
    });

    test('invalid ObjectId sessionId answers 404 NOT_FOUND', async () => {
      const res = await request(app)
        .post('/api/sessions/staff/invalid-id/participants/part-1/approve')
        .set('Authorization', `Bearer ${fixtures.ownerAToken}`);

      expect(res.status).toBe(404);
      expect(res.body.code).toBe('NOT_FOUND');
    });

    test('database write matching nothing (spy) answers 404 NOT_FOUND', async () => {
      const table = await makeTable(fixtures.restaurantA._id);
      const hostRes = await join(table, '9824100041', 'HostSpyApprove');
      const guestRes = await join(table, '9824100042', 'GuestSpyApprove');
      const sessionId = hostRes.body.session.id;
      const participantId = guestRes.body.participant.id;

      const origUpdateOne = TableSession.updateOne.bind(TableSession);
      const updateSpy = jest.spyOn(TableSession, 'updateOne').mockImplementation((filter, doc, options) => {
        if (doc && doc.$set && 'participants.$[p].status' in doc.$set) {
          return Promise.resolve({ matchedCount: 0, modifiedCount: 0 });
        }
        return origUpdateOne(filter, doc, options);
      });

      try {
        const res = await request(app)
          .post(`/api/sessions/staff/${sessionId}/participants/${participantId}/approve`)
          .set('Authorization', `Bearer ${fixtures.ownerAToken}`);

        expect(res.status).toBe(404);
        expect(res.body.code).toBe('NOT_FOUND');
      } finally {
        updateSpy.mockRestore();
        await TableSession.updateOne({ _id: sessionId }, { $set: { status: 'closed', 'participants.$[].phone': null } });
      }
    });

    test('guest token on staff approve answers 401', async () => {
      const guestToken = generateGuestToken({
        sessionId: new mongoose.Types.ObjectId().toString(),
        participantId: 'p1',
      });
      const res = await request(app)
        .post(`/api/sessions/staff/${new mongoose.Types.ObjectId()}/participants/p1/approve`)
        .set('Authorization', `Bearer ${guestToken}`);
      expect(res.status).toBe(401);
    });
  });

  describe('STAFF REMOVE (POST /api/sessions/staff/:sessionId/participants/:participantId/remove)', () => {
    test('removes a pending guest (200 { message: "Removed" })', async () => {
      const table = await makeTable(fixtures.restaurantA._id);
      const hostRes = await join(table, '9824100043', 'HostRemPending');
      const guestRes = await join(table, '9824100044', 'PendingRem');
      const sessionId = hostRes.body.session.id;
      const participantId = guestRes.body.participant.id;

      const res = await request(app)
        .post(`/api/sessions/staff/${sessionId}/participants/${participantId}/remove`)
        .set('Authorization', `Bearer ${fixtures.ownerAToken}`);

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ message: 'Removed' });

      const session = await TableSession.findById(sessionId);
      expect(session.participants).toHaveLength(1);
      expect(session.participants[0].id).toBe(hostRes.body.participant.id);

      await TableSession.updateOne({ _id: sessionId }, { $set: { status: 'closed', 'participants.$[].phone': null } });
    });

    test('removes an approved guest: token answers PARTICIPANT_REMOVED, phone can immediately join different table', async () => {
      const table = await makeTable(fixtures.restaurantA._id);
      const hostRes = await join(table, '9824100045', 'HostRemApproved');
      const guestRes = await join(table, '9824100046', 'GuestRemApproved');
      const sessionId = hostRes.body.session.id;
      const guestId = guestRes.body.participant.id;
      const guestToken = guestRes.body.token;

      // Approve guest first
      await request(app)
        .post(`/api/sessions/staff/${sessionId}/participants/${guestId}/approve`)
        .set('Authorization', `Bearer ${fixtures.ownerAToken}`);

      // Now remove the approved guest
      const res = await request(app)
        .post(`/api/sessions/staff/${sessionId}/participants/${guestId}/remove`)
        .set('Authorization', `Bearer ${fixtures.ownerAToken}`);

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ message: 'Removed' });

      // Guest token answers 401 PARTICIPANT_REMOVED
      const meRes = await request(app)
        .get('/api/sessions/me')
        .set('Authorization', `Bearer ${guestToken}`);
      expect(meRes.status).toBe(401);
      expect(meRes.body.code).toBe('PARTICIPANT_REMOVED');

      // Phone is freed and can immediately join another table
      const otherTable = await makeTable(fixtures.restaurantA._id);
      const otherJoin = await join(otherTable, '9824100046', 'GuestRejoined');
      expect(otherJoin.status).toBe(201);

      await TableSession.updateMany(
        { status: 'open' },
        { $set: { status: 'closed', 'participants.$[].phone': null } }
      );
    });

    test('removing the host promotes the longest-seated approved guest (role "host" and hostId updated in database)', async () => {
      const table = await makeTable(fixtures.restaurantA._id);
      const hostRes = await join(table, '9824100047', 'HostOriginal');
      const guest1Res = await join(table, '9824100048', 'Guest1');
      const guest2Res = await join(table, '9824100049', 'Guest2');
      const sessionId = hostRes.body.session.id;

      // Staff approves both guests
      await request(app)
        .post(`/api/sessions/staff/${sessionId}/participants/${guest1Res.body.participant.id}/approve`)
        .set('Authorization', `Bearer ${fixtures.ownerAToken}`);
      await request(app)
        .post(`/api/sessions/staff/${sessionId}/participants/${guest2Res.body.participant.id}/approve`)
        .set('Authorization', `Bearer ${fixtures.ownerAToken}`);

      // Set guest1 joinedAt 5 minutes ago and guest2 2 minutes ago to guarantee guest1 is longest-seated
      await TableSession.updateOne(
        { _id: sessionId, 'participants.id': guest1Res.body.participant.id },
        { $set: { 'participants.$.joinedAt': new Date(Date.now() - 5 * 60 * 1000) } }
      );
      await TableSession.updateOne(
        { _id: sessionId, 'participants.id': guest2Res.body.participant.id },
        { $set: { 'participants.$.joinedAt': new Date(Date.now() - 2 * 60 * 1000) } }
      );

      // Remove the original host
      const res = await request(app)
        .post(`/api/sessions/staff/${sessionId}/participants/${hostRes.body.participant.id}/remove`)
        .set('Authorization', `Bearer ${fixtures.ownerAToken}`);

      expect(res.status).toBe(200);

      const session = await TableSession.findById(sessionId);
      expect(session.hostId).toBe(guest1Res.body.participant.id);
      const promoted = session.participants.find((p) => p.id === guest1Res.body.participant.id);
      expect(promoted.role).toBe('host');

      const other = session.participants.find((p) => p.id === guest2Res.body.participant.id);
      expect(other.role).toBe('guest');

      await TableSession.updateOne({ _id: sessionId }, { $set: { status: 'closed', 'participants.$[].phone': null } });
    });

    test('removing the host when only pending guests are left closes the session with reason "reset" and nulls phones', async () => {
      const table = await makeTable(fixtures.restaurantA._id);
      const hostRes = await join(table, '9824100050', 'HostOnlyPending');
      await join(table, '9824100051', 'PendingOnly');
      const sessionId = hostRes.body.session.id;

      const res = await request(app)
        .post(`/api/sessions/staff/${sessionId}/participants/${hostRes.body.participant.id}/remove`)
        .set('Authorization', `Bearer ${fixtures.ownerAToken}`);

      expect(res.status).toBe(200);

      const session = await TableSession.findById(sessionId);
      expect(session.status).toBe('closed');
      expect(session.closedReason).toBe('reset');
      for (const p of session.participants) {
        expect(p.phone).toBeNull();
      }
    });

    test('removing the last participant closes the session with reason "reset" and nulls phones', async () => {
      const table = await makeTable(fixtures.restaurantA._id);
      const hostRes = await join(table, '9824100052', 'HostSoleParticipant');
      const sessionId = hostRes.body.session.id;

      const res = await request(app)
        .post(`/api/sessions/staff/${sessionId}/participants/${hostRes.body.participant.id}/remove`)
        .set('Authorization', `Bearer ${fixtures.ownerAToken}`);

      expect(res.status).toBe(200);

      const session = await TableSession.findById(sessionId);
      expect(session.status).toBe('closed');
      expect(session.closedReason).toBe('reset');
    });

    test('kitchen user can remove a participant', async () => {
      const table = await makeTable(fixtures.restaurantA._id);
      const hostRes = await join(table, '9824100053', 'HostKitchenRem');
      const guestRes = await join(table, '9824100054', 'GuestKitchenRem');
      const sessionId = hostRes.body.session.id;

      const res = await request(app)
        .post(`/api/sessions/staff/${sessionId}/participants/${guestRes.body.participant.id}/remove`)
        .set('Authorization', `Bearer ${fixtures.kitchenAToken}`);

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ message: 'Removed' });

      await TableSession.updateOne({ _id: sessionId }, { $set: { status: 'closed', 'participants.$[].phone': null } });
    });

    test('removing unknown participantId answers 404 NOT_FOUND', async () => {
      const table = await makeTable(fixtures.restaurantA._id);
      const hostRes = await join(table, '9824100055', 'HostUnknownRem');
      const sessionId = hostRes.body.session.id;

      const res = await request(app)
        .post(`/api/sessions/staff/${sessionId}/participants/part-unknown/remove`)
        .set('Authorization', `Bearer ${fixtures.ownerAToken}`);

      expect(res.status).toBe(404);
      expect(res.body.code).toBe('NOT_FOUND');

      await TableSession.updateOne({ _id: sessionId }, { $set: { status: 'closed', 'participants.$[].phone': null } });
    });

    test('removing on another restaurant\'s session answers 404 NOT_FOUND', async () => {
      const tableB = await makeTable(fixtures.restaurantB._id);
      const hostB = await join(tableB, '9824100056', 'HostBRem');
      const sessionId = hostB.body.session.id;

      const res = await request(app)
        .post(`/api/sessions/staff/${sessionId}/participants/${hostB.body.participant.id}/remove`)
        .set('Authorization', `Bearer ${fixtures.ownerAToken}`);

      expect(res.status).toBe(404);
      expect(res.body.code).toBe('NOT_FOUND');

      await TableSession.updateOne({ _id: sessionId }, { $set: { status: 'closed', 'participants.$[].phone': null } });
    });

    test('removing on a closed session answers 404 NOT_FOUND', async () => {
      const table = await makeTable(fixtures.restaurantA._id);
      const hostRes = await join(table, '9824100057', 'HostClosedRem');
      const sessionId = hostRes.body.session.id;

      await closeSession(sessionId, 'reset');

      const res = await request(app)
        .post(`/api/sessions/staff/${sessionId}/participants/${hostRes.body.participant.id}/remove`)
        .set('Authorization', `Bearer ${fixtures.ownerAToken}`);

      expect(res.status).toBe(404);
      expect(res.body.code).toBe('NOT_FOUND');
    });

    test('invalid ObjectId sessionId answers 404 NOT_FOUND', async () => {
      const res = await request(app)
        .post('/api/sessions/staff/not-an-id/participants/p1/remove')
        .set('Authorization', `Bearer ${fixtures.ownerAToken}`);

      expect(res.status).toBe(404);
      expect(res.body.code).toBe('NOT_FOUND');
    });

    test('database $pull matching nothing (spy) answers 404 NOT_FOUND', async () => {
      const table = await makeTable(fixtures.restaurantA._id);
      const hostRes = await join(table, '9824100058', 'HostSpyPull');
      const sessionId = hostRes.body.session.id;
      const participantId = hostRes.body.participant.id;

      const origUpdateOne = TableSession.updateOne.bind(TableSession);
      const updateSpy = jest.spyOn(TableSession, 'updateOne').mockImplementation((filter, doc, options) => {
        if (doc && doc.$pull) {
          return Promise.resolve({ matchedCount: 0, modifiedCount: 0 });
        }
        return origUpdateOne(filter, doc, options);
      });

      try {
        const res = await request(app)
          .post(`/api/sessions/staff/${sessionId}/participants/${participantId}/remove`)
          .set('Authorization', `Bearer ${fixtures.ownerAToken}`);

        expect(res.status).toBe(404);
        expect(res.body.code).toBe('NOT_FOUND');
      } finally {
        updateSpy.mockRestore();
        await TableSession.updateOne({ _id: sessionId }, { $set: { status: 'closed', 'participants.$[].phone': null } });
      }
    });

    test('guest token on staff remove answers 401', async () => {
      const guestToken = generateGuestToken({
        sessionId: new mongoose.Types.ObjectId().toString(),
        participantId: 'p1',
      });
      const res = await request(app)
        .post(`/api/sessions/staff/${new mongoose.Types.ObjectId()}/participants/p1/remove`)
        .set('Authorization', `Bearer ${guestToken}`);
      expect(res.status).toBe(401);
    });

    test('unauthenticated request on staff remove answers 401', async () => {
      const res = await request(app).post(`/api/sessions/staff/${new mongoose.Types.ObjectId()}/participants/p1/remove`);
      expect(res.status).toBe(401);
    });
  });

  describe('IDLE SWEEPER (closeIdleSessions & startIdleSweeper)', () => {
    test('closeIdleSessions closes open session idle >240m (241m closes, 239m stays open, closed session untouched)', async () => {
      const now = new Date();
      const table1 = await makeTable(fixtures.restaurantA._id);
      const table2 = await makeTable(fixtures.restaurantA._id);
      const table3 = await makeTable(fixtures.restaurantA._id);

      // Session 1: idle 241 minutes -> should close
      const res1 = await join(table1, '9824100059', 'Idle241');
      const session1Id = res1.body.session.id;
      await TableSession.updateOne(
        { _id: session1Id },
        { $set: { lastActivityAt: new Date(now.getTime() - 241 * 60 * 1000) } }
      );

      // Session 2: idle 239 minutes -> should stay open
      const res2 = await join(table2, '9824100060', 'Idle239');
      const session2Id = res2.body.session.id;
      await TableSession.updateOne(
        { _id: session2Id },
        { $set: { lastActivityAt: new Date(now.getTime() - 239 * 60 * 1000) } }
      );

      // Session 3: already closed 300 minutes ago -> should remain untouched
      const res3 = await join(table3, '9824100061', 'IdleClosed');
      const session3Id = res3.body.session.id;
      await closeSession(session3Id, 'reset');
      await TableSession.updateOne(
        { _id: session3Id },
        { $set: { lastActivityAt: new Date(now.getTime() - 300 * 60 * 1000) } }
      );

      const closedCount = await closeIdleSessions(now);
      expect(closedCount).toBe(1);

      // Verify session 1 closed with reason "timeout" and phones null
      const s1 = await TableSession.findById(session1Id);
      expect(s1.status).toBe('closed');
      expect(s1.closedReason).toBe('timeout');
      expect(s1.participants[0].phone).toBeNull();

      // Verify session 2 still open
      const s2 = await TableSession.findById(session2Id);
      expect(s2.status).toBe('open');

      // Verify session 3 still closed with reason "reset"
      const s3 = await TableSession.findById(session3Id);
      expect(s3.status).toBe('closed');
      expect(s3.closedReason).toBe('reset');

      // Second call returns 0
      const secondCall = await closeIdleSessions(now);
      expect(secondCall).toBe(0);

      // After freeing, a new guest can join the freed table 1
      const rejoinRes = await join(table1, '9824100062', 'FreedGuest');
      expect(rejoinRes.status).toBe(201);
      expect(rejoinRes.body.participant.role).toBe('host');

      await TableSession.updateMany(
        { status: 'open' },
        { $set: { status: 'closed', 'participants.$[].phone': null } }
      );
    });

    test('startIdleSweeper calls run repeatedly with short interval, keeps going after error, returns unref timer', async () => {
      let callCount = 0;
      let threwError = false;

      const mockRun = jest.fn().mockImplementation(() => {
        callCount += 1;
        if (callCount === 1) {
          threwError = true;
          throw new Error('Temporary database glitch');
        }
        return Promise.resolve(0);
      });

      const timer = startIdleSweeper({ intervalMs: 30, run: mockRun });

      // Assert timer is unref'd
      expect(timer.hasRef()).toBe(false);

      // Wait 120ms to allow at least 2 interval ticks
      await new Promise((resolve) => setTimeout(resolve, 120));

      clearInterval(timer);

      expect(callCount).toBeGreaterThanOrEqual(2);
      expect(threwError).toBe(true);
    });

    test('server.js starts sweeper only in startServer: contains "startIdleSweeper(" exactly once after "server.listen("', () => {
      const serverPath = path.resolve(process.cwd(), 'server.js');
      const content = fs.readFileSync(serverPath, 'utf8');

      // startIdleSweeper( appears exactly once in file
      const matches = content.match(/startIdleSweeper\(/g) || [];
      expect(matches).toHaveLength(1);

      // Appears after server.listen(
      const listenIndex = content.indexOf('server.listen(');
      const sweeperIndex = content.indexOf('startIdleSweeper(');
      expect(listenIndex).toBeGreaterThan(0);
      expect(sweeperIndex).toBeGreaterThan(listenIndex);

      // startServer itself only runs when NODE_ENV is not 'test'
      expect(content).toContain("process.env.NODE_ENV !== 'test'");
    });
  });
});
