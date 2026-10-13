import { describe, test, expect, beforeEach, vi } from 'vitest';
import { AxiosError } from 'axios';
import guestApi from './guestApi.js';
import { STORAGE_KEYS, EVENTS } from '../utils/constants.js';

describe('guestApi axios client and interceptors', () => {
  beforeEach(() => {
    sessionStorage.clear();
    vi.restoreAllMocks();
  });

  test('1. baseURL is /api and timeout is 15000ms', () => {
    expect(guestApi.defaults.baseURL).toBe('/api');
    expect(guestApi.defaults.timeout).toBe(15000);
  });

  test('2. the guest token is attached as Bearer header when present in sessionStorage', async () => {
    sessionStorage.setItem(STORAGE_KEYS.GUEST_TOKEN, 'guest-token-123');

    let capturedConfig = null;
    guestApi.defaults.adapter = async (config) => {
      capturedConfig = config;
      return {
        data: { ok: true },
        status: 200,
        statusText: 'OK',
        headers: {},
        config,
      };
    };

    const res = await guestApi.get('/sessions/me');
    expect(res.data).toEqual({ ok: true });
    expect(capturedConfig.headers.Authorization).toBe('Bearer guest-token-123');
  });

  test('3. no token in sessionStorage means no Authorization header', async () => {
    let capturedConfig = null;
    guestApi.defaults.adapter = async (config) => {
      capturedConfig = config;
      return {
        data: { ok: true },
        status: 200,
        statusText: 'OK',
        headers: {},
        config,
      };
    };

    await guestApi.get('/sessions/me');
    expect(capturedConfig.headers.Authorization).toBeUndefined();
  });

  test('4. the STAFF token is never sent by guestApi', async () => {
    // Put a staff token in sessionStorage under its standard key
    sessionStorage.setItem('maitred.authToken', 'staff-secret-token');

    let capturedConfig = null;
    guestApi.defaults.adapter = async (config) => {
      capturedConfig = config;
      return {
        data: { ok: true },
        status: 200,
        statusText: 'OK',
        headers: {},
        config,
      };
    };

    await guestApi.get('/sessions/me');
    expect(capturedConfig.headers.Authorization).toBeUndefined();
  });

  test('5. 401 SESSION_CLOSED removes token and fires GUEST_ENDED event once with code', async () => {
    sessionStorage.setItem(STORAGE_KEYS.GUEST_TOKEN, 'active-guest-token');

    let eventDetail = null;
    const listener = vi.fn((e) => {
      eventDetail = e.detail;
    });
    window.addEventListener(EVENTS.GUEST_ENDED, listener);

    guestApi.defaults.adapter = async (config) => {
      const err = new AxiosError('Unauthorized', 'ERR_BAD_REQUEST', config, null, {
        status: 401,
        statusText: 'Unauthorized',
        headers: {},
        config,
        data: { message: 'Session closed', code: 'SESSION_CLOSED' },
      });
      return Promise.reject(err);
    };

    await expect(guestApi.get('/sessions/me')).rejects.toThrow();

    expect(sessionStorage.getItem(STORAGE_KEYS.GUEST_TOKEN)).toBeNull();
    expect(listener).toHaveBeenCalledTimes(1);
    expect(eventDetail).toEqual({ code: 'SESSION_CLOSED' });

    window.removeEventListener(EVENTS.GUEST_ENDED, listener);
  });

  test('6. 401 PARTICIPANT_REMOVED removes token and fires GUEST_ENDED event once with code', async () => {
    sessionStorage.setItem(STORAGE_KEYS.GUEST_TOKEN, 'active-guest-token');

    let eventDetail = null;
    const listener = vi.fn((e) => {
      eventDetail = e.detail;
    });
    window.addEventListener(EVENTS.GUEST_ENDED, listener);

    guestApi.defaults.adapter = async (config) => {
      const err = new AxiosError('Unauthorized', 'ERR_BAD_REQUEST', config, null, {
        status: 401,
        statusText: 'Unauthorized',
        headers: {},
        config,
        data: { message: 'Participant removed', code: 'PARTICIPANT_REMOVED' },
      });
      return Promise.reject(err);
    };

    await expect(guestApi.get('/sessions/me')).rejects.toThrow();

    expect(sessionStorage.getItem(STORAGE_KEYS.GUEST_TOKEN)).toBeNull();
    expect(listener).toHaveBeenCalledTimes(1);
    expect(eventDetail).toEqual({ code: 'PARTICIPANT_REMOVED' });

    window.removeEventListener(EVENTS.GUEST_ENDED, listener);
  });

  test('7. 401 INVALID_TOKEN removes token and fires GUEST_ENDED event once with code', async () => {
    sessionStorage.setItem(STORAGE_KEYS.GUEST_TOKEN, 'active-guest-token');

    let eventDetail = null;
    const listener = vi.fn((e) => {
      eventDetail = e.detail;
    });
    window.addEventListener(EVENTS.GUEST_ENDED, listener);

    guestApi.defaults.adapter = async (config) => {
      const err = new AxiosError('Unauthorized', 'ERR_BAD_REQUEST', config, null, {
        status: 401,
        statusText: 'Unauthorized',
        headers: {},
        config,
        data: { message: 'Invalid token', code: 'INVALID_TOKEN' },
      });
      return Promise.reject(err);
    };

    await expect(guestApi.get('/sessions/me')).rejects.toThrow();

    expect(sessionStorage.getItem(STORAGE_KEYS.GUEST_TOKEN)).toBeNull();
    expect(listener).toHaveBeenCalledTimes(1);
    expect(eventDetail).toEqual({ code: 'INVALID_TOKEN' });

    window.removeEventListener(EVENTS.GUEST_ENDED, listener);
  });

  test('8. status 403 or 404 with ended codes do nothing', async () => {
    sessionStorage.setItem(STORAGE_KEYS.GUEST_TOKEN, 'guest-token-keep');

    const listener = vi.fn();
    window.addEventListener(EVENTS.GUEST_ENDED, listener);

    // 403 with code
    guestApi.defaults.adapter = async (config) => {
      const err = new AxiosError('Forbidden', 'ERR_BAD_REQUEST', config, null, {
        status: 403,
        statusText: 'Forbidden',
        headers: {},
        config,
        data: { code: 'SESSION_CLOSED' },
      });
      return Promise.reject(err);
    };
    await expect(guestApi.get('/sessions/me')).rejects.toThrow();
    expect(sessionStorage.getItem(STORAGE_KEYS.GUEST_TOKEN)).toBe('guest-token-keep');
    expect(listener).not.toHaveBeenCalled();

    // 404 with code
    guestApi.defaults.adapter = async (config) => {
      const err = new AxiosError('Not Found', 'ERR_BAD_REQUEST', config, null, {
        status: 404,
        statusText: 'Not Found',
        headers: {},
        config,
        data: { code: 'PARTICIPANT_REMOVED' },
      });
      return Promise.reject(err);
    };
    await expect(guestApi.get('/sessions/me')).rejects.toThrow();
    expect(sessionStorage.getItem(STORAGE_KEYS.GUEST_TOKEN)).toBe('guest-token-keep');
    expect(listener).not.toHaveBeenCalled();

    window.removeEventListener(EVENTS.GUEST_ENDED, listener);
  });

  test('9. a 500, a 409 and a plain network error do nothing', async () => {
    sessionStorage.setItem(STORAGE_KEYS.GUEST_TOKEN, 'guest-token-persist');

    const listener = vi.fn();
    window.addEventListener(EVENTS.GUEST_ENDED, listener);

    // 500 error
    guestApi.defaults.adapter = async (config) => {
      const err = new AxiosError('Server Error', 'ERR_BAD_RESPONSE', config, null, {
        status: 500,
        statusText: 'Internal Server Error',
        headers: {},
        config,
        data: { message: 'Server crash' },
      });
      return Promise.reject(err);
    };
    await expect(guestApi.get('/test-500')).rejects.toThrow();
    expect(sessionStorage.getItem(STORAGE_KEYS.GUEST_TOKEN)).toBe('guest-token-persist');
    expect(listener).not.toHaveBeenCalled();

    // 409 error
    guestApi.defaults.adapter = async (config) => {
      const err = new AxiosError('Conflict', 'ERR_BAD_REQUEST', config, null, {
        status: 409,
        statusText: 'Conflict',
        headers: {},
        config,
        data: { code: 'TABLE_FULL' },
      });
      return Promise.reject(err);
    };
    await expect(guestApi.get('/test-409')).rejects.toThrow();
    expect(sessionStorage.getItem(STORAGE_KEYS.GUEST_TOKEN)).toBe('guest-token-persist');
    expect(listener).not.toHaveBeenCalled();

    // Network error (no response)
    guestApi.defaults.adapter = async (config) => {
      const err = new AxiosError('Network Error', 'ERR_NETWORK', config, null);
      return Promise.reject(err);
    };
    await expect(guestApi.get('/test-network')).rejects.toThrow();
    expect(sessionStorage.getItem(STORAGE_KEYS.GUEST_TOKEN)).toBe('guest-token-persist');
    expect(listener).not.toHaveBeenCalled();

    window.removeEventListener(EVENTS.GUEST_ENDED, listener);
  });
});
