import { describe, test, expect, beforeEach, vi } from 'vitest';
import { AxiosError } from 'axios';
import api from './api.js';
import { fetchActiveOrders, updateDishStatus } from './orderService.js';

describe('orderService', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  test('1. fetchActiveOrders sends GET to /orders and returns data.orders', async () => {
    let captured = null;
    api.defaults.adapter = async (config) => {
      captured = config;
      return {
        data: { orders: [{ id: 'order-1', tableNumber: 3, items: [] }] },
        status: 200,
        statusText: 'OK',
        headers: {},
        config,
      };
    };

    const result = await fetchActiveOrders();
    expect(captured.method.toLowerCase()).toBe('get');
    expect(captured.url).toBe('/orders');
    expect(result).toEqual([{ id: 'order-1', tableNumber: 3, items: [] }]);
  });

  test('2. updateDishStatus sends PATCH to /orders/:orderId/items/:orderItemId/status with { status } and returns data.order', async () => {
    let captured = null;
    api.defaults.adapter = async (config) => {
      captured = config;
      return {
        data: { order: { id: 'order-1', items: [{ id: 'item-1', status: 'preparing' }] } },
        status: 200,
        statusText: 'OK',
        headers: {},
        config,
      };
    };

    const result = await updateDishStatus('order-1', 'item-1', 'preparing');
    expect(captured.method.toLowerCase()).toBe('patch');
    expect(captured.url).toBe('/orders/order-1/items/item-1/status');
    expect(JSON.parse(captured.data)).toEqual({ status: 'preparing' });
    expect(result).toEqual({ id: 'order-1', items: [{ id: 'item-1', status: 'preparing' }] });
  });

  test('3. updateDishStatus encodes orderId containing "/"', async () => {
    let captured = null;
    api.defaults.adapter = async (config) => {
      captured = config;
      return {
        data: { order: { id: 'ord/1' } },
        status: 200,
        statusText: 'OK',
        headers: {},
        config,
      };
    };

    await updateDishStatus('ord/1', 'item-1', 'ready');
    expect(captured.url).toBe('/orders/ord%2F1/items/item-1/status');
  });

  test('4. updateDishStatus encodes orderItemId containing "/"', async () => {
    let captured = null;
    api.defaults.adapter = async (config) => {
      captured = config;
      return {
        data: { order: { id: 'order-1' } },
        status: 200,
        statusText: 'OK',
        headers: {},
        config,
      };
    };

    await updateDishStatus('order-1', 'item/dish/2', 'served');
    expect(captured.url).toBe('/orders/order-1/items/item%2Fdish%2F2/status');
  });

  test('5. updateDishStatus encodes IDs with spaces and special characters', async () => {
    let captured = null;
    api.defaults.adapter = async (config) => {
      captured = config;
      return {
        data: { order: { id: 'order 1' } },
        status: 200,
        statusText: 'OK',
        headers: {},
        config,
      };
    };

    await updateDishStatus('order 1', 'item 2', 'cancelled');
    expect(captured.url).toBe('/orders/order%201/items/item%202/status');
  });

  test('6. fetchActiveOrders propagates errors keeping response.status intact', async () => {
    api.defaults.adapter = async (config) => {
      const err = new AxiosError('Internal Server Error', 'ERR_BAD_RESPONSE', config, null, {
        status: 500,
        statusText: 'Internal Server Error',
        headers: {},
        config,
        data: { message: 'Server error' },
      });
      return Promise.reject(err);
    };

    await expect(fetchActiveOrders()).rejects.toSatisfy((err) => {
      return err.response?.status === 500;
    });
  });

  test('7. updateDishStatus propagates 404 ORDER_NOT_FOUND keeping response.status intact', async () => {
    api.defaults.adapter = async (config) => {
      const err = new AxiosError('Not Found', 'ERR_BAD_REQUEST', config, null, {
        status: 404,
        statusText: 'Not Found',
        headers: {},
        config,
        data: { message: 'Order item not found', code: 'ORDER_NOT_FOUND' },
      });
      return Promise.reject(err);
    };

    await expect(updateDishStatus('ord-1', 'item-1', 'preparing')).rejects.toSatisfy((err) => {
      return err.response?.status === 404 && err.response?.data?.code === 'ORDER_NOT_FOUND';
    });
  });

  test('8. updateDishStatus propagates 409 INVALID_MOVE keeping response.status intact', async () => {
    api.defaults.adapter = async (config) => {
      const err = new AxiosError('Conflict', 'ERR_BAD_REQUEST', config, null, {
        status: 409,
        statusText: 'Conflict',
        headers: {},
        config,
        data: { message: 'Invalid transition', code: 'INVALID_MOVE' },
      });
      return Promise.reject(err);
    };

    await expect(updateDishStatus('ord-1', 'item-1', 'ready')).rejects.toSatisfy((err) => {
      return err.response?.status === 409 && err.response?.data?.code === 'INVALID_MOVE';
    });
  });
});
