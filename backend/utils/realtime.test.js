import { jest } from '@jest/globals';
import { realtime } from './realtime.js';
import { LIVE_EVENTS, roomFor } from './liveRules.js';
import { KITCHEN_NAMESPACE, ORDER_EVENTS, kitchenRoomFor } from './orderRules.js';

describe('realtime notification plumbing', () => {
  const validSessionId = '507f1f77bcf86cd799439011';
  const expectedRoom = roomFor(validSessionId);
  const validRestaurantId = '507f1f77bcf86cd799439012';
  const expectedKitchenRoom = kitchenRoomFor(validRestaurantId);

  const createFakeIo = () => {
    const emitted = [];
    const rooms = [];
    const namespaces = [];
    const emitFn = jest.fn((event, payload) => {
      emitted.push({ event, payload });
    });
    const toFn = jest.fn((room) => {
      rooms.push(room);
      return { emit: emitFn };
    });
    const ofFn = jest.fn((ns) => {
      namespaces.push(ns);
      return { to: toFn };
    });
    return {
      to: toFn,
      of: ofFn,
      emitFn,
      emitted,
      rooms,
      namespaces,
    };
  };

  afterEach(() => {
    realtime.init(null);
    jest.restoreAllMocks();
  });

  test('1. sessionChanged is a silent no-op before init', () => {
    expect(() => {
      realtime.sessionChanged(validSessionId);
    }).not.toThrow();
  });

  test('2. cartChanged is a silent no-op before init', () => {
    expect(() => {
      realtime.cartChanged(validSessionId, 1);
    }).not.toThrow();
  });

  test('3. sessionChanged emits SESSION_CHANGED with empty object {} to the right room', () => {
    const fakeIo = createFakeIo();
    realtime.init(fakeIo);

    realtime.sessionChanged(validSessionId);

    expect(fakeIo.to).toHaveBeenCalledTimes(1);
    expect(fakeIo.to).toHaveBeenCalledWith(expectedRoom);
    expect(fakeIo.emitFn).toHaveBeenCalledTimes(1);
    expect(fakeIo.emitFn).toHaveBeenCalledWith(LIVE_EVENTS.SESSION_CHANGED, {});
  });

  test('4. cartChanged version 3 emits CART_CHANGED with { version: 3 } and nothing else to the right room', () => {
    const fakeIo = createFakeIo();
    realtime.init(fakeIo);

    realtime.cartChanged(validSessionId, 3);

    expect(fakeIo.to).toHaveBeenCalledTimes(1);
    expect(fakeIo.to).toHaveBeenCalledWith(expectedRoom);
    expect(fakeIo.emitFn).toHaveBeenCalledTimes(1);
    expect(fakeIo.emitFn).toHaveBeenCalledWith(LIVE_EVENTS.CART_CHANGED, { version: 3 });
    const payload = fakeIo.emitFn.mock.calls[0][1];
    expect(payload).toEqual({ version: 3 });
    expect(Object.keys(payload)).toEqual(['version']);
  });

  test('5. invalid session ids emit nothing from sessionChanged', () => {
    const fakeIo = createFakeIo();
    realtime.init(fakeIo);

    realtime.sessionChanged('not-an-id');
    realtime.sessionChanged(null);
    realtime.sessionChanged(undefined);
    realtime.sessionChanged(12345);
    realtime.sessionChanged('');

    expect(fakeIo.to).not.toHaveBeenCalled();
    expect(fakeIo.emitFn).not.toHaveBeenCalled();
  });

  test('6. invalid session ids emit nothing from cartChanged', () => {
    const fakeIo = createFakeIo();
    realtime.init(fakeIo);

    realtime.cartChanged('not-an-id', 1);
    realtime.cartChanged(null, 1);
    realtime.cartChanged(undefined, 1);
    realtime.cartChanged(12345, 1);
    realtime.cartChanged('', 1);

    expect(fakeIo.to).not.toHaveBeenCalled();
    expect(fakeIo.emitFn).not.toHaveBeenCalled();
  });

  test('7. a throwing io in sessionChanged is swallowed silently without logging', () => {
    const consoleErrorSpy = jest.spyOn(console, 'error');
    const consoleLogSpy = jest.spyOn(console, 'log');

    const throwingIo = {
      to: jest.fn(() => {
        throw new Error('Socket.io exploded');
      }),
    };
    realtime.init(throwingIo);

    expect(() => {
      realtime.sessionChanged(validSessionId);
    }).not.toThrow();

    expect(consoleErrorSpy).not.toHaveBeenCalled();
    expect(consoleLogSpy).not.toHaveBeenCalled();
  });

  test('8. a throwing io.emit in cartChanged is swallowed silently without logging', () => {
    const consoleErrorSpy = jest.spyOn(console, 'error');
    const consoleLogSpy = jest.spyOn(console, 'log');

    const throwingIo = {
      to: jest.fn(() => ({
        emit: jest.fn(() => {
          throw new Error('Emit exploded');
        }),
      })),
    };
    realtime.init(throwingIo);

    expect(() => {
      realtime.cartChanged(validSessionId, 5);
    }).not.toThrow();

    expect(consoleErrorSpy).not.toHaveBeenCalled();
    expect(consoleLogSpy).not.toHaveBeenCalled();
  });

  test('9. calling init twice keeps the latest io instance', () => {
    const firstIo = createFakeIo();
    const secondIo = createFakeIo();

    realtime.init(firstIo);
    realtime.init(secondIo);

    realtime.sessionChanged(validSessionId);
    realtime.cartChanged(validSessionId, 2);

    expect(firstIo.to).not.toHaveBeenCalled();
    expect(firstIo.emitFn).not.toHaveBeenCalled();

    expect(secondIo.to).toHaveBeenCalledTimes(2);
    expect(secondIo.emitFn).toHaveBeenCalledTimes(2);
  });

  test('10. methods can be spied upon via jest.spyOn on the exported object', () => {
    const spy = jest.spyOn(realtime, 'sessionChanged');
    realtime.sessionChanged(validSessionId);
    expect(spy).toHaveBeenCalledWith(validSessionId);
  });

  test('11. ordersChanged is a silent no-op before init', () => {
    expect(() => {
      realtime.ordersChanged(validRestaurantId);
    }).not.toThrow();
  });

  test('12. ordersChanged emits ORDERS_CHANGED with empty object {} to the right kitchen room in KITCHEN_NAMESPACE', () => {
    const fakeIo = createFakeIo();
    realtime.init(fakeIo);

    realtime.ordersChanged(validRestaurantId);

    expect(fakeIo.of).toHaveBeenCalledTimes(1);
    expect(fakeIo.of).toHaveBeenCalledWith(KITCHEN_NAMESPACE);
    expect(fakeIo.to).toHaveBeenCalledTimes(1);
    expect(fakeIo.to).toHaveBeenCalledWith(expectedKitchenRoom);
    expect(fakeIo.emitFn).toHaveBeenCalledTimes(1);
    expect(fakeIo.emitFn).toHaveBeenCalledWith(ORDER_EVENTS.ORDERS_CHANGED, {});
  });

  test('13. invalid restaurant ids emit nothing from ordersChanged', () => {
    const fakeIo = createFakeIo();
    realtime.init(fakeIo);

    realtime.ordersChanged('not-an-id');
    realtime.ordersChanged(null);
    realtime.ordersChanged(undefined);
    realtime.ordersChanged(12345);
    realtime.ordersChanged('');

    expect(fakeIo.of).not.toHaveBeenCalled();
    expect(fakeIo.to).not.toHaveBeenCalled();
    expect(fakeIo.emitFn).not.toHaveBeenCalled();
  });

  test('14. a throwing io or emit in ordersChanged is swallowed silently without logging', () => {
    const consoleErrorSpy = jest.spyOn(console, 'error');
    const consoleLogSpy = jest.spyOn(console, 'log');

    const throwingIo = {
      of: jest.fn(() => {
        throw new Error('Namespace exploded');
      }),
    };
    realtime.init(throwingIo);

    expect(() => {
      realtime.ordersChanged(validRestaurantId);
    }).not.toThrow();

    expect(consoleErrorSpy).not.toHaveBeenCalled();
    expect(consoleLogSpy).not.toHaveBeenCalled();
  });

  test('15. ordersChanged can be spied upon via jest.spyOn on the exported object', () => {
    const spy = jest.spyOn(realtime, 'ordersChanged');
    realtime.ordersChanged(validRestaurantId);
    expect(spy).toHaveBeenCalledWith(validRestaurantId);
  });
});
