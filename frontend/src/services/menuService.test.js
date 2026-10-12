import { describe, test, expect, beforeEach, vi } from 'vitest';
import { AxiosError } from 'axios';
import api from './api.js';
import {
  fetchMenu,
  createMenuItem,
  updateMenuItem,
  confirmAllergens,
  setAvailability,
} from './menuService.js';

describe('menuService', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  test('fetchMenu sends GET to /menu and returns data.items', async () => {
    let captured = null;
    api.defaults.adapter = async (config) => {
      captured = config;
      return {
        data: { items: [{ id: '1', name: 'Dal' }] },
        status: 200,
        statusText: 'OK',
        headers: {},
        config,
      };
    };

    const result = await fetchMenu();
    expect(captured.method.toLowerCase()).toBe('get');
    expect(captured.url).toBe('/menu');
    expect(result).toEqual([{ id: '1', name: 'Dal' }]);
  });

  test('createMenuItem sends POST to /menu with payload and returns data.item', async () => {
    let captured = null;
    const payload = { name: 'Biryani', price: 400 };
    api.defaults.adapter = async (config) => {
      captured = config;
      return {
        data: { item: { id: 'm1', ...payload } },
        status: 201,
        statusText: 'Created',
        headers: {},
        config,
      };
    };

    const result = await createMenuItem(payload);
    expect(captured.method.toLowerCase()).toBe('post');
    expect(captured.url).toBe('/menu');
    expect(JSON.parse(captured.data)).toEqual(payload);
    expect(result).toEqual({ id: 'm1', name: 'Biryani', price: 400 });
  });

  test('updateMenuItem sends PATCH to /menu/:itemId with payload and returns data.item', async () => {
    let captured = null;
    const payload = { price: 450 };
    api.defaults.adapter = async (config) => {
      captured = config;
      return {
        data: { item: { id: 'm1', price: 450 } },
        status: 200,
        statusText: 'OK',
        headers: {},
        config,
      };
    };

    const result = await updateMenuItem('m1', payload);
    expect(captured.method.toLowerCase()).toBe('patch');
    expect(captured.url).toBe('/menu/m1');
    expect(JSON.parse(captured.data)).toEqual(payload);
    expect(result).toEqual({ id: 'm1', price: 450 });
  });

  test('updateMenuItem encodes itemId containing spaces and slashes', async () => {
    let captured = null;
    api.defaults.adapter = async (config) => {
      captured = config;
      return {
        data: { item: { id: 'dish/1 2' } },
        status: 200,
        statusText: 'OK',
        headers: {},
        config,
      };
    };

    await updateMenuItem('dish/1 2', { price: 500 });
    expect(captured.url).toBe('/menu/dish%2F1%202');
  });

  test('confirmAllergens sends POST to /menu/:itemId/confirm-allergens with { allergens } and returns data.item', async () => {
    let captured = null;
    api.defaults.adapter = async (config) => {
      captured = config;
      return {
        data: { item: { id: 'm2', allergensConfirmed: true } },
        status: 200,
        statusText: 'OK',
        headers: {},
        config,
      };
    };

    const result = await confirmAllergens('m2', ['dairy', 'gluten']);
    expect(captured.method.toLowerCase()).toBe('post');
    expect(captured.url).toBe('/menu/m2/confirm-allergens');
    expect(JSON.parse(captured.data)).toEqual({ allergens: ['dairy', 'gluten'] });
    expect(result).toEqual({ id: 'm2', allergensConfirmed: true });
  });

  test('confirmAllergens encodes itemId containing slashes or spaces', async () => {
    let captured = null;
    api.defaults.adapter = async (config) => {
      captured = config;
      return {
        data: { item: { id: 'special/item 9' } },
        status: 200,
        statusText: 'OK',
        headers: {},
        config,
      };
    };

    await confirmAllergens('special/item 9', []);
    expect(captured.url).toBe('/menu/special%2Fitem%209/confirm-allergens');
  });

  test('setAvailability sends PATCH to /menu/:itemId/availability with { available } and returns data.item', async () => {
    let captured = null;
    api.defaults.adapter = async (config) => {
      captured = config;
      return {
        data: { item: { id: 'm3', available: false } },
        status: 200,
        statusText: 'OK',
        headers: {},
        config,
      };
    };

    const result = await setAvailability('m3', false);
    expect(captured.method.toLowerCase()).toBe('patch');
    expect(captured.url).toBe('/menu/m3/availability');
    expect(JSON.parse(captured.data)).toEqual({ available: false });
    expect(result).toEqual({ id: 'm3', available: false });
  });

  test('setAvailability encodes itemId containing special characters', async () => {
    let captured = null;
    api.defaults.adapter = async (config) => {
      captured = config;
      return {
        data: { item: { id: 'cat/dish 1' } },
        status: 200,
        statusText: 'OK',
        headers: {},
        config,
      };
    };

    await setAvailability('cat/dish 1', true);
    expect(captured.url).toBe('/menu/cat%2Fdish%201/availability');
  });

  test('409 Conflict rejects with err.response.status intact', async () => {
    api.defaults.adapter = async (config) => {
      const err = new AxiosError('Conflict', 'ERR_BAD_REQUEST', config, null, {
        status: 409,
        statusText: 'Conflict',
        headers: {},
        config,
        data: { message: 'Allergens changed since you reviewed them' },
      });
      return Promise.reject(err);
    };

    try {
      await confirmAllergens('m1', ['dairy']);
      expect.fail('Expected confirmAllergens to reject');
    } catch (err) {
      expect(err.response?.status).toBe(409);
    }
  });

  test('500 Internal Server Error rejects with err.response.status intact', async () => {
    api.defaults.adapter = async (config) => {
      const err = new AxiosError('Server Error', 'ERR_BAD_RESPONSE', config, null, {
        status: 500,
        statusText: 'Internal Server Error',
        headers: {},
        config,
        data: { message: 'Internal server error' },
      });
      return Promise.reject(err);
    };

    try {
      await fetchMenu();
      expect.fail('Expected fetchMenu to reject');
    } catch (err) {
      expect(err.response?.status).toBe(500);
    }
  });
});
