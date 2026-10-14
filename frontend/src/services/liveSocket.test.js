// liveSocket.test.js: unit tests for Socket.io connection manager
import { describe, test, expect, vi, beforeEach } from 'vitest';
import { io } from 'socket.io-client';
import { readGuestToken } from './guestService.js';
import { connectLive } from './liveSocket.js';

vi.mock('socket.io-client', () => ({
  io: vi.fn(),
}));

vi.mock('./guestService.js', () => ({
  readGuestToken: vi.fn(),
}));

describe('liveSocket', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test('1. returns null when readGuestToken is empty, null, or whitespace', () => {
    readGuestToken.mockReturnValue('');
    expect(connectLive()).toBeNull();

    readGuestToken.mockReturnValue(null);
    expect(connectLive()).toBeNull();

    readGuestToken.mockReturnValue('   ');
    expect(connectLive()).toBeNull();

    expect(io).not.toHaveBeenCalled();
  });

  test('2. calls io once with exactly the required options', () => {
    readGuestToken.mockReturnValue('test-token-123');
    const fakeSocket = { on: vi.fn(), disconnect: vi.fn() };
    io.mockReturnValueOnce(fakeSocket);

    const socket = connectLive();
    expect(socket).toBe(fakeSocket);
    expect(io).toHaveBeenCalledTimes(1);

    const [options] = io.mock.calls[0];
    expect(options.path).toBe('/socket.io');
    expect(options.transports).toEqual(['websocket', 'polling']);
    expect(options.reconnectionDelayMax).toBe(5000);
    expect(typeof options.auth).toBe('function');
  });

  test('3. the auth function yields the current token each time it is called', () => {
    readGuestToken.mockReturnValue('token-attempt-1');
    connectLive();

    const [options] = io.mock.calls[0];
    let authPayload1;
    options.auth((data) => {
      authPayload1 = data;
    });
    expect(authPayload1).toEqual({ token: 'token-attempt-1' });

    readGuestToken.mockReturnValue('token-attempt-2');
    let authPayload2;
    options.auth((data) => {
      authPayload2 = data;
    });
    expect(authPayload2).toEqual({ token: 'token-attempt-2' });
  });

  test('4. the auth function yields an empty string after token is removed', () => {
    readGuestToken.mockReturnValue('initial-token');
    connectLive();

    const [options] = io.mock.calls[0];
    readGuestToken.mockReturnValue('');

    let authPayload;
    options.auth((data) => {
      authPayload = data;
    });
    expect(authPayload).toEqual({ token: '' });
  });

  test('5. nothing about the token is ever placed in a URL or query string', () => {
    readGuestToken.mockReturnValue('secret-jwt-token-value');
    connectLive();

    expect(io).toHaveBeenCalledTimes(1);
    const args = io.mock.calls[0];
    // Must be called with a single options argument, no URL string
    expect(args).toHaveLength(1);
    expect(typeof args[0]).toBe('object');
    expect(args[0].query).toBeUndefined();

    const serialized = JSON.stringify(args[0]);
    expect(serialized).not.toContain('secret-jwt-token-value');
    expect(serialized).not.toContain('?token');
    expect(serialized).not.toContain('query');
  });
});
