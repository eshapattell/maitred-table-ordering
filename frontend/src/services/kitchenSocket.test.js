// kitchenSocket.test.js: unit tests for staff kitchen Socket.io connection manager
import { describe, test, expect, vi, beforeEach } from 'vitest';
import { io } from 'socket.io-client';
import { readAuthToken } from './api.js';
import { connectKitchen } from './kitchenSocket.js';
import { KITCHEN_NAMESPACE } from '../utils/kitchenBoard.js';

vi.mock('socket.io-client', () => ({
  io: vi.fn(),
}));

vi.mock('./api.js', () => ({
  readAuthToken: vi.fn(),
}));

describe('kitchenSocket', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test('1. returns null when readAuthToken is empty, null, or whitespace', () => {
    readAuthToken.mockReturnValue('');
    expect(connectKitchen()).toBeNull();

    readAuthToken.mockReturnValue(null);
    expect(connectKitchen()).toBeNull();

    readAuthToken.mockReturnValue('   ');
    expect(connectKitchen()).toBeNull();

    expect(io).not.toHaveBeenCalled();
  });

  test('2. calls io once with exactly KITCHEN_NAMESPACE and options', () => {
    readAuthToken.mockReturnValue('test-staff-token');
    const fakeSocket = { on: vi.fn(), off: vi.fn(), disconnect: vi.fn() };
    io.mockReturnValueOnce(fakeSocket);

    const socket = connectKitchen();
    expect(socket).toBe(fakeSocket);
    expect(io).toHaveBeenCalledTimes(1);

    const [namespace, options] = io.mock.calls[0];
    expect(namespace).toBe(KITCHEN_NAMESPACE);
    expect(namespace).toBe('/kitchen');
    expect(options.path).toBe('/socket.io');
    expect(options.transports).toEqual(['websocket', 'polling']);
    expect(options.reconnectionDelayMax).toBe(5000);
    expect(typeof options.auth).toBe('function');
  });

  test('3. the auth function yields the current token every time it is called', () => {
    readAuthToken.mockReturnValue('token-1');
    connectKitchen();

    const [, options] = io.mock.calls[0];
    let payload1;
    options.auth((data) => {
      payload1 = data;
    });
    expect(payload1).toEqual({ token: 'token-1' });

    readAuthToken.mockReturnValue('token-2');
    let payload2;
    options.auth((data) => {
      payload2 = data;
    });
    expect(payload2).toEqual({ token: 'token-2' });
  });

  test('4. the auth function yields an empty string after token is removed', () => {
    readAuthToken.mockReturnValue('initial-token');
    connectKitchen();

    const [, options] = io.mock.calls[0];
    readAuthToken.mockReturnValue('');

    let payload;
    options.auth((data) => {
      payload = data;
    });
    expect(payload).toEqual({ token: '' });
  });

  test('5. nothing about the token is ever placed in a URL or query string', () => {
    readAuthToken.mockReturnValue('secret-staff-jwt-token');
    connectKitchen();

    expect(io).toHaveBeenCalledTimes(1);
    const [namespace, options] = io.mock.calls[0];
    expect(namespace).toBe('/kitchen');
    expect(options.query).toBeUndefined();

    const serialized = JSON.stringify(options);
    expect(serialized).not.toContain('secret-staff-jwt-token');
    expect(serialized).not.toContain('?token');
    expect(serialized).not.toContain('query');
  });
});
