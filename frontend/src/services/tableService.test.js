import { describe, test, expect, beforeEach, vi } from 'vitest';
import { AxiosError } from 'axios';
import api from './api.js';
import {
  fetchTables,
  createTable,
  fetchTableQR,
  rotateTableToken,
  deleteTable,
} from './tableService.js';

describe('tableService', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  test('fetchTables sends GET to /tables and returns [{ id, number }] dropping qrToken', async () => {
    let captured = null;
    api.defaults.adapter = async (config) => {
      captured = config;
      return {
        data: {
          tables: [
            { id: 't1', number: 1, qrToken: 'secret-token-123' },
            { id: 't2', number: 2, qrToken: 'secret-token-456' },
          ],
        },
        status: 200,
        statusText: 'OK',
        headers: {},
        config,
      };
    };

    const result = await fetchTables();
    expect(captured.method.toLowerCase()).toBe('get');
    expect(captured.url).toBe('/tables');
    expect(result).toEqual([
      { id: 't1', number: 1 },
      { id: 't2', number: 2 },
    ]);
    expect(Object.keys(result[0]).sort()).toEqual(['id', 'number']);
    expect(result[0].qrToken).toBeUndefined();
  });

  test('createTable sends POST to /tables with number and returns { id, number } dropping qrToken', async () => {
    let captured = null;
    api.defaults.adapter = async (config) => {
      captured = config;
      return {
        data: {
          table: { id: 't3', number: 5, qrToken: 'secret-token-789' },
        },
        status: 201,
        statusText: 'Created',
        headers: {},
        config,
      };
    };

    const result = await createTable(5);
    expect(captured.method.toLowerCase()).toBe('post');
    expect(captured.url).toBe('/tables');
    expect(JSON.parse(captured.data)).toEqual({ number: 5 });
    expect(result).toEqual({ id: 't3', number: 5 });
    expect(Object.keys(result).sort()).toEqual(['id', 'number']);
    expect(result.qrToken).toBeUndefined();
  });

  test('fetchTableQR sends GET to /tables/:tableId/qr and returns full data ({ table, url, qrDataUrl })', async () => {
    let captured = null;
    const responsePayload = {
      table: { id: 't1', number: 1 },
      url: 'https://example.com/join/token123',
      qrDataUrl: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAA...',
    };
    api.defaults.adapter = async (config) => {
      captured = config;
      return {
        data: responsePayload,
        status: 200,
        statusText: 'OK',
        headers: {},
        config,
      };
    };

    const result = await fetchTableQR('t1');
    expect(captured.method.toLowerCase()).toBe('get');
    expect(captured.url).toBe('/tables/t1/qr');
    expect(result).toEqual(responsePayload);
  });

  test('fetchTableQR encodes tableId with special characters or slashes', async () => {
    let captured = null;
    api.defaults.adapter = async (config) => {
      captured = config;
      return {
        data: { table: { id: 'tbl/1 2', number: 1 } },
        status: 200,
        statusText: 'OK',
        headers: {},
        config,
      };
    };

    await fetchTableQR('tbl/1 2');
    expect(captured.url).toBe('/tables/tbl%2F1%202/qr');
  });

  test('rotateTableToken sends POST to /tables/:tableId/rotate-token and returns { id, number } dropping qrToken', async () => {
    let captured = null;
    api.defaults.adapter = async (config) => {
      captured = config;
      return {
        data: {
          table: { id: 't2', number: 4, qrToken: 'new-token-abc' },
        },
        status: 200,
        statusText: 'OK',
        headers: {},
        config,
      };
    };

    const result = await rotateTableToken('t2');
    expect(captured.method.toLowerCase()).toBe('post');
    expect(captured.url).toBe('/tables/t2/rotate-token');
    expect(result).toEqual({ id: 't2', number: 4 });
    expect(Object.keys(result).sort()).toEqual(['id', 'number']);
    expect(result.qrToken).toBeUndefined();
  });

  test('rotateTableToken encodes tableId containing slashes', async () => {
    let captured = null;
    api.defaults.adapter = async (config) => {
      captured = config;
      return {
        data: { table: { id: 'sec/t3', number: 3, qrToken: 'tok' } },
        status: 200,
        statusText: 'OK',
        headers: {},
        config,
      };
    };

    await rotateTableToken('sec/t3');
    expect(captured.url).toBe('/tables/sec%2Ft3/rotate-token');
  });

  test('deleteTable sends DELETE to /tables/:tableId and returns data', async () => {
    let captured = null;
    api.defaults.adapter = async (config) => {
      captured = config;
      return {
        data: { message: 'Table deleted' },
        status: 200,
        statusText: 'OK',
        headers: {},
        config,
      };
    };

    const result = await deleteTable('t4');
    expect(captured.method.toLowerCase()).toBe('delete');
    expect(captured.url).toBe('/tables/t4');
    expect(result).toEqual({ message: 'Table deleted' });
  });

  test('deleteTable encodes tableId containing spaces and slashes', async () => {
    let captured = null;
    api.defaults.adapter = async (config) => {
      captured = config;
      return {
        data: { message: 'Deleted' },
        status: 200,
        statusText: 'OK',
        headers: {},
        config,
      };
    };

    await deleteTable('table/5 6');
    expect(captured.url).toBe('/tables/table%2F5%206');
  });

  test('409 Conflict rejects with err.response.status intact', async () => {
    api.defaults.adapter = async (config) => {
      const err = new AxiosError('Conflict', 'ERR_BAD_REQUEST', config, null, {
        status: 409,
        statusText: 'Conflict',
        headers: {},
        config,
        data: { message: 'Table has an open session' },
      });
      return Promise.reject(err);
    };

    try {
      await deleteTable('t1');
      expect.fail('Expected deleteTable to reject');
    } catch (err) {
      expect(err.response?.status).toBe(409);
    }
  });

  test('500 Server Error rejects with err.response.status intact', async () => {
    api.defaults.adapter = async (config) => {
      const err = new AxiosError('Server Error', 'ERR_BAD_RESPONSE', config, null, {
        status: 500,
        statusText: 'Internal Server Error',
        headers: {},
        config,
        data: { message: 'Server error' },
      });
      return Promise.reject(err);
    };

    try {
      await fetchTables();
      expect.fail('Expected fetchTables to reject');
    } catch (err) {
      expect(err.response?.status).toBe(500);
    }
  });
});
