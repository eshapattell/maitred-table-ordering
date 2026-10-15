// kitchenSocket.test.js: Integration tests for staff kitchen live connection (Socket.io)
import mongoose from 'mongoose';
import jwt from 'jsonwebtoken';
import { io as ioc } from 'socket.io-client';
import { jest } from '@jest/globals';
import { app, server, io } from '../server.js';
import User from '../models/User.js';
import Restaurant from '../models/Restaurant.js';
import { realtime } from '../utils/realtime.js';
import { generateToken, generateGuestToken } from '../utils/generateToken.js';
import { KITCHEN_NAMESPACE, ORDER_EVENTS, kitchenRoomFor } from '../utils/orderRules.js';
import { connectTestDb, clearTestDb, disconnectTestDb } from '../config/testDb.js';
import { createFixtures } from '../config/testFixtures.js';

describe('Staff Kitchen Live Connection (Socket.io)', () => {
  let fixtures;
  let port;
  let clientSockets = [];

  beforeAll(async () => {
    await connectTestDb();
    await clearTestDb();
    fixtures = await createFixtures();

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
      const kitchenSockets = await io.of(KITCHEN_NAMESPACE).fetchSockets();
      for (const s of kitchenSockets) {
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
      const kitchenSockets = await io.of(KITCHEN_NAMESPACE).fetchSockets();
      for (const s of kitchenSockets) {
        s.disconnect(true);
      }
    } catch {}
  });

  const connectKitchenClient = (token, options = {}) => {
    const socket = ioc(`http://127.0.0.1:${port}${KITCHEN_NAMESPACE}`, {
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

  const connectGuestClient = (token, options = {}) => {
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
      if (socket.connected) return resolve(socket);
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

  test('1. owner account connects successfully to /kitchen', async () => {
    const token = fixtures.ownerAToken;
    const client = connectKitchenClient(token);
    await waitForConnect(client);
    expect(client.connected).toBe(true);
  });

  test('2. kitchen account connects successfully to /kitchen', async () => {
    const token = fixtures.kitchenAToken;
    const client = connectKitchenClient(token);
    await waitForConnect(client);
    expect(client.connected).toBe(true);
  });

  test('3. connection without auth token is refused with "unauthorised"', async () => {
    const client = connectKitchenClient(undefined);
    const err = await waitForError(client);
    expect(err.message).toBe('unauthorised');
  });

  test('4. connection with garbage token is refused with "unauthorised"', async () => {
    const client = connectKitchenClient('totally-invalid-garbage-jwt');
    const err = await waitForError(client);
    expect(err.message).toBe('unauthorised');
  });

  test('5. connection with a GUEST token is refused with "unauthorised"', async () => {
    const guestToken = generateGuestToken({
      sessionId: new mongoose.Types.ObjectId().toString(),
      participantId: 'p-guest-1',
    });
    const client = connectKitchenClient(guestToken);
    const err = await waitForError(client);
    expect(err.message).toBe('unauthorised');
  });

  test('6. connection with token for deleted user is refused with "unauthorised"', async () => {
    const tempUser = await User.create({
      name: 'Temp Staff',
      email: 'temp_staff@test.com',
      passwordHash: 'dummy-password-hash',
      role: 'kitchen',
      restaurantId: fixtures.restaurantA._id,
    });
    const token = generateToken(tempUser);
    await User.findByIdAndDelete(tempUser._id);

    const client = connectKitchenClient(token);
    const err = await waitForError(client);
    expect(err.message).toBe('unauthorised');
  });

  test('7. connection with token for user with another role is refused with "unauthorised"', async () => {
    const customUser = {
      id: new mongoose.Types.ObjectId().toString(),
      role: 'waiter',
      restaurantId: fixtures.restaurantA._id,
    };
    const secret = process.env.JWT_SECRET;
    const token = jwt.sign(
      { role: customUser.role, restaurantId: String(customUser.restaurantId) },
      secret,
      { algorithm: 'HS256', subject: customUser.id, expiresIn: '1h' }
    );

    const client = connectKitchenClient(token);
    const err = await waitForError(client);
    expect(err.message).toBe('unauthorised');
  });

  test('8. STAFF token is refused on the guest namespace', async () => {
    const staffToken = fixtures.ownerAToken;
    const client = connectGuestClient(staffToken);
    const err = await waitForError(client);
    expect(err.message).toBe('unauthorised');
  });

  test('9. after realtime.ordersChanged, staff socket receives exactly one "orders:changed" with {} and nothing more', async () => {
    const token = fixtures.ownerAToken;
    const client = connectKitchenClient(token);
    await waitForConnect(client);

    const received = [];
    client.on(ORDER_EVENTS.ORDERS_CHANGED, (data) => {
      received.push(data);
    });

    realtime.ordersChanged(fixtures.restaurantA._id);

    await new Promise((resolve) => setTimeout(resolve, 150));

    expect(received.length).toBe(1);
    expect(received[0]).toEqual({});
  });

  test('10. staff socket of ANOTHER restaurant receives nothing (wait 300 ms)', async () => {
    const tokenA = fixtures.ownerAToken;
    const tokenB = fixtures.ownerBToken;

    const clientA = connectKitchenClient(tokenA);
    const clientB = connectKitchenClient(tokenB);

    await Promise.all([waitForConnect(clientA), waitForConnect(clientB)]);

    const receivedA = [];
    const receivedB = [];

    clientA.on(ORDER_EVENTS.ORDERS_CHANGED, (data) => receivedA.push(data));
    clientB.on(ORDER_EVENTS.ORDERS_CHANGED, (data) => receivedB.push(data));

    realtime.ordersChanged(fixtures.restaurantA._id);

    await new Promise((resolve) => setTimeout(resolve, 300));

    expect(receivedA.length).toBe(1);
    expect(receivedB.length).toBe(0);
  });

  test('11. anything the client emits causes no broadcast or server crash', async () => {
    const token = fixtures.kitchenAToken;
    const client = connectKitchenClient(token);
    await waitForConnect(client);

    expect(() => {
      client.emit('orders:change', { fake: 'order' });
      client.emit('orders:changed', { evil: true });
      client.emit('message', 'kitchen ping');
    }).not.toThrow();

    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(client.connected).toBe(true);
  });

  test("12. server logs '[maitred] kitchen connection refused: server misconfigured' when JWT_SECRET is invalid", async () => {
    const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    const originalSecret = process.env.JWT_SECRET;
    try {
      process.env.JWT_SECRET = 'short';
      const client = connectKitchenClient('any-token');
      const err = await waitForError(client);
      expect(err.message).toBe('unauthorised');
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        '[maitred] kitchen connection refused: server misconfigured'
      );
    } finally {
      process.env.JWT_SECRET = originalSecret;
      consoleErrorSpy.mockRestore();
    }
  });
});
