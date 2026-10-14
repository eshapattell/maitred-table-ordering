import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, act, cleanup } from '@testing-library/react';
import useGuestTable from './useGuestTable.js';
import * as guestService from '../services/guestService.js';
import { EVENTS } from '../utils/constants.js';

vi.mock('../services/guestService.js', () => ({
  fetchMyTable: vi.fn(),
  readGuestToken: vi.fn(),
}));

describe('useGuestTable hook', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    guestService.readGuestToken.mockReturnValue('valid-guest-jwt');
    Object.defineProperty(document, 'hidden', {
      configurable: true,
      get: () => false,
    });
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    Object.defineProperty(document, 'hidden', {
      configurable: true,
      get: () => false,
    });
  });

  test('1. noToken makes no request', async () => {
    guestService.readGuestToken.mockReturnValue('');

    const { result } = renderHook(() => useGuestTable());

    expect(result.current.status).toBe('noToken');
    expect(result.current.data).toBeNull();
    expect(guestService.fetchMyTable).not.toHaveBeenCalled();
  });

  test('2. first load then a poll at exactly 5000 ms (not at 4999)', async () => {
    const mockData = {
      session: { id: 's1', status: 'open', tableNumber: 3 },
      me: { id: 'p1', nickname: 'Rohan', status: 'approved' },
    };
    guestService.fetchMyTable.mockResolvedValue(mockData);

    const { result } = renderHook(() => useGuestTable());

    expect(result.current.status).toBe('loading');
    expect(guestService.fetchMyTable).toHaveBeenCalledTimes(1);

    await act(async () => {
      await Promise.resolve();
    });

    expect(result.current.status).toBe('ready');
    expect(result.current.data).toEqual(mockData);

    // Advance 4999ms -> no second call yet
    await act(async () => {
      await vi.advanceTimersByTimeAsync(4999);
    });
    expect(guestService.fetchMyTable).toHaveBeenCalledTimes(1);

    // Advance 1ms (total 5000ms) -> second call occurs
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });
    expect(guestService.fetchMyTable).toHaveBeenCalledTimes(2);
  });

  test('3. stops after unmount', async () => {
    guestService.fetchMyTable.mockResolvedValue({
      session: { id: 's1', status: 'open' },
      me: { id: 'p1', status: 'approved' },
    });

    const { unmount } = renderHook(() => useGuestTable());

    await act(async () => {
      await Promise.resolve();
    });
    expect(guestService.fetchMyTable).toHaveBeenCalledTimes(1);

    unmount();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(15000);
    });
    expect(guestService.fetchMyTable).toHaveBeenCalledTimes(1);
  });

  test('4. a failure keeps the last data and keeps polling', async () => {
    const initialData = {
      session: { id: 's1', status: 'open' },
      me: { id: 'p1', status: 'approved' },
    };
    guestService.fetchMyTable
      .mockResolvedValueOnce(initialData)
      .mockRejectedValueOnce(new Error('Network glitch'))
      .mockResolvedValueOnce({ ...initialData, updated: true });

    const { result } = renderHook(() => useGuestTable());

    await act(async () => {
      await Promise.resolve();
    });
    expect(result.current.status).toBe('ready');
    expect(result.current.data).toEqual(initialData);
    expect(result.current.offline).toBe(false);

    // Poll 1 fails
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
    });
    expect(result.current.status).toBe('ready');
    expect(result.current.data).toEqual(initialData);
    expect(result.current.offline).toBe(true);

    // Poll 2 succeeds
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
    });
    expect(result.current.status).toBe('ready');
    expect(result.current.data.updated).toBe(true);
    expect(result.current.offline).toBe(false);
  });

  test('5. a first failure gives status "error"', async () => {
    guestService.fetchMyTable.mockRejectedValueOnce(new Error('500 Server error'));

    const { result } = renderHook(() => useGuestTable());

    await act(async () => {
      await Promise.resolve();
    });

    expect(result.current.status).toBe('error');
    expect(result.current.data).toBeNull();
    expect(result.current.offline).toBe(true);
  });

  test('6. an ended 401 stops polling and sets endedCode', async () => {
    const endedErr = {
      response: {
        status: 401,
        data: { code: 'SESSION_CLOSED' },
      },
    };
    guestService.fetchMyTable.mockRejectedValueOnce(endedErr);

    const { result } = renderHook(() => useGuestTable());

    await act(async () => {
      await Promise.resolve();
    });

    expect(result.current.status).toBe('ended');
    expect(result.current.endedCode).toBe('SESSION_CLOSED');

    // Timer advances should not trigger another request
    await act(async () => {
      await vi.advanceTimersByTimeAsync(15000);
    });
    expect(guestService.fetchMyTable).toHaveBeenCalledTimes(1);
  });

  test('7. the GUEST_ENDED event ends it', async () => {
    guestService.fetchMyTable.mockResolvedValue({
      session: { id: 's1', status: 'open' },
      me: { id: 'p1', status: 'approved' },
    });

    const { result } = renderHook(() => useGuestTable());

    await act(async () => {
      await Promise.resolve();
    });
    expect(result.current.status).toBe('ready');

    act(() => {
      window.dispatchEvent(
        new CustomEvent(EVENTS.GUEST_ENDED, {
          detail: { code: 'PARTICIPANT_REMOVED' },
        })
      );
    });

    expect(result.current.status).toBe('ended');
    expect(result.current.endedCode).toBe('PARTICIPANT_REMOVED');

    // Verify polling stopped
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10000);
    });
    expect(guestService.fetchMyTable).toHaveBeenCalledTimes(1);
  });

  test('8. hidden pauses and visible refreshes at once', async () => {
    guestService.fetchMyTable.mockResolvedValue({
      session: { id: 's1', status: 'open' },
      me: { id: 'p1', status: 'approved' },
    });

    renderHook(() => useGuestTable());

    await act(async () => {
      await Promise.resolve();
    });
    expect(guestService.fetchMyTable).toHaveBeenCalledTimes(1);

    // Hide the page
    await act(async () => {
      Object.defineProperty(document, 'hidden', {
        configurable: true,
        get: () => true,
      });
      document.dispatchEvent(new Event('visibilitychange'));
    });

    // Advance 10 seconds while hidden -> no polling
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10000);
    });
    expect(guestService.fetchMyTable).toHaveBeenCalledTimes(1);

    // Become visible again -> immediately refreshes
    await act(async () => {
      Object.defineProperty(document, 'hidden', {
        configurable: true,
        get: () => false,
      });
      document.dispatchEvent(new Event('visibilitychange'));
    });

    expect(guestService.fetchMyTable).toHaveBeenCalledTimes(2);
  });

  test('9. a slow request is never overlapped', async () => {
    let resolveSlow;
    const slowPromise = new Promise((resolve) => {
      resolveSlow = resolve;
    });
    guestService.fetchMyTable.mockReturnValueOnce(slowPromise);

    renderHook(() => useGuestTable());
    expect(guestService.fetchMyTable).toHaveBeenCalledTimes(1);

    // Advance past poll interval while request is in flight
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10000);
    });
    // Still only 1 call
    expect(guestService.fetchMyTable).toHaveBeenCalledTimes(1);

    // Complete the request
    await act(async () => {
      resolveSlow({
        session: { id: 's1', status: 'open' },
        me: { id: 'p1', status: 'approved' },
      });
    });

    // Poll timer is scheduled for 5000ms AFTER resolution
    await act(async () => {
      await vi.advanceTimersByTimeAsync(4999);
    });
    expect(guestService.fetchMyTable).toHaveBeenCalledTimes(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });
    expect(guestService.fetchMyTable).toHaveBeenCalledTimes(2);
  });

  test('10. applyData replaces data and sets status ready', async () => {
    guestService.fetchMyTable.mockResolvedValueOnce({
      session: { id: 's1', status: 'open' },
      me: { id: 'p1', status: 'approved' },
    });

    const { result } = renderHook(() => useGuestTable());

    await act(async () => {
      await Promise.resolve();
    });

    const approvedData = {
      session: { id: 's1', status: 'open' },
      me: { id: 'p1', status: 'approved' },
      participants: [{ id: 'p2', nickname: 'Maya', status: 'approved' }],
    };

    act(() => {
      result.current.applyData(approvedData);
    });

    expect(result.current.data).toEqual(approvedData);
    expect(result.current.status).toBe('ready');
  });

  test('11. refresh asks now', async () => {
    guestService.fetchMyTable.mockResolvedValue({
      session: { id: 's1', status: 'open' },
      me: { id: 'p1', status: 'approved' },
    });

    const { result } = renderHook(() => useGuestTable());

    await act(async () => {
      await Promise.resolve();
    });
    expect(guestService.fetchMyTable).toHaveBeenCalledTimes(1);

    // Refresh immediately calls fetchMyTable
    await act(async () => {
      result.current.refresh();
    });

    expect(guestService.fetchMyTable).toHaveBeenCalledTimes(2);
  });

  test('12. changing pollMs from 5000 to 30000 makes the next poll come at 30000 and not at 5000', async () => {
    guestService.fetchMyTable.mockResolvedValue({
      session: { id: 's1', status: 'open' },
      me: { id: 'p1', status: 'approved' },
    });

    const { rerender } = renderHook(({ pollMs }) => useGuestTable({ pollMs }), {
      initialProps: { pollMs: 5000 },
    });

    // Change pollMs to 30000 while first request is running
    rerender({ pollMs: 30000 });

    await act(async () => {
      await Promise.resolve();
    });
    expect(guestService.fetchMyTable).toHaveBeenCalledTimes(1);

    // At 5000ms: should NOT have polled yet
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
    });
    expect(guestService.fetchMyTable).toHaveBeenCalledTimes(1);

    // At 29999ms: still should not have polled
    await act(async () => {
      await vi.advanceTimersByTimeAsync(24999);
    });
    expect(guestService.fetchMyTable).toHaveBeenCalledTimes(1);

    // At 30000ms: poll occurs
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });
    expect(guestService.fetchMyTable).toHaveBeenCalledTimes(2);
  });

  test('13. focus and online each cause a request when visible and active', async () => {
    guestService.fetchMyTable.mockResolvedValue({
      session: { id: 's1', status: 'open' },
      me: { id: 'p1', status: 'approved' },
    });

    renderHook(() => useGuestTable());

    await act(async () => {
      await Promise.resolve();
    });
    expect(guestService.fetchMyTable).toHaveBeenCalledTimes(1);

    // focus triggers a request
    await act(async () => {
      window.dispatchEvent(new Event('focus'));
    });
    expect(guestService.fetchMyTable).toHaveBeenCalledTimes(2);

    // online triggers a request
    await act(async () => {
      window.dispatchEvent(new Event('online'));
    });
    expect(guestService.fetchMyTable).toHaveBeenCalledTimes(3);
  });

  test('14. focus and online are ignored when session is ended', async () => {
    guestService.fetchMyTable.mockResolvedValue({
      session: { id: 's1', status: 'open' },
      me: { id: 'p1', status: 'approved' },
    });

    renderHook(() => useGuestTable());

    await act(async () => {
      await Promise.resolve();
    });
    expect(guestService.fetchMyTable).toHaveBeenCalledTimes(1);

    // End session
    act(() => {
      window.dispatchEvent(new CustomEvent(EVENTS.GUEST_ENDED, { detail: { code: 'SESSION_CLOSED' } }));
    });

    await act(async () => {
      window.dispatchEvent(new Event('focus'));
      window.dispatchEvent(new Event('online'));
    });

    expect(guestService.fetchMyTable).toHaveBeenCalledTimes(1);
  });

  test('15. focus and online are ignored when noToken', async () => {
    guestService.readGuestToken.mockReturnValue('');

    renderHook(() => useGuestTable());

    expect(guestService.fetchMyTable).not.toHaveBeenCalled();

    await act(async () => {
      window.dispatchEvent(new Event('focus'));
      window.dispatchEvent(new Event('online'));
    });

    expect(guestService.fetchMyTable).not.toHaveBeenCalled();
  });

  test('16. focus and online are ignored while page is hidden', async () => {
    guestService.fetchMyTable.mockResolvedValue({
      session: { id: 's1', status: 'open' },
      me: { id: 'p1', status: 'approved' },
    });

    renderHook(() => useGuestTable());

    await act(async () => {
      await Promise.resolve();
    });
    expect(guestService.fetchMyTable).toHaveBeenCalledTimes(1);

    // Hide document
    Object.defineProperty(document, 'hidden', {
      configurable: true,
      get: () => true,
    });

    await act(async () => {
      window.dispatchEvent(new Event('focus'));
      window.dispatchEvent(new Event('online'));
    });

    expect(guestService.fetchMyTable).toHaveBeenCalledTimes(1);
  });

  test('17. focus and online are ignored while a request is in flight', async () => {
    let resolveInFlight;
    const pendingPromise = new Promise((resolve) => {
      resolveInFlight = resolve;
    });

    // Initial fetch hangs in-flight
    guestService.fetchMyTable.mockReturnValueOnce(pendingPromise);

    renderHook(() => useGuestTable());

    expect(guestService.fetchMyTable).toHaveBeenCalledTimes(1);

    // While in-flight, focus and online should be ignored
    await act(async () => {
      window.dispatchEvent(new Event('focus'));
      window.dispatchEvent(new Event('online'));
    });

    expect(guestService.fetchMyTable).toHaveBeenCalledTimes(1);

    // Finish in-flight
    await act(async () => {
      resolveInFlight({
        session: { id: 's1', status: 'open' },
        me: { id: 'p1', status: 'approved' },
      });
      await Promise.resolve();
    });
  });

  test('18. focus and online listeners are removed on unmount', () => {
    const removeSpy = vi.spyOn(window, 'removeEventListener');

    const { unmount } = renderHook(() => useGuestTable());

    unmount();

    expect(removeSpy).toHaveBeenCalledWith('focus', expect.any(Function));
    expect(removeSpy).toHaveBeenCalledWith('online', expect.any(Function));

    removeSpy.mockRestore();
  });
});
