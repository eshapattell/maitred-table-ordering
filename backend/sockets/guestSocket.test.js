// guestSocket.test.js: Integration tests for guest live connection (Socket.io)
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';
import request from 'supertest';
import { io as ioc } from 'socket.io-client';
import { jest } from '@jest/globals';
import { app, server, io } from '../server.js';
import Table from '../models/Table.js';
import TableSession from '../models/TableSession.js';
import MenuItem from '../models/MenuItem.js';
import { roomFor } from '../utils/liveRules.js';
import { generateGuestToken } from '../utils/generateToken.js';
import { connectTestDb, clearTestDb, disconnectTestDb } from '../config/testDb.js';
import { createFixtures } from '../config/testFixtures.js';

describe('Guest Live Connection (Socket.io)', () => {
  let fixtures;
  let port;
  let clientSockets = [];

  beforeAll(async () => {
    await connectTestDb();
    await clearTestDb();
    fixtures = await createFixtures();
    await TableSession.init();

    await new Promise((resolve) => {
      server.listen(0, () => {
        port = server.address().port;
        resolve();
      });
    });
  });

  afterAll(async () => {
    for (const s of clientSockets) {
      try {
        s.removeAllListeners();
        s.disconnect();
        s.close();
      } catch {}
    }
    clientSockets = [];

    try {
      const sockets = await io.fetchSockets();
      for (const s of sockets) {
        s.disconnect(true);
      }
    } catch {}

    await new Promise((resolve) => server.close(resolve));
    await disconnectTestDb();
  });

  afterEach(async () => {
    for (const s of clientSockets) {
      try {
        s.removeAllListeners();
        s.disconnect();
        s.close();
      } catch {}
    }
    clientSockets = [];

    try {
      const sockets = await io.fetchSockets();
      for (const s of sockets) {
        s.disconnect(true);
      }
    } catch {}
  });

  let tableCounter = 100;
  let phoneCounter = 9826000000;

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
    return { ...res.body, status: res.status, phone };
  };

  const setupHost = async (table, allergies = []) => {
    const joined = await joinGuest(table, 'Host');
    expect(joined.status).toBe(201);
    const { token, participant, session } = joined;

    const allergyRes = await request(app)
      .post('/api/sessions/allergies')
      .set('Authorization', `Bearer ${token}`)
      .send({ allergies });
    expect(allergyRes.status).toBe(200);

    return {
      token,
      participantId: participant.id,
      sessionId: session.id,
    };
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
      spiceLevel: 1,
      ...overrides,
    });
  };

  const connectClient = (token, options = {}) => {
    const socket = ioc(`http://127.0.0.1:${port}`, {
      transports: ['websocket'],
      autoConnect: true,
      reconnection: false,
      forceNew: true,
      auth: token !== undefined ? { token } : undefined,
      ...options,
    });
    clientSockets.push(socket);
    return socket;
  };

  const waitForConnect = (socket, timeoutMs = 10000) =>
    new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Connection timed out')), timeoutMs);
      socket.once('connect', () => {
        clearTimeout(timer);
        resolve(socket);
      });
      socket.once('connect_error', (err) => {
        clearTimeout(timer);
        reject(err);
      });
    });

  const waitForError = (socket, timeoutMs = 10000) =>
    new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Expected connect_error but timed out')), timeoutMs);
      socket.once('connect', () => {
        clearTimeout(timer);
        reject(new Error('Expected connect_error but connected successfully'));
      });
      socket.once('connect_error', (err) => {
        clearTimeout(timer);
        resolve(err);
      });
    });

  test('1. connection without auth token is rejected with "unauthorised"', async () => {
    const client = connectClient(undefined);
    const err = await waitForError(client);
    expect(err.message).toBe('unauthorised');
    expect(client.connected).toBe(false);
  });

  test('2. connection with invalid token (tampered signature) is rejected with "unauthorised"', async () => {
    const table = await makeTable(fixtures.restaurantA._id);
    const host = await setupHost(table);
    const client = connectClient(`${host.token}badsignature`);
    const err = await waitForError(client);
    expect(err.message).toBe('unauthorised');
    expect(client.connected).toBe(false);
  });

  test('3. connection with expired token is rejected with "unauthorised"', async () => {
    const table = await makeTable(fixtures.restaurantA._id);
    const host = await setupHost(table);
    const expiredToken = jwt.sign(
      { sid: host.sessionId },
      process.env.JWT_SECRET,
      {
        algorithm: 'HS256',
        audience: 'maitred-guest',
        subject: host.participantId,
        expiresIn: '0s',
      }
    );
    await new Promise((r) => setTimeout(r, 50));
    const client = connectClient(expiredToken);
    const err = await waitForError(client);
    expect(err.message).toBe('unauthorised');
    expect(client.connected).toBe(false);
  });

  test('4. connection with token whose sid is not a valid ObjectId is rejected', async () => {
    const badSidToken = jwt.sign(
      { sid: 'not-a-valid-object-id' },
      process.env.JWT_SECRET,
      {
        algorithm: 'HS256',
        audience: 'maitred-guest',
        subject: 'participant-1',
        expiresIn: '1h',
      }
    );
    const client = connectClient(badSidToken);
    const err = await waitForError(client);
    expect(err.message).toBe('unauthorised');
    expect(client.connected).toBe(false);
  });

  test('5. connection with token for non-existent session is rejected', async () => {
    const nonExistentSid = new mongoose.Types.ObjectId().toString();
    const token = generateGuestToken({
      sessionId: nonExistentSid,
      participantId: 'p-1',
    });
    const client = connectClient(token);
    const err = await waitForError(client);
    expect(err.message).toBe('unauthorised');
    expect(client.connected).toBe(false);
  });

  test('6. connection with token for closed session is rejected (socketAccess check)', async () => {
    const table = await makeTable(fixtures.restaurantA._id);
    const host = await setupHost(table);
    await TableSession.findByIdAndUpdate(host.sessionId, { status: 'closed' });

    const client = connectClient(host.token);
    const err = await waitForError(client);
    expect(err.message).toBe('unauthorised');
    expect(client.connected).toBe(false);
  });

  test('7. connection with token for pending (expired) guest is rejected', async () => {
    const table = await makeTable(fixtures.restaurantA._id);
    const host = await setupHost(table);
    const joinRes = await joinGuest(table, 'PendingGuest');
    expect(joinRes.status).toBe(201);
    const pendingToken = joinRes.token;
    const pendingPid = joinRes.participant.id;

    const expiredTime = new Date(Date.now() - 15 * 60 * 1000);
    await TableSession.updateOne(
      { _id: host.sessionId, 'participants.id': pendingPid },
      { $set: { 'participants.$.joinedAt': expiredTime } }
    );

    const client = connectClient(pendingToken);
    const err = await waitForError(client);
    expect(err.message).toBe('unauthorised');
    expect(client.connected).toBe(false);
  });

  test('8. connection with token for removed guest is rejected', async () => {
    const table = await makeTable(fixtures.restaurantA._id);
    const host = await setupHost(table);
    const joinRes = await joinGuest(table, 'RemovedGuest');
    expect(joinRes.status).toBe(201);
    const guest2Token = joinRes.token;
    const guest2Pid = joinRes.participant.id;

    await TableSession.updateOne(
      { _id: host.sessionId, 'participants.id': guest2Pid },
      { $set: { 'participants.$.status': 'removed' } }
    );

    const client = connectClient(guest2Token);
    const err = await waitForError(client);
    expect(err.message).toBe('unauthorised');
    expect(client.connected).toBe(false);
  });

  test('9. connection with valid guest token succeeds, socket connects, socket is in roomFor(sid)', async () => {
    const table = await makeTable(fixtures.restaurantA._id);
    const host = await setupHost(table);

    const client = connectClient(host.token);
    await waitForConnect(client);
    expect(client.connected).toBe(true);

    const roomName = roomFor(host.sessionId);
    const socketsInRoom = await io.in(roomName).fetchSockets();
    expect(socketsInRoom).toHaveLength(1);
    expect(socketsInRoom[0].data.sessionId).toBe(String(host.sessionId));
    expect(socketsInRoom[0].data.participantId).toBe(host.participantId);
  });

  test('10. when cart changes via POST /api/sessions/cart/items, the connected guest receives the "cart:changed" event with { version } and NO other data', async () => {
    const table = await makeTable(fixtures.restaurantA._id);
    const host = await setupHost(table);
    const dish = await makeDish(fixtures.restaurantA._id);

    const client = connectClient(host.token);
    await waitForConnect(client);

    const eventPromise = new Promise((resolve) => {
      client.once('cart:changed', (data) => resolve(data));
    });

    const res = await request(app)
      .post('/api/sessions/cart/items')
      .set('Authorization', `Bearer ${host.token}`)
      .send({ menuItemId: String(dish._id), quantity: 1 });
    expect(res.status).toBe(200);

    const eventData = await eventPromise;
    expect(eventData).toEqual({ version: 1 });
    expect(Object.keys(eventData)).toEqual(['version']);
  });

  test('11. when another guest at the SAME table adds an item, both connected guests receive the event with the SAME version number', async () => {
    const table = await makeTable(fixtures.restaurantA._id);
    const host = await setupHost(table);

    const joinRes = await joinGuest(table, 'GuestTwo');
    expect(joinRes.status).toBe(201);
    const guest2Token = joinRes.token;
    const guest2Pid = joinRes.participant.id;

    const approveRes = await request(app)
      .post(`/api/sessions/participants/${guest2Pid}/approve`)
      .set('Authorization', `Bearer ${host.token}`);
    expect(approveRes.status).toBe(200);

    const allergyRes = await request(app)
      .post('/api/sessions/allergies')
      .set('Authorization', `Bearer ${guest2Token}`)
      .send({ allergies: [] });
    expect(allergyRes.status).toBe(200);

    const dish = await makeDish(fixtures.restaurantA._id);

    const clientHost = connectClient(host.token);
    const clientGuest2 = connectClient(guest2Token);
    await Promise.all([waitForConnect(clientHost), waitForConnect(clientGuest2)]);

    const hostPromise = new Promise((resolve) => clientHost.once('cart:changed', (data) => resolve(data)));
    const guest2Promise = new Promise((resolve) => clientGuest2.once('cart:changed', (data) => resolve(data)));

    const addRes = await request(app)
      .post('/api/sessions/cart/items')
      .set('Authorization', `Bearer ${guest2Token}`)
      .send({ menuItemId: String(dish._id), quantity: 1 });
    expect(addRes.status).toBe(200);

    const [hostEvent, guest2Event] = await Promise.all([hostPromise, guest2Promise]);
    expect(hostEvent).toEqual({ version: 1 });
    expect(guest2Event).toEqual({ version: 1 });
    expect(hostEvent.version).toBe(guest2Event.version);
  }, 180000);

  test('12. a guest at table B DOES NOT receive the event when table A changes (room isolation)', async () => {
    const tableA = await makeTable(fixtures.restaurantA._id);
    const hostA = await setupHost(tableA);

    const tableB = await makeTable(fixtures.restaurantA._id);
    const hostB = await setupHost(tableB);

    const dishA = await makeDish(fixtures.restaurantA._id);

    const clientA = connectClient(hostA.token);
    const clientB = connectClient(hostB.token);
    await Promise.all([waitForConnect(clientA), waitForConnect(clientB)]);

    const clientBListener = jest.fn();
    clientB.on('cart:changed', clientBListener);

    const clientAPromise = new Promise((resolve) => clientA.once('cart:changed', (data) => resolve(data)));

    const res = await request(app)
      .post('/api/sessions/cart/items')
      .set('Authorization', `Bearer ${hostA.token}`)
      .send({ menuItemId: String(dishA._id), quantity: 1 });
    expect(res.status).toBe(200);

    const eventA = await clientAPromise;
    expect(eventA).toEqual({ version: 1 });

    await new Promise((r) => setTimeout(r, 200));
    expect(clientBListener).not.toHaveBeenCalled();
  }, 180000);

  test('13. when session status changes (e.g. participant approved), connected guests receive "session:changed"', async () => {
    const table = await makeTable(fixtures.restaurantA._id);
    const host = await setupHost(table);

    const client = connectClient(host.token);
    await waitForConnect(client);

    const sessionChangedPromise = new Promise((resolve) => {
      client.once('session:changed', () => resolve(true));
    });

    const joinRes = await joinGuest(table, 'NewPendingGuest');
    expect(joinRes.status).toBe(201);

    const received = await sessionChangedPromise;
    expect(received).toBe(true);
  });

  test("14. server logs '[maitred] live connection refused: server misconfigured' when JWT_SECRET is invalid, and client gets \"unauthorised\" (never a 500 or crash)", async () => {
    const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    const origSecret = process.env.JWT_SECRET;

    try {
      const table = await makeTable(fixtures.restaurantA._id);
      const host = await setupHost(table);

      process.env.JWT_SECRET = 'short';

      const client = connectClient(host.token);
      const err = await waitForError(client);
      expect(err.message).toBe('unauthorised');
      expect(client.connected).toBe(false);

      expect(consoleErrorSpy).toHaveBeenCalledWith('[maitred] live connection refused: server misconfigured');
    } finally {
      process.env.JWT_SECRET = origSecret;
      consoleErrorSpy.mockRestore();
    }
  });

  test('15. fresh pending guest can connect to listen for updates', async () => {
    const table = await makeTable(fixtures.restaurantA._id);
    const host = await setupHost(table);

    const joinRes = await joinGuest(table, 'FreshPendingGuest');
    expect(joinRes.status).toBe(201);
    const pendingToken = joinRes.token;

    const client = connectClient(pendingToken);
    await waitForConnect(client);
    expect(client.connected).toBe(true);
  });

  test('16. server ignores any message emitted from client', async () => {
    const table = await makeTable(fixtures.restaurantA._id);
    const host = await setupHost(table);

    const client = connectClient(host.token);
    await waitForConnect(client);

    expect(() => {
      client.emit('cart:change', { fake: 'data' });
      client.emit('message', 'hello');
    }).not.toThrow();
    await new Promise((r) => setTimeout(r, 100));
    expect(client.connected).toBe(true);
  });
});
