// cartService.test.js: unit tests for guest cart API service
import { describe, test, expect, vi, beforeEach } from 'vitest';
import guestApi from './guestApi.js';
import { getCart, addToCart, decreaseLine, removeLine } from './cartService.js';

vi.mock('./guestApi.js');

describe('cartService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const sampleCart = {
    version: 1,
    lines: [],
    totalQuantity: 0,
    total: 0,
    hasHiddenLines: false,
  };

  test('1. getCart calls GET /sessions/cart and returns data.cart', async () => {
    guestApi.get.mockResolvedValueOnce({ data: { cart: sampleCart } });

    const result = await getCart();
    expect(guestApi.get).toHaveBeenCalledWith('/sessions/cart');
    expect(result).toEqual(sampleCart);
  });

  test('2. getCart propagates error with response.status intact', async () => {
    const error = { response: { status: 401, data: { message: 'Invalid token' } } };
    guestApi.get.mockRejectedValueOnce(error);

    await expect(getCart()).rejects.toMatchObject({ response: { status: 401 } });
  });

  test('3. addToCart posts { menuItemId } to /sessions/cart/items and returns data.cart', async () => {
    const updatedCart = { ...sampleCart, version: 2, totalQuantity: 1 };
    guestApi.post.mockResolvedValueOnce({ data: { cart: updatedCart } });

    const result = await addToCart('item-123');
    expect(guestApi.post).toHaveBeenCalledWith('/sessions/cart/items', { menuItemId: 'item-123' });
    expect(result).toEqual(updatedCart);
  });

  test('4. addToCart propagates error with response.status intact', async () => {
    const error = { response: { status: 409, data: { code: 'NOT_SAFE' } } };
    guestApi.post.mockRejectedValueOnce(error);

    await expect(addToCart('item-clash')).rejects.toMatchObject({ response: { status: 409 } });
  });

  test('5. decreaseLine sends PATCH to /sessions/cart/items/:id with { delta: -1 } and returns data.cart', async () => {
    const updatedCart = { ...sampleCart, version: 3 };
    guestApi.patch.mockResolvedValueOnce({ data: { cart: updatedCart } });

    const result = await decreaseLine('line-456');
    expect(guestApi.patch).toHaveBeenCalledWith('/sessions/cart/items/line-456', { delta: -1 });
    expect(result).toEqual(updatedCart);
  });

  test('6. decreaseLine URI encodes an id containing "/"', async () => {
    guestApi.patch.mockResolvedValueOnce({ data: { cart: sampleCart } });

    await decreaseLine('line/with/slashes');
    expect(guestApi.patch).toHaveBeenCalledWith('/sessions/cart/items/line%2Fwith%2Fslashes', { delta: -1 });
  });

  test('7. decreaseLine propagates error with response.status intact', async () => {
    const error = { response: { status: 409, data: { code: 'MIN_QTY' } } };
    guestApi.patch.mockRejectedValueOnce(error);

    await expect(decreaseLine('line-456')).rejects.toMatchObject({ response: { status: 409 } });
  });

  test('8. removeLine sends DELETE to /sessions/cart/items/:id and returns data.cart', async () => {
    const updatedCart = { ...sampleCart, version: 4 };
    guestApi.delete.mockResolvedValueOnce({ data: { cart: updatedCart } });

    const result = await removeLine('line-789');
    expect(guestApi.delete).toHaveBeenCalledWith('/sessions/cart/items/line-789');
    expect(result).toEqual(updatedCart);
  });

  test('9. removeLine URI encodes an id containing "/"', async () => {
    guestApi.delete.mockResolvedValueOnce({ data: { cart: sampleCart } });

    await removeLine('line/to/remove');
    expect(guestApi.delete).toHaveBeenCalledWith('/sessions/cart/items/line%2Fto%2Fremove');
  });

  test('10. removeLine propagates error with response.status intact', async () => {
    const error = { response: { status: 404, data: { code: 'CART_ITEM_NOT_FOUND' } } };
    guestApi.delete.mockRejectedValueOnce(error);

    await expect(removeLine('line-789')).rejects.toMatchObject({ response: { status: 404 } });
  });
});
