// useLiveConnection.test.jsx: unit tests for useLiveConnection hook
import { describe, test, expect, beforeEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useLiveConnection } from './useLiveConnection.js';
import { connectLive } from '../services/liveSocket.js';
import { LIVE_EVENTS } from '../utils/guestCart.js';

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

vi.mock('../services/liveSocket.js', () => ({
  connectLive: vi.fn(() => fakeSocket),
}));

describe('useLiveConnection', () => {
  beforeEach(() => {
    resetFakeSocket();
    vi.clearAllMocks();
    connectLive.mockReturnValue(fakeSocket);
  });

  const setup = (overrides = {}) => {
    const callbacks = {
      getCartVersion: vi.fn(() => 3),
      onSessionChanged: vi.fn(),
      onCartChanged: vi.fn(),
      onLiveChange: vi.fn(),
      enabled: true,
      ...overrides,
    };
    const rendered = renderHook((props) => useLiveConnection({ ...callbacks, ...props }));
    return { ...callbacks, ...rendered };
  };

  test('1. nothing happens while disabled', () => {
    const { result, onSessionChanged, onCartChanged, onLiveChange } = setup({ enabled: false });

    expect(connectLive).not.toHaveBeenCalled();
    expect(result.current.liveState).toBe('connecting');
    expect(fakeSocket.on).not.toHaveBeenCalled();
    expect(onSessionChanged).not.toHaveBeenCalled();
    expect(onCartChanged).not.toHaveBeenCalled();
    expect(onLiveChange).not.toHaveBeenCalled();
  });

  test('2. connect makes it live and asks for both session and cart', () => {
    const { result, onSessionChanged, onCartChanged, onLiveChange } = setup();

    expect(result.current.liveState).toBe('connecting');
    expect(connectLive).toHaveBeenCalledTimes(1);

    act(() => {
      fakeSocket.trigger('connect');
    });

    expect(result.current.liveState).toBe('live');
    expect(onLiveChange).toHaveBeenCalledTimes(1);
    expect(onLiveChange).toHaveBeenCalledWith(true);
    expect(onSessionChanged).toHaveBeenCalledTimes(1);
    expect(onCartChanged).toHaveBeenCalledTimes(1);
  });

  test('3. a reconnect (a second "connect") asks for both again without re-emitting onLiveChange', () => {
    const { onSessionChanged, onCartChanged, onLiveChange } = setup();

    act(() => {
      fakeSocket.trigger('connect');
    });
    expect(onLiveChange).toHaveBeenCalledWith(true);
    expect(onSessionChanged).toHaveBeenCalledTimes(1);
    expect(onCartChanged).toHaveBeenCalledTimes(1);

    onSessionChanged.mockClear();
    onCartChanged.mockClear();
    onLiveChange.mockClear();

    // Second connect (reconnect while already live)
    act(() => {
      fakeSocket.trigger('connect');
    });

    expect(onSessionChanged).toHaveBeenCalledTimes(1);
    expect(onCartChanged).toHaveBeenCalledTimes(1);
    // Already live, so onLiveChange should not fire again
    expect(onLiveChange).not.toHaveBeenCalled();
  });

  test('4. session:changed asks for both session and cart', () => {
    const { onSessionChanged, onCartChanged } = setup();

    act(() => {
      fakeSocket.trigger('connect');
    });
    onSessionChanged.mockClear();
    onCartChanged.mockClear();

    act(() => {
      fakeSocket.trigger(LIVE_EVENTS.SESSION_CHANGED, {});
    });

    expect(onSessionChanged).toHaveBeenCalledTimes(1);
    expect(onCartChanged).toHaveBeenCalledTimes(1);
  });

  test('5. cart:changed with newer version asks for cart only; same or older asks for nothing', () => {
    const { onSessionChanged, onCartChanged } = setup({ getCartVersion: () => 5 });

    act(() => {
      fakeSocket.trigger('connect');
    });
    onSessionChanged.mockClear();
    onCartChanged.mockClear();

    // Newer version: version 6 > 5
    act(() => {
      fakeSocket.trigger(LIVE_EVENTS.CART_CHANGED, { version: 6 });
    });
    expect(onSessionChanged).not.toHaveBeenCalled();
    expect(onCartChanged).toHaveBeenCalledTimes(1);

    onCartChanged.mockClear();

    // Same version: version 5 === 5 -> nothing
    act(() => {
      fakeSocket.trigger(LIVE_EVENTS.CART_CHANGED, { version: 5 });
    });
    expect(onSessionChanged).not.toHaveBeenCalled();
    expect(onCartChanged).not.toHaveBeenCalled();

    // Older version: version 4 < 5 -> nothing
    act(() => {
      fakeSocket.trigger(LIVE_EVENTS.CART_CHANGED, { version: 4 });
    });
    expect(onSessionChanged).not.toHaveBeenCalled();
    expect(onCartChanged).not.toHaveBeenCalled();
  });

  test('6. an unreadable ping asks for the cart', () => {
    const { onSessionChanged, onCartChanged } = setup({ getCartVersion: () => 5 });

    act(() => {
      fakeSocket.trigger('connect');
    });
    onSessionChanged.mockClear();
    onCartChanged.mockClear();

    // Unreadable ping (missing or non-numeric version)
    act(() => {
      fakeSocket.trigger(LIVE_EVENTS.CART_CHANGED, {});
    });
    expect(onSessionChanged).not.toHaveBeenCalled();
    expect(onCartChanged).toHaveBeenCalledTimes(1);

    onCartChanged.mockClear();

    act(() => {
      fakeSocket.trigger(LIVE_EVENTS.CART_CHANGED, null);
    });
    expect(onSessionChanged).not.toHaveBeenCalled();
    expect(onCartChanged).toHaveBeenCalledTimes(1);
  });

  test('7. connect_error asks for the session only, makes state "reconnecting", and is never treated as ended', () => {
    const { result, onSessionChanged, onCartChanged, onLiveChange } = setup();

    act(() => {
      fakeSocket.trigger('connect');
    });
    onSessionChanged.mockClear();
    onCartChanged.mockClear();
    onLiveChange.mockClear();

    act(() => {
      fakeSocket.trigger('connect_error', new Error('unauthorised'));
    });

    expect(result.current.liveState).toBe('reconnecting');
    expect(onLiveChange).toHaveBeenCalledWith(false);
    expect(onSessionChanged).toHaveBeenCalledTimes(1);
    expect(onCartChanged).not.toHaveBeenCalled();
  });

  test('8. disconnect makes it "reconnecting"', () => {
    const { result, onLiveChange } = setup();

    act(() => {
      fakeSocket.trigger('connect');
    });
    onLiveChange.mockClear();

    act(() => {
      fakeSocket.trigger('disconnect');
    });

    expect(result.current.liveState).toBe('reconnecting');
    expect(onLiveChange).toHaveBeenCalledWith(false);
  });

  test('9. onLiveChange fires only on real changes', () => {
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

  test('10. emit is never called on the socket', () => {
    setup();

    act(() => {
      fakeSocket.trigger('connect');
      fakeSocket.trigger(LIVE_EVENTS.SESSION_CHANGED, {});
      fakeSocket.trigger(LIVE_EVENTS.CART_CHANGED, { version: 10 });
      fakeSocket.trigger('disconnect');
    });

    expect(fakeSocket.emit).not.toHaveBeenCalled();
  });

  test('11. disabling or unmounting disconnects, removes handlers, and ignores later events', () => {
    const { rerender, unmount, onCartChanged, onLiveChange } = setup();

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
    expect(fakeSocket.off).toHaveBeenCalledWith(LIVE_EVENTS.SESSION_CHANGED, expect.any(Function));
    expect(fakeSocket.off).toHaveBeenCalledWith(LIVE_EVENTS.CART_CHANGED, expect.any(Function));
    expect(onLiveChange).toHaveBeenCalledWith(false);

    // Later events are ignored
    onCartChanged.mockClear();
    act(() => {
      fakeSocket.trigger(LIVE_EVENTS.CART_CHANGED, { version: 99 });
    });
    expect(onCartChanged).not.toHaveBeenCalled();

    unmount();
  });

  test('12. changing a callback does not reconnect or recreate socket', () => {
    const { rerender } = setup();

    expect(connectLive).toHaveBeenCalledTimes(1);

    const newOnSession = vi.fn();
    const newOnCart = vi.fn();
    rerender({ onSessionChanged: newOnSession, onCartChanged: newOnCart });

    expect(connectLive).toHaveBeenCalledTimes(1);
    expect(fakeSocket.disconnect).not.toHaveBeenCalled();

    // Verify new callback is invoked
    act(() => {
      fakeSocket.trigger(LIVE_EVENTS.SESSION_CHANGED, {});
    });
    expect(newOnSession).toHaveBeenCalledTimes(1);
  });
});
