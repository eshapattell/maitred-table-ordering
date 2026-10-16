// guestOrderService.test.js: unit tests for guest order API service
import { describe, test, expect, vi, beforeEach } from 'vitest';
import guestApi from './guestApi.js';
import { placeOrder, fetchPlacedItems, cancelPlacedItem } from './guestOrderService.js';

vi.mock('./guestApi.js');

describe('guestOrderService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test('1. placeOrder posts { expectedVersion } to /sessions/orders and returns response.data', async () => {
    const mockAnswer = {
      placed: 2,
      left: [],
      summary: { total: 0, byReason: {} },
      cart: { version: 4, lines: [] },
    };
    guestApi.post.mockResolvedValueOnce({ data: mockAnswer });

    const result = await placeOrder(3);
    expect(guestApi.post).toHaveBeenCalledWith('/sessions/orders', { expectedVersion: 3 });
    expect(result).toEqual(mockAnswer);
  });

  test('2. placeOrder propagates error with response.status and code intact', async () => {
    const error = {
      response: {
        status: 409,
        data: { code: 'CART_CHANGED' },
      },
    };
    guestApi.post.mockRejectedValueOnce(error);

    await expect(placeOrder(3)).rejects.toMatchObject({
      response: { status: 409, data: { code: 'CART_CHANGED' } },
    });
  });

  test('3. fetchPlacedItems sends GET to /sessions/orders/placed and returns items array', async () => {
    const mockItems = [
      { orderId: 'a'.repeat(24), orderItemId: '00000000-0000-4000-8000-000000000001', name: 'Soup', qty: 1, orderedBy: 'Hema' },
    ];
    guestApi.get.mockResolvedValueOnce({ data: { items: mockItems } });

    const result = await fetchPlacedItems();
    expect(guestApi.get).toHaveBeenCalledWith('/sessions/orders/placed');
    expect(result).toEqual(mockItems);
  });

  test('4. fetchPlacedItems returns empty array when items is not an array', async () => {
    for (const items of [null, undefined, 'junk', 123, {}]) {
      guestApi.get.mockResolvedValueOnce({ data: { items } });
      const result = await fetchPlacedItems();
      expect(result).toEqual([]);
    }

    // Also when data itself has no items property
    guestApi.get.mockResolvedValueOnce({ data: null });
    expect(await fetchPlacedItems()).toEqual([]);
  });

  test('5. fetchPlacedItems propagates error with response.status and code intact', async () => {
    const error = {
      response: {
        status: 403,
        data: { code: 'NOT_HOST' },
      },
    };
    guestApi.get.mockRejectedValueOnce(error);

    await expect(fetchPlacedItems()).rejects.toMatchObject({
      response: { status: 403, data: { code: 'NOT_HOST' } },
    });
  });

  test('6. cancelPlacedItem posts to cancel route and returns response.data', async () => {
    const mockData = { cancelled: true };
    guestApi.post.mockResolvedValueOnce({ data: mockData });

    const orderId = 'a'.repeat(24);
    const orderItemId = '00000000-0000-4000-8000-000000000001';
    const result = await cancelPlacedItem(orderId, orderItemId);

    expect(guestApi.post).toHaveBeenCalledWith(`/sessions/orders/${orderId}/items/${orderItemId}/cancel`);
    expect(result).toEqual(mockData);
  });

  test('7. cancelPlacedItem encodes orderId and orderItemId containing special characters or slashes', async () => {
    guestApi.post.mockResolvedValueOnce({ data: { cancelled: true } });

    await cancelPlacedItem('order/123', 'item#456?special');
    expect(guestApi.post).toHaveBeenCalledWith('/sessions/orders/order%2F123/items/item%23456%3Fspecial/cancel');
  });

  test('8. cancelPlacedItem propagates error with response.status and code intact', async () => {
    const error = {
      response: {
        status: 409,
        data: { code: 'ALREADY_STARTED' },
      },
    };
    guestApi.post.mockRejectedValueOnce(error);

    await expect(cancelPlacedItem('order-1', 'item-1')).rejects.toMatchObject({
      response: { status: 409, data: { code: 'ALREADY_STARTED' } },
    });
  });
});
