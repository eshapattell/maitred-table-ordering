// KitchenDashboard.test.jsx: unit and integration tests for KitchenDashboard page
import React from 'react';
import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, cleanup, act, fireEvent, within } from '@testing-library/react';
import KitchenDashboard from './KitchenDashboard.jsx';
import { fetchActiveOrders, updateDishStatus } from '../services/orderService.js';
import { kitchenOrderView } from '../../../backend/utils/orderRules.js';
import { KITCHEN_EVENTS, BOARD_MESSAGES } from '../utils/kitchenBoard.js';
import { MESSAGES } from '../utils/messages.js';

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

describe('KitchenDashboard component', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    resetFakeSocket();
    vi.clearAllMocks();
  });

  afterEach(async () => {
    cleanup();
    vi.useRealTimers();
    Object.defineProperty(document, 'hidden', { value: false, writable: true, configurable: true });
  });

  test('1. renders the loader while orders are loading', async () => {
    fetchActiveOrders.mockReturnValue(new Promise(() => {}));

    render(<KitchenDashboard />);

    expect(screen.getByRole('heading', { level: 1, name: MESSAGES.kitchen.boardTitle })).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent(MESSAGES.common.loading);
  });

  test('2. renders error screen and Try again button on initial failure, and clicking Try again retries', async () => {
    fetchActiveOrders.mockRejectedValueOnce(new Error('Network error'));

    render(<KitchenDashboard />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(screen.getByRole('alert')).toHaveTextContent(MESSAGES.kitchen.loadFailed);
    const retryBtn = screen.getByRole('button', { name: MESSAGES.kitchen.retry });
    expect(retryBtn).toBeInTheDocument();

    const t1 = makeTicket('1', '2026-10-14T13:42:00.000Z', [dishRow(1, 'Soup', 1, 'Dev', 'placed')]);
    fetchActiveOrders.mockResolvedValueOnce([t1]);

    await act(async () => {
      fireEvent.click(retryBtn);
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(screen.queryByText(MESSAGES.kitchen.loadFailed)).not.toBeInTheDocument();
    expect(screen.getByText('Table 4')).toBeInTheDocument();
  });

  test('3. renders the empty state when ready and there are no orders', async () => {
    fetchActiveOrders.mockResolvedValueOnce([]);

    render(<KitchenDashboard />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(screen.getByText(MESSAGES.kitchen.empty)).toBeInTheDocument();
    expect(screen.getByText(MESSAGES.kitchen.summary(0, 0))).toBeInTheDocument();
  });

  test('4. renders tickets sorted oldest first', async () => {
    const older = makeTicket('1', '2026-10-14T13:20:00.000Z', [dishRow(1, 'Soup', 1, 'Dev', 'placed')], [], 3);
    const newer = makeTicket('2', '2026-10-14T13:40:00.000Z', [dishRow(2, 'Salad', 1, 'Asha', 'placed')], [], 5);
    // Server returns newer first
    fetchActiveOrders.mockResolvedValueOnce([newer, older]);

    render(<KitchenDashboard />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    const headings = screen.getAllByRole('heading', { level: 2 });
    expect(headings[0]).toHaveTextContent('Table 3');
    expect(headings[1]).toHaveTextContent('Table 5');
  });

  test('5. displays the summary line correctly for orders and open dishes', async () => {
    const t1 = makeTicket('1', '2026-10-14T13:20:00.000Z', [
      dishRow(1, 'Soup', 1, 'Dev', 'placed'),
      dishRow(2, 'Tea', 1, 'Dev', 'served'), // served is not open
    ]);
    const t2 = makeTicket('2', '2026-10-14T13:30:00.000Z', [
      dishRow(3, 'Pasta', 2, 'Asha', 'preparing'),
    ]);
    fetchActiveOrders.mockResolvedValueOnce([t1, t2]);

    render(<KitchenDashboard />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    // 2 orders, 2 open dishes
    expect(screen.getByText(MESSAGES.kitchen.summary(2, 2))).toBeInTheDocument();
  });

  test('6. displays the allergy banner on the right tickets only', async () => {
    const tAllergic = makeTicket(
      '1',
      '2026-10-14T13:20:00.000Z',
      [dishRow(1, 'Soup', 1, 'Dev', 'placed')],
      [{ nickname: 'Dev', allergies: ['gluten'] }],
      1
    );
    const tNoAllergy = makeTicket(
      '2',
      '2026-10-14T13:30:00.000Z',
      [dishRow(2, 'Salad', 1, 'Asha', 'placed')],
      [],
      2
    );
    fetchActiveOrders.mockResolvedValueOnce([tAllergic, tNoAllergy]);

    render(<KitchenDashboard />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    const allergyNotes = screen.getAllByRole('note');
    expect(allergyNotes).toHaveLength(1);
    expect(within(allergyNotes[0]).getByText('Dev: gluten')).toBeInTheDocument();
  });

  test('7. pressing Start then Mark ready then Mark served calls updateDishStatus with right ids and statuses, and ticket leaves board when last dish served', async () => {
    const tInitial = makeTicket('1', '2026-10-14T13:20:00.000Z', [dishRow(1, 'Soup', 1, 'Dev', 'placed')]);
    fetchActiveOrders.mockResolvedValueOnce([tInitial]);

    render(<KitchenDashboard />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    // 1. Press Start
    const tPreparing = makeTicket('1', '2026-10-14T13:20:00.000Z', [dishRow(1, 'Soup', 1, 'Dev', 'preparing')]);
    updateDishStatus.mockResolvedValueOnce(tPreparing);

    const startBtn = screen.getByRole('button', { name: MESSAGES.kitchen.actionStartAria('Soup') });
    await act(async () => {
      fireEvent.click(startBtn);
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(updateDishStatus).toHaveBeenCalledWith(tInitial.id, tInitial.items[0].id, 'preparing');

    // 2. Press Mark ready
    const tReady = makeTicket('1', '2026-10-14T13:20:00.000Z', [dishRow(1, 'Soup', 1, 'Dev', 'ready')]);
    updateDishStatus.mockResolvedValueOnce(tReady);

    const readyBtn = screen.getByRole('button', { name: MESSAGES.kitchen.actionReadyAria('Soup') });
    await act(async () => {
      fireEvent.click(readyBtn);
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(updateDishStatus).toHaveBeenCalledWith(tInitial.id, tInitial.items[0].id, 'ready');

    // 3. Press Mark served
    const tServed = makeTicket('1', '2026-10-14T13:20:00.000Z', [dishRow(1, 'Soup', 1, 'Dev', 'served')]);
    updateDishStatus.mockResolvedValueOnce(tServed);

    const servedBtn = screen.getByRole('button', { name: MESSAGES.kitchen.actionServedAria('Soup') });
    await act(async () => {
      fireEvent.click(servedBtn);
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(updateDishStatus).toHaveBeenCalledWith(tInitial.id, tInitial.items[0].id, 'served');

    // Ticket had only 1 dish, which is now served -> ticket leaves board!
    expect(screen.queryByText('Table 4')).not.toBeInTheDocument();
    expect(screen.getByText(MESSAGES.kitchen.empty)).toBeInTheDocument();
  });

  test('8. Cancel opens the dialog focused on "Keep dish"', async () => {
    const t1 = makeTicket('1', '2026-10-14T13:20:00.000Z', [dishRow(1, 'Soup', 1, 'Dev', 'placed')]);
    fetchActiveOrders.mockResolvedValueOnce([t1]);

    render(<KitchenDashboard />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    const cancelBtn = screen.getByRole('button', { name: MESSAGES.kitchen.cancelDishAria('Soup') });
    await act(async () => {
      fireEvent.click(cancelBtn);
      await vi.advanceTimersByTimeAsync(0);
    });

    const dialog = screen.getByRole('dialog');
    expect(dialog).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2, name: MESSAGES.kitchen.cancelTitle })).toBeInTheDocument();
    expect(screen.getByText(MESSAGES.kitchen.cancelBody('Soup'))).toBeInTheDocument();

    const keepBtn = screen.getByRole('button', { name: MESSAGES.kitchen.cancelKeep });
    expect(keepBtn).toHaveAttribute('data-autofocus', 'true');
    expect(document.activeElement).toBe(keepBtn);
  });

  test('9. confirming cancels calls moveDish with "cancelled", and keeping does nothing', async () => {
    const t1 = makeTicket('1', '2026-10-14T13:20:00.000Z', [dishRow(1, 'Soup', 1, 'Dev', 'placed')]);
    fetchActiveOrders.mockResolvedValueOnce([t1]);

    render(<KitchenDashboard />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    // Open cancel modal
    const cancelBtn = screen.getByRole('button', { name: MESSAGES.kitchen.cancelDishAria('Soup') });
    await act(async () => {
      fireEvent.click(cancelBtn);
      await vi.advanceTimersByTimeAsync(0);
    });

    // Click "Keep dish"
    const keepBtn = screen.getByRole('button', { name: MESSAGES.kitchen.cancelKeep });
    await act(async () => {
      fireEvent.click(keepBtn);
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(updateDishStatus).not.toHaveBeenCalled();

    // Open cancel modal again
    await act(async () => {
      fireEvent.click(cancelBtn);
      await vi.advanceTimersByTimeAsync(0);
    });

    const tCancelled = makeTicket('1', '2026-10-14T13:20:00.000Z', [dishRow(1, 'Soup', 1, 'Dev', 'cancelled')]);
    updateDishStatus.mockResolvedValueOnce(tCancelled);

    const confirmCancelBtn = screen.getByRole('button', { name: MESSAGES.kitchen.cancelConfirm });
    await act(async () => {
      fireEvent.click(confirmCancelBtn);
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(updateDishStatus).toHaveBeenCalledWith(t1.id, t1.items[0].id, 'cancelled');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  test('10. an INVALID_MOVE answer shows the "already moved on" message and refreshes', async () => {
    const t1 = makeTicket('1', '2026-10-14T13:20:00.000Z', [dishRow(1, 'Soup', 1, 'Dev', 'placed')]);
    fetchActiveOrders.mockResolvedValueOnce([t1]);

    render(<KitchenDashboard />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    const err = new Error('Conflict');
    err.response = { status: 409, data: { code: 'INVALID_MOVE' } };
    updateDishStatus.mockRejectedValueOnce(err);

    const tUpdated = makeTicket('1', '2026-10-14T13:20:00.000Z', [dishRow(1, 'Soup', 1, 'Dev', 'preparing')]);
    fetchActiveOrders.mockResolvedValueOnce([tUpdated]);

    const startBtn = screen.getByRole('button', { name: MESSAGES.kitchen.actionStartAria('Soup') });
    await act(async () => {
      fireEvent.click(startBtn);
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(screen.getByRole('alert')).toHaveTextContent(BOARD_MESSAGES.dishMoved);
    // Verified that refresh was called and new state is rendered
    expect(screen.getByRole('button', { name: MESSAGES.kitchen.actionReadyAria('Soup') })).toBeInTheDocument();
  });

  test('11. a live orders ping fetches once and a new ticket appears', async () => {
    const t1 = makeTicket('1', '2026-10-14T13:20:00.000Z', [dishRow(1, 'Soup', 1, 'Dev', 'placed')], [], 3);
    fetchActiveOrders.mockResolvedValueOnce([t1]);

    render(<KitchenDashboard />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(screen.getByText('Table 3')).toBeInTheDocument();
    expect(screen.queryByText('Table 8')).not.toBeInTheDocument();

    const t2 = makeTicket('2', '2026-10-14T13:25:00.000Z', [dishRow(2, 'Bread', 1, 'Bala', 'placed')], [], 8);
    fetchActiveOrders.mockResolvedValueOnce([t1, t2]);

    await act(async () => {
      fakeSocket.trigger(KITCHEN_EVENTS.ORDERS_CHANGED, {});
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(screen.getByText('Table 8')).toBeInTheDocument();
  });

  test('12. a second connect refetches', async () => {
    fetchActiveOrders.mockResolvedValueOnce([]);

    render(<KitchenDashboard />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(fetchActiveOrders).toHaveBeenCalledTimes(1);

    fetchActiveOrders.mockResolvedValueOnce([]);
    await act(async () => {
      fakeSocket.trigger('connect');
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(fetchActiveOrders).toHaveBeenCalledTimes(2);
  });

  test('13. live chip displays liveOn when live and liveReconnecting when reconnecting', async () => {
    fetchActiveOrders.mockResolvedValue([]);

    render(<KitchenDashboard />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    // Connecting: no live chip
    expect(screen.queryByText(MESSAGES.kitchen.liveOn)).not.toBeInTheDocument();
    expect(screen.queryByText(MESSAGES.kitchen.liveReconnecting)).not.toBeInTheDocument();

    // Trigger connect -> live
    await act(async () => {
      fakeSocket.trigger('connect');
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(screen.getByText(MESSAGES.kitchen.liveOn)).toBeInTheDocument();

    // Trigger disconnect -> reconnecting
    await act(async () => {
      fakeSocket.trigger('disconnect');
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(screen.queryByText(MESSAGES.kitchen.liveOn)).not.toBeInTheDocument();
    expect(screen.getByText(MESSAGES.kitchen.liveReconnecting)).toBeInTheDocument();
  });

  test('14. poll runs every 30000 ms while live and 5000 ms after disconnect', async () => {
    fetchActiveOrders.mockResolvedValue([]);

    render(<KitchenDashboard />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(fetchActiveOrders).toHaveBeenCalledTimes(1);

    // Make live
    await act(async () => {
      fakeSocket.trigger('connect');
      await vi.advanceTimersByTimeAsync(0);
    });
    // connect triggers a refetch
    expect(fetchActiveOrders).toHaveBeenCalledTimes(2);

    // 29999ms: no poll yet
    await act(async () => {
      await vi.advanceTimersByTimeAsync(29999);
    });
    expect(fetchActiveOrders).toHaveBeenCalledTimes(2);

    // 30000ms: poll fires
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });
    expect(fetchActiveOrders).toHaveBeenCalledTimes(3);

    // Trigger disconnect
    await act(async () => {
      fakeSocket.trigger('disconnect');
      await vi.advanceTimersByTimeAsync(0);
    });

    // Next poll should fire after 5000ms
    await act(async () => {
      await vi.advanceTimersByTimeAsync(4999);
    });
    expect(fetchActiveOrders).toHaveBeenCalledTimes(3);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });
    expect(fetchActiveOrders).toHaveBeenCalledTimes(4);
  });

  test('15. the minutes update after 30 seconds interval', async () => {
    const placed = '2026-10-14T13:42:00.000Z';
    // Set system time to 13:42:50 (0 min elapsed)
    vi.setSystemTime(new Date('2026-10-14T13:42:50.000Z'));

    const t1 = makeTicket('1', placed, [dishRow(1, 'Soup', 1, 'Dev', 'placed')]);
    fetchActiveOrders.mockResolvedValue([t1]);

    render(<KitchenDashboard />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(screen.getByText(/0 min ago/)).toBeInTheDocument();

    // Advance 30 seconds: now interval triggers and system time moves to 13:43:20 (1 min elapsed)
    await act(async () => {
      await vi.advanceTimersByTimeAsync(30000);
    });

    expect(screen.getByText(/1 min ago/)).toBeInTheDocument();
  });

  test('16. unmounting disconnects the socket and cleans up listeners', async () => {
    fetchActiveOrders.mockResolvedValue([]);

    const { unmount } = render(<KitchenDashboard />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    unmount();
    expect(fakeSocket.disconnect).toHaveBeenCalled();
  });

  test('17. network error on moveDish displays network message above tickets without clearing board', async () => {
    const t1 = makeTicket('1', '2026-10-14T13:20:00.000Z', [dishRow(1, 'Soup', 1, 'Dev', 'placed')]);
    fetchActiveOrders.mockResolvedValueOnce([t1]);

    render(<KitchenDashboard />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    updateDishStatus.mockRejectedValueOnce(new Error('Network offline'));

    const startBtn = screen.getByRole('button', { name: MESSAGES.kitchen.actionStartAria('Soup') });
    await act(async () => {
      fireEvent.click(startBtn);
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(screen.getByRole('alert')).toHaveTextContent(BOARD_MESSAGES.network);
    expect(screen.getByText('Table 4')).toBeInTheDocument();
  });

  test('18. successful status update clears an earlier error message', async () => {
    const t1 = makeTicket('1', '2026-10-14T13:20:00.000Z', [
      dishRow(1, 'Soup', 1, 'Dev', 'placed'),
      dishRow(2, 'Tea', 1, 'Dev', 'placed'),
    ]);
    fetchActiveOrders.mockResolvedValueOnce([t1]);

    render(<KitchenDashboard />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    // 1. Fail move
    updateDishStatus.mockRejectedValueOnce(new Error('Network error'));
    const startSoupBtn = screen.getByRole('button', { name: MESSAGES.kitchen.actionStartAria('Soup') });
    await act(async () => {
      fireEvent.click(startSoupBtn);
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(screen.getByRole('alert')).toHaveTextContent(BOARD_MESSAGES.network);

    // 2. Succeed next move
    const tUpdated = makeTicket('1', '2026-10-14T13:20:00.000Z', [
      dishRow(1, 'Soup', 1, 'Dev', 'placed'),
      dishRow(2, 'Tea', 1, 'Dev', 'preparing'),
    ]);
    updateDishStatus.mockResolvedValueOnce(tUpdated);

    const startTeaBtn = screen.getByRole('button', { name: MESSAGES.kitchen.actionStartAria('Tea') });
    await act(async () => {
      fireEvent.click(startTeaBtn);
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  test('19. busy dish disables its buttons while updateDishStatus is in flight', async () => {
    const t1 = makeTicket('1', '2026-10-14T13:20:00.000Z', [
      dishRow(1, 'Soup', 1, 'Dev', 'placed'),
      dishRow(2, 'Salad', 1, 'Asha', 'placed'),
    ]);
    fetchActiveOrders.mockResolvedValueOnce([t1]);

    render(<KitchenDashboard />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    let resolveMove;
    updateDishStatus.mockReturnValueOnce(new Promise((resolve) => {
      resolveMove = resolve;
    }));

    const soupStartBtn = screen.getByRole('button', { name: MESSAGES.kitchen.actionStartAria('Soup') });
    const saladStartBtn = screen.getByRole('button', { name: MESSAGES.kitchen.actionStartAria('Salad') });

    await act(async () => {
      fireEvent.click(soupStartBtn);
    });

    // Soup buttons are disabled
    expect(soupStartBtn).toBeDisabled();
    // Salad buttons remain enabled
    expect(saladStartBtn).not.toBeDisabled();

    // Resolve in-flight update
    const tUpdated = makeTicket('1', '2026-10-14T13:20:00.000Z', [
      dishRow(1, 'Soup', 1, 'Dev', 'preparing'),
      dishRow(2, 'Salad', 1, 'Asha', 'placed'),
    ]);
    await act(async () => {
      resolveMove(tUpdated);
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(screen.getByRole('button', { name: MESSAGES.kitchen.actionReadyAria('Soup') })).not.toBeDisabled();
  });

  test('20. pressing Escape on cancel modal closes dialog without cancelling dish', async () => {
    const t1 = makeTicket('1', '2026-10-14T13:20:00.000Z', [dishRow(1, 'Soup', 1, 'Dev', 'placed')]);
    fetchActiveOrders.mockResolvedValueOnce([t1]);

    render(<KitchenDashboard />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    const cancelBtn = screen.getByRole('button', { name: MESSAGES.kitchen.cancelDishAria('Soup') });
    await act(async () => {
      fireEvent.click(cancelBtn);
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(screen.getByRole('dialog')).toBeInTheDocument();

    await act(async () => {
      fireEvent.keyDown(document, { key: 'Escape' });
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(updateDishStatus).not.toHaveBeenCalled();
  });
});
