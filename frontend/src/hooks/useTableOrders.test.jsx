// useTableOrders.test.jsx: Unit tests for table order history hook
import { describe, test, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { orderHistoryView } from '../../../backend/utils/orderHistory.js';
import { freezeOrderItem } from '../../../backend/utils/orderRules.js';
import { useTableOrders } from './useTableOrders.js';
import { fetchTableOrders } from '../services/guestOrderService.js';
import { emptyHistory, HISTORY_MESSAGES } from '../utils/tableOrders.js';

vi.mock('../services/guestOrderService.js');

const uuid = (n) => `00000000-0000-4000-8000-0000000000${String(n).padStart(2, '0')}`;
const ID = { a: 'a'.repeat(24), b: 'b'.repeat(24), c: 'c'.repeat(24), o1: '1'.repeat(24), o2: '2'.repeat(24) };
const item = (n, dishId, name, qty, orderedBy, over = {}) => ({
  ...freezeOrderItem({ line: { qty }, dish: { _id: dishId, name, price: 250, allergens: [] }, adder: { nickname: orderedBy }, orderItemId: uuid(n) }),
  ...over,
});
const order = (id, createdAt, items) => ({ _id: id, createdAt, items });
const T1 = '2026-10-14T13:42:00.000Z';
const T2 = '2026-10-14T14:05:00.000Z';

const REAL1 = orderHistoryView([
  order(ID.o1, T1, [item(1, ID.a, 'Hibiscus Rose Cooler', 2, 'Hema')]),
]);

const REAL2 = orderHistoryView([
  order(ID.o1, T1, [item(1, ID.a, 'Hibiscus Rose Cooler', 2, 'Hema')]),
  order(ID.o2, T2, [item(2, ID.b, 'Kesar Badam Milkshake', 1, 'Bala')]),
]);

describe('useTableOrders', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test('1. nothing while disabled', () => {
    fetchTableOrders.mockResolvedValue(REAL1);
    const { result } = renderHook(() => useTableOrders({ enabled: false }));

    expect(fetchTableOrders).not.toHaveBeenCalled();
    expect(result.current.history).toEqual(emptyHistory());
    expect(result.current.loaded).toBe(false);
    expect(result.current.error).toBeNull();
  });

  test('2. one load when enabled', async () => {
    fetchTableOrders.mockResolvedValueOnce(REAL1);
    const { result } = renderHook(() => useTableOrders({ enabled: true }));

    await act(async () => {
      await Promise.resolve();
    });

    expect(fetchTableOrders).toHaveBeenCalledTimes(1);
    expect(result.current.loaded).toBe(true);
    expect(result.current.history).toEqual(REAL1);
    expect(result.current.error).toBeNull();
  });

  test('3. the answer is sanitized (feed it a junk row and a wrong total from a hand-edited copy of a REAL answer)', async () => {
    const tampered = {
      orders: [
        {
          id: ID.o1,
          placedAt: T1,
          items: [
            ...REAL1.orders[0].items,
            { id: '', name: 'junk', qty: 1 },
          ],
        },
      ],
      totals: { dishes: 999, items: 999 },
    };
    fetchTableOrders.mockResolvedValueOnce(tampered);

    const { result } = renderHook(() => useTableOrders({ enabled: true }));

    await act(async () => {
      await Promise.resolve();
    });

    expect(result.current.history).toEqual(REAL1);
    expect(result.current.history.totals).toEqual({ dishes: 1, items: 2 });
  });

  test('4. a load during a load gives exactly one more', async () => {
    let resolveFirst;
    const firstPromise = new Promise((res) => {
      resolveFirst = res;
    });

    fetchTableOrders.mockReturnValueOnce(firstPromise);

    const { result } = renderHook(() => useTableOrders({ enabled: true }));
    expect(fetchTableOrders).toHaveBeenCalledTimes(1);

    act(() => {
      result.current.load();
      result.current.load();
    });

    expect(fetchTableOrders).toHaveBeenCalledTimes(1);

    fetchTableOrders.mockResolvedValueOnce(REAL2);

    await act(async () => {
      resolveFirst(REAL1);
      await Promise.resolve();
    });

    expect(fetchTableOrders).toHaveBeenCalledTimes(2);
    expect(result.current.history).toEqual(REAL2);
  });

  test('5. a late older answer never replaces a newer one', async () => {
    let resolveOlder;
    let resolveNewer;

    const olderPromise = new Promise((res) => {
      resolveOlder = res;
    });
    const newerPromise = new Promise((res) => {
      resolveNewer = res;
    });

    fetchTableOrders.mockReturnValueOnce(olderPromise);

    const { result } = renderHook(() => useTableOrders({ enabled: true }));
    expect(fetchTableOrders).toHaveBeenCalledTimes(1);

    act(() => {
      result.current.load();
    });

    fetchTableOrders.mockReturnValueOnce(newerPromise);

    await act(async () => {
      resolveNewer(REAL2);
      await Promise.resolve();
    });

    await act(async () => {
      resolveOlder(REAL1);
      await Promise.resolve();
    });

    expect(result.current.history).toEqual(REAL2);
  });

  test('6. a failure keeps the old history', async () => {
    fetchTableOrders.mockResolvedValueOnce(REAL1);
    const { result } = renderHook(() => useTableOrders({ enabled: true }));

    await act(async () => {
      await Promise.resolve();
    });
    expect(result.current.history).toEqual(REAL1);

    fetchTableOrders.mockRejectedValueOnce(new Error('Network error'));

    await act(async () => {
      result.current.load();
      await Promise.resolve();
    });

    expect(result.current.history).toEqual(REAL1);
    expect(result.current.loaded).toBe(true);
    expect(result.current.error).toBeNull();
  });

  test('7. a first failure sets the network message and not the server text', async () => {
    fetchTableOrders.mockRejectedValueOnce({
      response: { status: 500, data: { message: 'SECRET_DB_ERROR_MESSAGE' } },
    });

    const { result } = renderHook(() => useTableOrders({ enabled: true }));

    await act(async () => {
      await Promise.resolve();
    });

    expect(result.current.loaded).toBe(false);
    expect(result.current.error).toBe(HISTORY_MESSAGES.generic);
    expect(result.current.error).not.toMatch(/SECRET_DB_ERROR_MESSAGE/);
    expect(result.current.history).toEqual(emptyHistory());
  });

  test('8. a later success clears the error', async () => {
    fetchTableOrders.mockRejectedValueOnce(new Error('Network error'));

    const { result } = renderHook(() => useTableOrders({ enabled: true }));

    await act(async () => {
      await Promise.resolve();
    });

    expect(result.current.error).toBe(HISTORY_MESSAGES.network);
    expect(result.current.loaded).toBe(false);

    fetchTableOrders.mockResolvedValueOnce(REAL1);

    await act(async () => {
      result.current.load();
      await Promise.resolve();
    });

    expect(result.current.error).toBeNull();
    expect(result.current.loaded).toBe(true);
    expect(result.current.history).toEqual(REAL1);
  });

  test('9. an ended-code 401 sets nothing', async () => {
    for (const code of ['SESSION_CLOSED', 'PARTICIPANT_REMOVED', 'INVALID_TOKEN']) {
      fetchTableOrders.mockRejectedValueOnce({
        response: { status: 401, data: { code, message: 'Ended' } },
      });

      const { result } = renderHook(() => useTableOrders({ enabled: true }));

      await act(async () => {
        await Promise.resolve();
      });

      expect(result.current.error).toBeNull();
      expect(result.current.loaded).toBe(false);
      expect(result.current.history).toEqual(emptyHistory());
    }
  });

  test('10. unmount ignores a late answer', async () => {
    let resolveLate;
    const latePromise = new Promise((res) => {
      resolveLate = res;
    });

    fetchTableOrders.mockReturnValueOnce(latePromise);

    const { unmount } = renderHook(() => useTableOrders({ enabled: true }));

    unmount();

    await act(async () => {
      resolveLate(REAL1);
      await Promise.resolve();
    });
  });

  test('11. enabled turning false then true loads again', async () => {
    fetchTableOrders.mockResolvedValue(REAL1);

    const { rerender } = renderHook(({ enabled }) => useTableOrders({ enabled }), {
      initialProps: { enabled: false },
    });

    expect(fetchTableOrders).not.toHaveBeenCalled();

    rerender({ enabled: true });
    await act(async () => {
      await Promise.resolve();
    });
    expect(fetchTableOrders).toHaveBeenCalledTimes(1);

    rerender({ enabled: false });
    expect(fetchTableOrders).toHaveBeenCalledTimes(1);

    rerender({ enabled: true });
    await act(async () => {
      await Promise.resolve();
    });
    expect(fetchTableOrders).toHaveBeenCalledTimes(2);
  });
});
