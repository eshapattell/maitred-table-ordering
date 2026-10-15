// useKitchenBoard.test.jsx: unit tests for useKitchenBoard hook
import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, act, cleanup } from '@testing-library/react';
import { useKitchenBoard } from './useKitchenBoard.js';
import { fetchActiveOrders, updateDishStatus } from '../services/orderService.js';
import { kitchenOrderView } from '../../../backend/utils/orderRules.js';
import { KITCHEN_EVENTS, BOARD_MESSAGES } from '../utils/kitchenBoard.js';

// Fake socket recipe via vi.hoisted
const { fakeSocket, resetFakeSocket } = vi.hoisted(() => {
  const handlers = new Map();
  const socket = {
    handlers,
    on: vi.fn((event, fn) => {
      if (!handlers.has(event)) handlers.set(event, []);
      handlers.get(event).push(fn);
    }),
    off: vi.fn((event, fn) => {
      if (!handlers.has(event)) return;
      handlers.set(event, handlers.get(event).filter((h) => h !== fn));
    }),
    emit: vi.fn(),
    disconnect: vi.fn(),
    trigger: (event, payload) => {
      const list = handlers.get(event) || [];
      for (const fn of [...list]) {
        fn(payload);
      }
    },
  };
  const reset = () => {
    handlers.clear();
    socket.on.mockClear();
    socket.off.mockClear();
    socket.emit.mockClear();
    socket.disconnect.mockClear();
  };
  return { fakeSocket: socket, resetFakeSocket: reset };
});

vi.mock('../services/kitchenSocket.js', () => ({
  connectKitchen: vi.fn(() => fakeSocket),
}));

vi.mock('../services/orderService.js', () => ({
  fetchActiveOrders: vi.fn(),
  updateDishStatus: vi.fn(),
}));

// Real ticket fixtures using backend's kitchenOrderView
const uuid = (n) => `00000000-0000-4000-8000-0000000000${String(n).padStart(2, '0')}`;
const dishRow = (n, name, qty, orderedBy, status, flags = []) => ({
  orderItemId: uuid(n),
  itemId: 'a'.repeat(24),
  name,
  price: 250,
  qty,
  orderedBy,
  allergyFlags: flags,
  status,
  isSurprise: false,
  revealed: false,
});
const makeTicket = (id, createdAt, items, tableAllergies = [], tableNumber = 4) =>
  kitchenOrderView({
    _id: id.repeat(24),
    sessionId: 'b'.repeat(24),
    restaurantId: 'c'.repeat(24),
    tableNumber,
    createdAt,
    items,
    tableAllergies,
    status: 'placed',
  });

const T1 = makeTicket('1', '2026-10-14T13:42:00.000Z', [
  dishRow(1, 'Tomato Soup', 2, 'Bala', 'placed', ['dairy']),
  dishRow(2, 'Cake', 1, 'Asha', 'ready'),
]);
const T2 = makeTicket('2', '2026-10-14T13:30:00.000Z', [dishRow(3, 'Soup', 1, 'Dev', 'placed')], [], 7);
const T3 = makeTicket('3', '2026-10-14T13:50:00.000Z', [dishRow(4, 'Wine', 1, 'Dev', 'placed')], [], 2);

