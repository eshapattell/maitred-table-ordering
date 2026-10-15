// useKitchenLive.test.jsx: unit tests for useKitchenLive hook
import { describe, test, expect, beforeEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useKitchenLive } from './useKitchenLive.js';
import { connectKitchen } from '../services/kitchenSocket.js';
import { KITCHEN_EVENTS } from '../utils/kitchenBoard.js';

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

describe('useKitchenLive', () => {
  beforeEach(() => {
    resetFakeSocket();
    vi.clearAllMocks();
    connectKitchen.mockReturnValue(fakeSocket);
  });

  const setup = (overrides = {}) => {
    const callbacks = {
      onRefetch: vi.fn(),
      onLiveChange: vi.fn(),
      enabled: true,
      ...overrides,
    };
    const rendered = renderHook((props) => useKitchenLive({ ...callbacks, ...props }));
    return { ...callbacks, ...rendered };
  };

  test('1. nothing happens while disabled', () => {
    const { result, onRefetch, onLiveChange } = setup({ enabled: false });

    expect(connectKitchen).not.toHaveBeenCalled();
    expect(result.current.liveState).toBe('connecting');
    expect(fakeSocket.on).not.toHaveBeenCalled();
    expect(onRefetch).not.toHaveBeenCalled();
    expect(onLiveChange).not.toHaveBeenCalled();
  });

  test('2. connect makes it live and refetches', () => {
    const { result, onRefetch, onLiveChange } = setup();

    expect(result.current.liveState).toBe('connecting');
    expect(connectKitchen).toHaveBeenCalledTimes(1);

    act(() => {
      fakeSocket.trigger('connect');
    });

    expect(result.current.liveState).toBe('live');
    expect(onLiveChange).toHaveBeenCalledTimes(1);
    expect(onLiveChange).toHaveBeenCalledWith(true);
    expect(onRefetch).toHaveBeenCalledTimes(1);
  });

  test('3. a second connect (a reconnect) refetches again', () => {
    const { onRefetch, onLiveChange } = setup();

    act(() => {
      fakeSocket.trigger('connect');
    });
    expect(onLiveChange).toHaveBeenCalledWith(true);
    expect(onRefetch).toHaveBeenCalledTimes(1);

    onRefetch.mockClear();
    onLiveChange.mockClear();

    // Reconnect while already live
    act(() => {
      fakeSocket.trigger('connect');
    });

    expect(onRefetch).toHaveBeenCalledTimes(1);
    expect(onLiveChange).not.toHaveBeenCalled();
  });

  test('4. an orders ping refetches', () => {
    const { onRefetch } = setup();

    act(() => {
      fakeSocket.trigger('connect');
    });
    onRefetch.mockClear();

    act(() => {
      fakeSocket.trigger(KITCHEN_EVENTS.ORDERS_CHANGED, {});
    });

    expect(onRefetch).toHaveBeenCalledTimes(1);
  });

  test('5. connect_error refetches and makes the state "reconnecting"', () => {
    const { result, onRefetch, onLiveChange } = setup();

    act(() => {
      fakeSocket.trigger('connect');
    });
    onRefetch.mockClear();
    onLiveChange.mockClear();

    act(() => {
      fakeSocket.trigger('connect_error', new Error('unauthorised'));
    });

    expect(result.current.liveState).toBe('reconnecting');
    expect(onLiveChange).toHaveBeenCalledWith(false);
    expect(onRefetch).toHaveBeenCalledTimes(1);
  });

  test('6. disconnect makes it "reconnecting" without refetching', () => {
    const { result, onRefetch, onLiveChange } = setup();

    act(() => {
      fakeSocket.trigger('connect');
    });
    onRefetch.mockClear();
    onLiveChange.mockClear();

    act(() => {
      fakeSocket.trigger('disconnect');
    });

    expect(result.current.liveState).toBe('reconnecting');
    expect(onLiveChange).toHaveBeenCalledWith(false);
    expect(onRefetch).not.toHaveBeenCalled();
  });

  test('7. onLiveChange fires only on real changes', () => {
    const { onLiveChange } = setup();

    expect(onLiveChange).not.toHaveBeenCalled();

    // connect: false -> true
    act(() => {
      fakeSocket.trigger('connect');
    });
    expect(onLiveChange).toHaveBeenCalledTimes(1);
    expect(onLiveChange).toHaveBeenCalledWith(true);

    // another connect while live: no call
    act(() => {
      fakeSocket.trigger('connect');
    });
    expect(onLiveChange).toHaveBeenCalledTimes(1);

    // disconnect: true -> false
    act(() => {
      fakeSocket.trigger('disconnect');
    });
    expect(onLiveChange).toHaveBeenCalledTimes(2);
    expect(onLiveChange).toHaveBeenLastCalledWith(false);

    // another disconnect: no call
    act(() => {
      fakeSocket.trigger('disconnect');
    });
    expect(onLiveChange).toHaveBeenCalledTimes(2);
  });

  test('8. emit is never called on the socket', () => {
    setup();

    act(() => {
      fakeSocket.trigger('connect');
      fakeSocket.trigger(KITCHEN_EVENTS.ORDERS_CHANGED, {});
      fakeSocket.trigger('disconnect');
    });

    expect(fakeSocket.emit).not.toHaveBeenCalled();
  });

  test('9. disabling or unmounting disconnects, removes the handlers and ignores later events', () => {
    const { rerender, unmount, onRefetch, onLiveChange } = setup();

    act(() => {
      fakeSocket.trigger('connect');
    });
    expect(onLiveChange).toHaveBeenCalledWith(true);
    onLiveChange.mockClear();

    // Disable hook
    rerender({ enabled: false });

    expect(fakeSocket.disconnect).toHaveBeenCalled();
    expect(fakeSocket.off).toHaveBeenCalledWith('connect', expect.any(Function));
    expect(fakeSocket.off).toHaveBeenCalledWith('disconnect', expect.any(Function));
    expect(fakeSocket.off).toHaveBeenCalledWith('connect_error', expect.any(Function));
    expect(fakeSocket.off).toHaveBeenCalledWith(KITCHEN_EVENTS.ORDERS_CHANGED, expect.any(Function));
    expect(onLiveChange).toHaveBeenCalledWith(false);

    // Later events are ignored
    onRefetch.mockClear();
    act(() => {
      fakeSocket.trigger(KITCHEN_EVENTS.ORDERS_CHANGED, {});
    });
    expect(onRefetch).not.toHaveBeenCalled();

    unmount();
  });

  test('10. changing a callback does not reconnect', () => {
    const { rerender } = setup();

    expect(connectKitchen).toHaveBeenCalledTimes(1);

    const newOnRefetch = vi.fn();
    const newOnLiveChange = vi.fn();
    rerender({ onRefetch: newOnRefetch, onLiveChange: newOnLiveChange });

    expect(connectKitchen).toHaveBeenCalledTimes(1);
    expect(fakeSocket.disconnect).not.toHaveBeenCalled();

    // Verify new callback is invoked
    act(() => {
      fakeSocket.trigger(KITCHEN_EVENTS.ORDERS_CHANGED, {});
    });
    expect(newOnRefetch).toHaveBeenCalledTimes(1);
  });
});
