// useHostOrders.test.jsx: unit tests for useHostOrders hook
import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, act, cleanup } from '@testing-library/react';
import { useHostOrders } from './useHostOrders.js';
import * as guestOrderService from '../services/guestOrderService.js';
import { ORDER_MESSAGES } from '../utils/guestOrder.js';
import { classifyCartLines, placementSummary } from '../../../backend/utils/orderRules.js';
import { buildCartView } from '../../../backend/utils/cartView.js';

vi.mock('../services/guestOrderService.js', () => ({
  placeOrder: vi.fn(),
  fetchPlacedItems: vi.fn(),
  cancelPlacedItem: vi.fn(),
}));

describe('useHostOrders', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  // Helpers to build real backend fixtures
  const uuid = (n) => `00000000-0000-4000-8000-0000000000${String(n).padStart(2, '0')}`;
  const ID = { soup: 'a'.repeat(24), salad: 'b'.repeat(24), dessert: 'c'.repeat(24) };
  const person = (id, nickname, allergies = [], over = {}) => ({
    id,
    nickname,
    role: 'guest',
    status: 'approved',
    allergiesDeclared: true,
    allergies,
    ...over,
  });
  const line = (n, itemId, addedBy) => ({ cartItemId: uuid(n), itemId, qty: 1, addedBy, isSurprise: false });
  const dish = (id, name, over = {}) => ({ _id: id, name, price: 100, available: true, allergens: [], allergensConfirmed: true, ...over });

  const buildRealPlacementAnswer = () => {
    const host = person('h', 'Hema', [], { role: 'host' });
    const guest = person('g', 'Gita', ['peanuts']);
    const session = {
      cartVersion: 3,
      participants: [host, guest],
      cart: [
        line(1, ID.soup, 'h'),
        line(2, ID.salad, 'g'), // peanut salad - not suitable for Gita
        line(3, ID.dessert, 'h'), // unavailable dessert
      ],
    };
    const items = [
      dish(ID.soup, 'Soup'),
      dish(ID.salad, 'Peanut Salad', { allergens: ['peanuts'] }),
      dish(ID.dessert, 'Dessert', { available: false }),
    ];

    const { ready, left } = classifyCartLines({ session, items });
    const summary = placementSummary(left);
    const cart = buildCartView({ session, items, viewer: host });

    return {
      placed: ready.length,
      left,
      summary,
      cart,
    };
  };

  const sampleRow = (n = 1) => ({
    orderId: 'd'.repeat(24),
    orderItemId: uuid(n),
    name: `Dish ${n}`,
    qty: 1,
    orderedBy: 'Hema',
  });

  test('1. nothing is requested while disabled', () => {
    const { result } = renderHook(() => useHostOrders({ enabled: false }));

    expect(guestOrderService.fetchPlacedItems).not.toHaveBeenCalled();
    expect(result.current.rows).toEqual([]);
    expect(result.current.placing).toBe(false);
    expect(result.current.message).toBeNull();
    expect(result.current.error).toBeNull();
  });

  test('2. the list loads once when enabled', async () => {
    const mockItems = [sampleRow(1)];
    guestOrderService.fetchPlacedItems.mockResolvedValueOnce(mockItems);

    const { result } = renderHook(() => useHostOrders({ enabled: true }));

    await act(async () => {
      await Promise.resolve();
    });

    expect(guestOrderService.fetchPlacedItems).toHaveBeenCalledTimes(1);
    expect(result.current.rows).toEqual(mockItems);
  });

  test('3. rows are trusted only through placedRows (drops junk rows and malformed fields)', async () => {
    const mixedItems = [
      sampleRow(1),
      null,
      { orderId: 'short', orderItemId: uuid(2), name: 'Bad', qty: 1 },
      { orderId: 'd'.repeat(24), orderItemId: 'not-a-uuid', name: 'Bad', qty: 1 },
      { orderId: 'd'.repeat(24), orderItemId: uuid(3), name: '', qty: 1 },
      { orderId: 'd'.repeat(24), orderItemId: uuid(4), name: 'Zero qty', qty: 0 },
      sampleRow(5),
    ];
    guestOrderService.fetchPlacedItems.mockResolvedValueOnce(mixedItems);

    const { result } = renderHook(() => useHostOrders({ enabled: true }));

    await act(async () => {
      await Promise.resolve();
    });

    expect(result.current.rows).toEqual([sampleRow(1), sampleRow(5)]);
  });

  test('4. a failed load keeps the old rows', async () => {
    const initialItems = [sampleRow(1)];
    guestOrderService.fetchPlacedItems.mockResolvedValueOnce(initialItems);

    const { result } = renderHook(() => useHostOrders({ enabled: true }));
    await act(async () => {
      await Promise.resolve();
    });
    expect(result.current.rows).toEqual(initialItems);

    // Subsequent reload fails
    guestOrderService.fetchPlacedItems.mockRejectedValueOnce(new Error('Network error'));
    await act(async () => {
      await result.current.loadPlaced();
    });

    expect(result.current.rows).toEqual(initialItems);
  });

  test('5. place success applies the cart, sets the sentence from a REAL placement answer, and reloads the list', async () => {
    guestOrderService.fetchPlacedItems.mockResolvedValue([]);
    const realAnswer = buildRealPlacementAnswer();
    guestOrderService.placeOrder.mockResolvedValueOnce(realAnswer);

    const onCartApplied = vi.fn();
    const onStale = vi.fn();

    const { result } = renderHook(() =>
      useHostOrders({ enabled: true, onCartApplied, onStale })
    );
    await act(async () => {
      await Promise.resolve();
    });

    const updatedPlaced = [sampleRow(1)];
    guestOrderService.fetchPlacedItems.mockResolvedValueOnce(updatedPlaced);

    await act(async () => {
      await result.current.place(3);
    });

    expect(guestOrderService.placeOrder).toHaveBeenCalledWith(3);
    expect(onCartApplied).toHaveBeenCalledWith(realAnswer.cart);
    expect(result.current.message).toBe(
      'Order placed: 1 dish sent to the kitchen. 2 items were left in the cart (unavailable: 1, not suitable for who added it: 1).'
    );
    expect(result.current.error).toBeNull();
    expect(result.current.rows).toEqual(updatedPlaced);
    expect(onStale).not.toHaveBeenCalled();
    expect(result.current.placing).toBe(false);
  });

  test('6. place is ignored while placing and a double call sends ONE request', async () => {
    guestOrderService.fetchPlacedItems.mockResolvedValue([]);
    let resolvePlacement;
    const pendingPromise = new Promise((resolve) => {
      resolvePlacement = resolve;
    });
    guestOrderService.placeOrder.mockReturnValueOnce(pendingPromise);

    const { result } = renderHook(() => useHostOrders({ enabled: true }));
    await act(async () => {
      await Promise.resolve();
    });

    // Start place
    let firstCall;
    act(() => {
      firstCall = result.current.place(3);
    });
    expect(result.current.placing).toBe(true);

    // Second call while placing should be ignored
    let secondCall;
    act(() => {
      secondCall = result.current.place(3);
    });

    expect(guestOrderService.placeOrder).toHaveBeenCalledTimes(1);

    // Resolve first
    await act(async () => {
      resolvePlacement(buildRealPlacementAnswer());
      await firstCall;
      await secondCall;
    });

    expect(result.current.placing).toBe(false);
  });

  test('7. CART_CHANGED sets matching message from orderErrorMessage, calls onStale, and reloads list', async () => {
    guestOrderService.fetchPlacedItems.mockResolvedValue([]);
    const error = {
      response: {
        status: 409,
        data: { code: 'CART_CHANGED', message: 'SERVER TEXT MUST NOT APPEAR' },
      },
    };
    guestOrderService.placeOrder.mockRejectedValueOnce(error);

    const onStale = vi.fn();
    const { result } = renderHook(() => useHostOrders({ enabled: true, onStale }));
    await act(async () => {
      await Promise.resolve();
    });

    guestOrderService.fetchPlacedItems.mockClear();

    await act(async () => {
      await result.current.place(3);
    });

    expect(result.current.error).toBe(ORDER_MESSAGES.cartChanged);
    expect(result.current.error).not.toMatch(/SERVER TEXT/);
    expect(result.current.message).toBeNull();
    expect(onStale).toHaveBeenCalledTimes(1);
    expect(guestOrderService.fetchPlacedItems).toHaveBeenCalledTimes(1);
    expect(result.current.placing).toBe(false);
  });

  test('8. NOTHING_TO_ORDER sets matching message from orderErrorMessage with reason details, calls onStale, and reloads list', async () => {
    guestOrderService.fetchPlacedItems.mockResolvedValue([]);
    const realAnswer = buildRealPlacementAnswer();
    const error = {
      response: {
        status: 409,
        data: {
          code: 'NOTHING_TO_ORDER',
          left: realAnswer.left,
          message: 'SERVER TEXT MUST NOT APPEAR',
        },
      },
    };
    guestOrderService.placeOrder.mockRejectedValueOnce(error);

    const onStale = vi.fn();
    const { result } = renderHook(() => useHostOrders({ enabled: true, onStale }));
    await act(async () => {
      await Promise.resolve();
    });

    guestOrderService.fetchPlacedItems.mockClear();

    await act(async () => {
      await result.current.place(3);
    });

    expect(result.current.error).toBe(
      'Nothing in the cart can be ordered right now (unavailable: 1, not suitable for who added it: 1)'
    );
    expect(result.current.message).toBeNull();
    expect(onStale).toHaveBeenCalledTimes(1);
    expect(guestOrderService.fetchPlacedItems).toHaveBeenCalledTimes(1);
  });

  test('9. TRY_AGAIN sets matching message, calls onStale, and reloads list', async () => {
    guestOrderService.fetchPlacedItems.mockResolvedValue([]);
    const error = {
      response: {
        status: 503,
        data: { code: 'TRY_AGAIN', message: 'SERVER TEXT MUST NOT APPEAR' },
      },
    };
    guestOrderService.placeOrder.mockRejectedValueOnce(error);

    const onStale = vi.fn();
    const { result } = renderHook(() => useHostOrders({ enabled: true, onStale }));
    await act(async () => {
      await Promise.resolve();
    });

    guestOrderService.fetchPlacedItems.mockClear();

    await act(async () => {
      await result.current.place(3);
    });

    expect(result.current.error).toBe(ORDER_MESSAGES.tryAgain);
    expect(onStale).toHaveBeenCalledTimes(1);
    expect(guestOrderService.fetchPlacedItems).toHaveBeenCalledTimes(1);
  });

  test('10. a network error sets network message and does NOT call onStale', async () => {
    guestOrderService.fetchPlacedItems.mockResolvedValue([]);
    guestOrderService.placeOrder.mockRejectedValueOnce(new Error('Network error'));

    const onStale = vi.fn();
    const { result } = renderHook(() => useHostOrders({ enabled: true, onStale }));
    await act(async () => {
      await Promise.resolve();
    });

    guestOrderService.fetchPlacedItems.mockClear();

    await act(async () => {
      await result.current.place(3);
    });

    expect(result.current.error).toBe(ORDER_MESSAGES.network);
    expect(onStale).not.toHaveBeenCalled();
    expect(guestOrderService.fetchPlacedItems).not.toHaveBeenCalled();
  });

  test('11. a 401 with an ended code sets nothing', async () => {
    guestOrderService.fetchPlacedItems.mockResolvedValue([]);
    const error = {
      response: {
        status: 401,
        data: { code: 'PARTICIPANT_REMOVED' },
      },
    };
    guestOrderService.placeOrder.mockRejectedValueOnce(error);

    const { result } = renderHook(() => useHostOrders({ enabled: true }));
    await act(async () => {
      await Promise.resolve();
    });

    await act(async () => {
      await result.current.place(3);
    });

    expect(result.current.error).toBeNull();
    expect(result.current.message).toBeNull();
  });

  test('12. cancel success reloads the list and clears error', async () => {
    const row = sampleRow(1);
    guestOrderService.fetchPlacedItems.mockResolvedValueOnce([row]);
    guestOrderService.cancelPlacedItem.mockResolvedValueOnce({ cancelled: true });

    const { result } = renderHook(() => useHostOrders({ enabled: true }));
    await act(async () => {
      await Promise.resolve();
    });

    expect(result.current.rows).toEqual([row]);

    // Next fetch returns empty
    guestOrderService.fetchPlacedItems.mockResolvedValueOnce([]);

    await act(async () => {
      await result.current.cancel(row);
    });

    expect(guestOrderService.cancelPlacedItem).toHaveBeenCalledWith(row.orderId, row.orderItemId);
    expect(result.current.rows).toEqual([]);
    expect(result.current.error).toBeNull();
    expect(result.current.cancelKey).toBeNull();
  });

  test('13. cancel of one row does not block another row, while duplicate call on same row is ignored', async () => {
    guestOrderService.fetchPlacedItems.mockResolvedValue([]);

    let resolveRow1;
    const promise1 = new Promise((resolve) => {
      resolveRow1 = resolve;
    });
    let resolveRow2;
    const promise2 = new Promise((resolve) => {
      resolveRow2 = resolve;
    });

    guestOrderService.cancelPlacedItem.mockImplementation((orderId, orderItemId) => {
      if (orderItemId === uuid(1)) return promise1;
      if (orderItemId === uuid(2)) return promise2;
      return Promise.resolve();
    });

    const row1 = sampleRow(1);
    const row2 = sampleRow(2);

    const { result } = renderHook(() => useHostOrders({ enabled: true }));
    await act(async () => {
      await Promise.resolve();
    });

    // Start row 1 cancel
    let call1;
    act(() => {
      call1 = result.current.cancel(row1);
    });
    expect(result.current.cancelKey).toBe(`${row1.orderId}:${row1.orderItemId}`);

    // Call row 1 again - should be ignored
    act(() => {
      result.current.cancel(row1);
    });
    expect(guestOrderService.cancelPlacedItem).toHaveBeenCalledTimes(1);

    // Call row 2 cancel while row 1 is still in-flight - should NOT be blocked
    let call2;
    act(() => {
      call2 = result.current.cancel(row2);
    });
    expect(guestOrderService.cancelPlacedItem).toHaveBeenCalledTimes(2);

    // Resolve both
    await act(async () => {
      resolveRow1({ cancelled: true });
      resolveRow2({ cancelled: true });
      await call1;
      await call2;
    });

    expect(result.current.cancelKey).toBeNull();
  });

  test('14. ALREADY_STARTED sets its message from orderErrorMessage and reloads list', async () => {
    const row = sampleRow(1);
    guestOrderService.fetchPlacedItems.mockResolvedValueOnce([row]);
    const error = {
      response: {
        status: 409,
        data: { code: 'ALREADY_STARTED', message: 'SERVER TEXT MUST NOT APPEAR' },
      },
    };
    guestOrderService.cancelPlacedItem.mockRejectedValueOnce(error);

    const onStale = vi.fn();
    const { result } = renderHook(() => useHostOrders({ enabled: true, onStale }));
    await act(async () => {
      await Promise.resolve();
    });

    guestOrderService.fetchPlacedItems.mockClear();

    await act(async () => {
      await result.current.cancel(row);
    });

    expect(result.current.error).toBe(ORDER_MESSAGES.alreadyStarted);
    expect(result.current.error).not.toMatch(/SERVER TEXT/);
    expect(onStale).toHaveBeenCalledTimes(1);
    expect(guestOrderService.fetchPlacedItems).toHaveBeenCalledTimes(1);
    expect(result.current.cancelKey).toBeNull();
  });

  test('15. dismiss clears both message and error', async () => {
    guestOrderService.fetchPlacedItems.mockResolvedValue([]);
    guestOrderService.placeOrder.mockRejectedValueOnce(new Error('Network error'));

    const { result } = renderHook(() => useHostOrders({ enabled: true }));
    await act(async () => {
      await Promise.resolve();
    });

    await act(async () => {
      await result.current.place(3);
    });
    expect(result.current.error).toBe(ORDER_MESSAGES.network);

    act(() => {
      result.current.dismiss();
    });

    expect(result.current.error).toBeNull();
    expect(result.current.message).toBeNull();
  });

  test('16. unmount ignores late results', async () => {
    let resolveItems;
    const fetchPromise = new Promise((resolve) => {
      resolveItems = resolve;
    });
    guestOrderService.fetchPlacedItems.mockReturnValueOnce(fetchPromise);

    const { result, unmount } = renderHook(() => useHostOrders({ enabled: true }));

    unmount();

    await act(async () => {
      resolveItems([sampleRow(1)]);
      await Promise.resolve();
    });

    expect(result.current.rows).toEqual([]);
  });

  test('17. changing a callback or non-function callback does not break anything', async () => {
    guestOrderService.fetchPlacedItems.mockResolvedValue([]);
    const realAnswer = buildRealPlacementAnswer();
    guestOrderService.placeOrder.mockResolvedValue(realAnswer);

    let callback1 = vi.fn();
    const { result, rerender } = renderHook(
      ({ onCartApplied }) => useHostOrders({ enabled: true, onCartApplied, onStale: null }),
      { initialProps: { onCartApplied: callback1 } }
    );
    await act(async () => {
      await Promise.resolve();
    });

    let callback2 = vi.fn();
    rerender({ onCartApplied: callback2 });

    await act(async () => {
      await result.current.place(3);
    });

    expect(callback1).not.toHaveBeenCalled();
    expect(callback2).toHaveBeenCalledWith(realAnswer.cart);

    // Non-function callback stub (e.g. from existing test)
    rerender({ onCartApplied: undefined });
    await act(async () => {
      await result.current.place(4);
    });
    expect(result.current.message).toBeTruthy();
  });
});