describe('useKitchenBoard', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    resetFakeSocket();
    vi.clearAllMocks();
    fetchActiveOrders.mockResolvedValue([T1, T2]);
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    Object.defineProperty(document, 'hidden', { configurable: true, value: false });
  });

  test('1. nothing happens while disabled', async () => {
    const { result } = renderHook(() => useKitchenBoard({ enabled: false }));

    expect(fetchActiveOrders).not.toHaveBeenCalled();
    expect(result.current.status).toBe('loading');
    expect(result.current.orders).toEqual([]);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(60000);
    });
    expect(fetchActiveOrders).not.toHaveBeenCalled();
  });

  test('2. the first fetch and the sorting', async () => {
    fetchActiveOrders.mockResolvedValue([T1, T3, T2]);
    const { result } = renderHook(() => useKitchenBoard());

    expect(result.current.status).toBe('loading');
    expect(result.current.orders).toEqual([]);

    await act(async () => {
      await Promise.resolve();
    });

    expect(result.current.status).toBe('ready');
    // Sorted oldest first: T2 (13:30), T1 (13:42), T3 (13:50)
    expect(result.current.orders.map((o) => o.id)).toEqual([T2.id, T1.id, T3.id]);
  });

  test('3. status "error" on a first failure', async () => {
    fetchActiveOrders.mockRejectedValue(new Error('Network error'));
    const { result } = renderHook(() => useKitchenBoard());

    expect(result.current.status).toBe('loading');

    await act(async () => {
      await Promise.resolve();
    });

    expect(result.current.status).toBe('error');
    expect(result.current.orders).toEqual([]);
  });

  test('4. a failed refresh keeps the board', async () => {
    fetchActiveOrders.mockResolvedValueOnce([T1]);
    const { result } = renderHook(() => useKitchenBoard());

    await act(async () => {
      await Promise.resolve();
    });
    expect(result.current.status).toBe('ready');
    expect(result.current.orders).toHaveLength(1);

    // Subsequent refresh fails
    fetchActiveOrders.mockRejectedValueOnce(new Error('Network error'));
    await act(async () => {
      result.current.refresh();
      await Promise.resolve();
    });

    expect(result.current.status).toBe('ready');
    expect(result.current.orders).toHaveLength(1);
    expect(result.current.error).toBeNull();
  });

  test('5. a ping during a fetch gives exactly one more fetch', async () => {
    let resolveFirst;
    const firstPromise = new Promise((resolve) => {
      resolveFirst = resolve;
    });

    fetchActiveOrders.mockReturnValueOnce(firstPromise);

    renderHook(() => useKitchenBoard());
    expect(fetchActiveOrders).toHaveBeenCalledTimes(1);

    // Socket orders ping arrives during first fetch
    act(() => {
      fakeSocket.trigger(KITCHEN_EVENTS.ORDERS_CHANGED, {});
    });

    // Another orders ping arrives during first fetch
    act(() => {
      fakeSocket.trigger(KITCHEN_EVENTS.ORDERS_CHANGED, {});
    });

    // Still only 1 call while in-flight
    expect(fetchActiveOrders).toHaveBeenCalledTimes(1);

    // Setup return value for second fetch
    fetchActiveOrders.mockResolvedValueOnce([T1]);

    // Resolve first fetch
    await act(async () => {
      resolveFirst([T2]);
      await Promise.resolve();
    });

    // Second fetch ran exactly once more
    expect(fetchActiveOrders).toHaveBeenCalledTimes(2);
  });

  test('6. a late older answer never replaces a newer one', async () => {
    let resolveOlder;
    let resolveNewer;

    const olderPromise = new Promise((resolve) => {
      resolveOlder = resolve;
    });
    const newerPromise = new Promise((resolve) => {
      resolveNewer = resolve;
    });

    fetchActiveOrders.mockReturnValueOnce(olderPromise);

    const { result } = renderHook(() => useKitchenBoard());
    expect(fetchActiveOrders).toHaveBeenCalledTimes(1);

    // Trigger refresh while older is in flight
    act(() => {
      result.current.refresh();
    });

    fetchActiveOrders.mockReturnValueOnce(newerPromise);

    // Resolve newer first
    await act(async () => {
      resolveNewer([T3]);
      await Promise.resolve();
    });

    // Resolve older late
    await act(async () => {
      resolveOlder([T1]);
      await Promise.resolve();
    });

    // Older answer (T1) did not replace newer answer (T3)
    expect(result.current.orders.map((o) => o.id)).toEqual([T3.id]);
  });

  test('7. moveDish success replaces the ticket', async () => {
    fetchActiveOrders.mockResolvedValueOnce([T1]);
    const { result } = renderHook(() => useKitchenBoard());

    await act(async () => {
      await Promise.resolve();
    });

    const updatedT1 = makeTicket('1', '2026-10-14T13:42:00.000Z', [
      dishRow(1, 'Tomato Soup', 2, 'Bala', 'preparing', ['dairy']),
      dishRow(2, 'Cake', 1, 'Asha', 'ready'),
    ]);
    updateDishStatus.mockResolvedValueOnce(updatedT1);

    await act(async () => {
      await result.current.moveDish(T1.id, uuid(1), 'preparing');
    });

    expect(updateDishStatus).toHaveBeenCalledWith(T1.id, uuid(1), 'preparing');
    const orderInState = result.current.orders.find((o) => o.id === T1.id);
    expect(orderInState.items[0].status).toBe('preparing');
    expect(result.current.error).toBeNull();
  });

  test('8. moveDish removes a ticket whose last open dish was served', async () => {
    const singleDishOrder = makeTicket('1', '2026-10-14T13:42:00.000Z', [
      dishRow(1, 'Tomato Soup', 2, 'Bala', 'ready'),
    ]);
    fetchActiveOrders.mockResolvedValueOnce([singleDishOrder]);
    const { result } = renderHook(() => useKitchenBoard());

    await act(async () => {
      await Promise.resolve();
    });
    expect(result.current.orders).toHaveLength(1);

    // Finished ticket (all dishes served)
    const finishedOrder = makeTicket('1', '2026-10-14T13:42:00.000Z', [
      dishRow(1, 'Tomato Soup', 2, 'Bala', 'served'),
    ]);
    updateDishStatus.mockResolvedValueOnce(finishedOrder);

    await act(async () => {
      await result.current.moveDish(singleDishOrder.id, uuid(1), 'served');
    });

    // The finished ticket leaves the board
    expect(result.current.orders).toHaveLength(0);
  });

  test('9. a busy dish ignores a second press while another dish still works', async () => {
    fetchActiveOrders.mockResolvedValueOnce([T1]);
    const { result } = renderHook(() => useKitchenBoard());

    await act(async () => {
      await Promise.resolve();
    });

    let resolveDish1;
    const dish1Promise = new Promise((resolve) => {
      resolveDish1 = resolve;
    });
    updateDishStatus.mockReturnValueOnce(dish1Promise);

    // First press on dish 1
    let p1;
    act(() => {
      p1 = result.current.moveDish(T1.id, uuid(1), 'preparing');
    });

    expect(result.current.busyKey).toBe(`${T1.id}:${uuid(1)}`);

    // Second press on dish 1 while still busy
    act(() => {
      result.current.moveDish(T1.id, uuid(1), 'preparing');
    });

    // updateDishStatus only called once for dish 1
    expect(updateDishStatus).toHaveBeenCalledTimes(1);

    // Another dish (dish 2) can still be moved
    updateDishStatus.mockResolvedValueOnce(T1);
    await act(async () => {
      await result.current.moveDish(T1.id, uuid(2), 'served');
    });
    expect(updateDishStatus).toHaveBeenCalledTimes(2);

    // Complete dish 1
    await act(async () => {
      resolveDish1(T1);
      await p1;
    });

    expect(result.current.busyKey).toBeNull();
  });

  test('10. INVALID_MOVE sets the "dish moved on" message and refreshes', async () => {
    fetchActiveOrders.mockResolvedValue([T1]);
    const { result } = renderHook(() => useKitchenBoard());

    await act(async () => {
      await Promise.resolve();
    });

    const error409 = {
      response: {
        status: 409,
        data: { code: 'INVALID_MOVE', message: 'SERVER ERROR TEXT' },
      },
    };
    updateDishStatus.mockRejectedValueOnce(error409);

    fetchActiveOrders.mockClear();

    await act(async () => {
      await result.current.moveDish(T1.id, uuid(1), 'ready');
    });

    expect(result.current.error).toBe(BOARD_MESSAGES.dishMoved);
    expect(result.current.error).toBe('That dish has already moved on');
    // Stale error triggers refresh
    expect(fetchActiveOrders).toHaveBeenCalledTimes(1);
  });

  test('11. a network error sets the network message and does NOT refresh', async () => {
    fetchActiveOrders.mockResolvedValue([T1]);
    const { result } = renderHook(() => useKitchenBoard());

    await act(async () => {
      await Promise.resolve();
    });

    updateDishStatus.mockRejectedValueOnce(new Error('Network error'));
    fetchActiveOrders.mockClear();

    await act(async () => {
      await result.current.moveDish(T1.id, uuid(1), 'preparing');
    });

    expect(result.current.error).toBe(BOARD_MESSAGES.network);
    expect(fetchActiveOrders).not.toHaveBeenCalled();
  });

  test('12. a 401 sets no message', async () => {
    fetchActiveOrders.mockResolvedValue([T1]);
    const { result } = renderHook(() => useKitchenBoard());

    await act(async () => {
      await Promise.resolve();
    });

    const error401 = {
      response: {
        status: 401,
        data: { message: 'Not authorised' },
      },
    };
    updateDishStatus.mockRejectedValueOnce(error401);

    await act(async () => {
      await result.current.moveDish(T1.id, uuid(1), 'preparing');
    });

    expect(result.current.error).toBeNull();
  });

  test('13. success clears an earlier error', async () => {
    fetchActiveOrders.mockResolvedValue([T1]);
    const { result } = renderHook(() => useKitchenBoard());

    await act(async () => {
      await Promise.resolve();
    });

    // Trigger an error first
    updateDishStatus.mockRejectedValueOnce(new Error('Network error'));
    await act(async () => {
      await result.current.moveDish(T1.id, uuid(1), 'preparing');
    });
    expect(result.current.error).toBe(BOARD_MESSAGES.network);

    // Now succeed on next move
    updateDishStatus.mockResolvedValueOnce(T1);
    await act(async () => {
      await result.current.moveDish(T1.id, uuid(1), 'preparing');
    });

    expect(result.current.error).toBeNull();
  });

  test('14. the poll is 30000 ms after connect and 5000 ms after a disconnect', async () => {
    fetchActiveOrders.mockResolvedValue([T1]);
    const { result } = renderHook(() => useKitchenBoard());

    await act(async () => {
      await Promise.resolve();
    });
    expect(fetchActiveOrders).toHaveBeenCalledTimes(1);

    // Initial state is connecting/disconnected -> 5000 ms poll
    fetchActiveOrders.mockClear();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(4999);
    });
    expect(fetchActiveOrders).not.toHaveBeenCalled();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });
    expect(fetchActiveOrders).toHaveBeenCalledTimes(1);

    // Connect -> live -> 30000 ms poll
    fetchActiveOrders.mockClear();
    act(() => {
      fakeSocket.trigger('connect');
    });
    expect(result.current.liveState).toBe('live');
    // connect triggers refetch
    expect(fetchActiveOrders).toHaveBeenCalledTimes(1);
    fetchActiveOrders.mockClear();

    // 5000 ms passes -> no fetch (live poll is 30000 ms)
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
    });
    expect(fetchActiveOrders).not.toHaveBeenCalled();

    // Remaining 25000 ms passes -> total 30000 ms -> fetch occurs
    await act(async () => {
      await vi.advanceTimersByTimeAsync(25000);
    });
    expect(fetchActiveOrders).toHaveBeenCalledTimes(1);

    // Disconnect -> fallback to 5000 ms
    fetchActiveOrders.mockClear();
    act(() => {
      fakeSocket.trigger('disconnect');
    });
    expect(result.current.liveState).toBe('reconnecting');

    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
    });
    expect(fetchActiveOrders).toHaveBeenCalledTimes(1);
  });

  test('15. focus event refreshes the board', async () => {
    fetchActiveOrders.mockResolvedValue([T1]);
    renderHook(() => useKitchenBoard());

    await act(async () => {
      await Promise.resolve();
    });
    fetchActiveOrders.mockClear();

    act(() => {
      window.dispatchEvent(new Event('focus'));
    });

    expect(fetchActiveOrders).toHaveBeenCalledTimes(1);
  });

  test('16. online event refreshes the board', async () => {
    fetchActiveOrders.mockResolvedValue([T1]);
    renderHook(() => useKitchenBoard());

    await act(async () => {
      await Promise.resolve();
    });
    fetchActiveOrders.mockClear();

    act(() => {
      window.dispatchEvent(new Event('online'));
    });

    expect(fetchActiveOrders).toHaveBeenCalledTimes(1);
  });

  test('17. visible refreshes the board', async () => {
    fetchActiveOrders.mockResolvedValue([T1]);
    renderHook(() => useKitchenBoard());

    await act(async () => {
      await Promise.resolve();
    });
    fetchActiveOrders.mockClear();

    // Becomes visible
    Object.defineProperty(document, 'hidden', { configurable: true, value: false });
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'));
    });

    expect(fetchActiveOrders).toHaveBeenCalledTimes(1);
  });

  test('18. hidden pauses the chain', async () => {
    fetchActiveOrders.mockResolvedValue([T1]);
    renderHook(() => useKitchenBoard());

    await act(async () => {
      await Promise.resolve();
    });
    fetchActiveOrders.mockClear();

    // Document hidden
    Object.defineProperty(document, 'hidden', { configurable: true, value: true });
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'));
    });

    // Advance 60 seconds
    await act(async () => {
      await vi.advanceTimersByTimeAsync(60000);
    });

    expect(fetchActiveOrders).not.toHaveBeenCalled();
  });

  test('19. unmount removes everything', async () => {
    fetchActiveOrders.mockResolvedValue([T1]);
    const { unmount } = renderHook(() => useKitchenBoard());

    await act(async () => {
      await Promise.resolve();
    });

    unmount();

    expect(fakeSocket.disconnect).toHaveBeenCalled();
    fetchActiveOrders.mockClear();

    // Timer and event triggers after unmount do nothing
    await act(async () => {
      await vi.advanceTimersByTimeAsync(60000);
    });
    expect(fetchActiveOrders).not.toHaveBeenCalled();

    act(() => {
      window.dispatchEvent(new Event('focus'));
    });
    expect(fetchActiveOrders).not.toHaveBeenCalled();
  });
});
