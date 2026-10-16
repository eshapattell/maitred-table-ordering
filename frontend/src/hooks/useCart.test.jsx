// useCart.test.jsx: unit tests for useCart hook
import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, act, cleanup } from '@testing-library/react';
import { useCart } from './useCart.js';
import * as cartService from '../services/cartService.js';
import { CART_MESSAGES } from '../utils/guestCart.js';

vi.mock('../services/cartService.js', () => ({
  getCart: vi.fn(),
  addToCart: vi.fn(),
  decreaseLine: vi.fn(),
  removeLine: vi.fn(),
}));

describe('useCart', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  const cartV = (version, lines = [], totalQuantity = 0, total = 0) => ({
    version,
    lines,
    totalQuantity,
    total,
    hasHiddenLines: false,
  });

  test('1. nothing is requested while disabled', () => {
    const { result } = renderHook(() => useCart({ enabled: false }));

    expect(cartService.getCart).not.toHaveBeenCalled();
    expect(result.current.cart).toBeNull();
    expect(result.current.status).toBe('idle');
    expect(result.current.getVersion()).toBeUndefined();
  });

  test('2. the first fetch applies the cart and sets status to ready', async () => {
    const mockCart = cartV(1);
    cartService.getCart.mockResolvedValueOnce(mockCart);

    const { result } = renderHook(() => useCart({ enabled: true }));

    expect(result.current.status).toBe('loading');
    expect(result.current.cart).toBeNull();

    await act(async () => {
      await Promise.resolve();
    });

    expect(result.current.status).toBe('ready');
    expect(result.current.cart).toEqual(mockCart);
    expect(result.current.getVersion()).toBe(1);
  });

  test('3. an older version never replaces a newer one while an equal one does', async () => {
    const cart1 = cartV(2);
    cartService.getCart.mockResolvedValueOnce(cart1);

    const { result } = renderHook(() => useCart({ enabled: true }));

    await act(async () => {
      await Promise.resolve();
    });
    expect(result.current.cart.version).toBe(2);

    // Older version: version 1 returned -> ignored
    cartService.getCart.mockResolvedValueOnce(cartV(1));
    await act(async () => {
      result.current.refresh();
      await Promise.resolve();
    });
    expect(result.current.cart.version).toBe(2);

    // Equal version: version 2 returned -> applied
    const cart2Same = cartV(2, [{ id: 'line-1' }]);
    cartService.getCart.mockResolvedValueOnce(cart2Same);
    await act(async () => {
      result.current.refresh();
      await Promise.resolve();
    });
    expect(result.current.cart).toEqual(cart2Same);
  });

  test('4. ping-during-fetch case gives exactly one extra fetch', async () => {
    let resolveFirst;
    const firstPromise = new Promise((resolve) => {
      resolveFirst = resolve;
    });

    cartService.getCart.mockReturnValueOnce(firstPromise);
    const cartInitial = cartV(1);
    const cartSecond = cartV(2);
    cartService.getCart.mockResolvedValueOnce(cartSecond);

    const { result } = renderHook(() => useCart({ enabled: true }));

    expect(cartService.getCart).toHaveBeenCalledTimes(1);

    // Refresh requested while first is still in flight
    act(() => {
      result.current.refresh();
    });

    // Still only 1 call launched while first is pending
    expect(cartService.getCart).toHaveBeenCalledTimes(1);

    // Multiple refreshes while in flight coalesce to ONE extra fetch
    act(() => {
      result.current.refresh();
    });
    expect(cartService.getCart).toHaveBeenCalledTimes(1);

    // First request resolves
    await act(async () => {
      resolveFirst(cartInitial);
      await Promise.resolve();
    });

    // Exactly one second fetch executed
    expect(cartService.getCart).toHaveBeenCalledTimes(2);
    expect(result.current.cart).toEqual(cartSecond);
  });

  test('5. add calls addToCart once and applies the answer', async () => {
    cartService.getCart.mockResolvedValueOnce(cartV(1));
    const updated = cartV(2, [{ id: 'line-1', menuItemId: 'dish-1' }]);
    cartService.addToCart.mockResolvedValueOnce(updated);

    const { result } = renderHook(() => useCart({ enabled: true }));
    await act(async () => {
      await Promise.resolve();
    });

    await act(async () => {
      await result.current.add('dish-1');
    });

    expect(cartService.addToCart).toHaveBeenCalledWith('dish-1');
    expect(result.current.cart).toEqual(updated);
    expect(result.current.error).toBeNull();
  });

  test('6. decrease calls decreaseLine once and applies the answer', async () => {
    cartService.getCart.mockResolvedValueOnce(cartV(2));
    const updated = cartV(3);
    cartService.decreaseLine.mockResolvedValueOnce(updated);

    const { result } = renderHook(() => useCart({ enabled: true }));
    await act(async () => {
      await Promise.resolve();
    });

    await act(async () => {
      await result.current.decrease('line-1');
    });

    expect(cartService.decreaseLine).toHaveBeenCalledWith('line-1');
    expect(result.current.cart).toEqual(updated);
    expect(result.current.error).toBeNull();
  });

  test('7. remove calls removeLine once and applies the answer', async () => {
    cartService.getCart.mockResolvedValueOnce(cartV(3));
    const updated = cartV(4);
    cartService.removeLine.mockResolvedValueOnce(updated);

    const { result } = renderHook(() => useCart({ enabled: true }));
    await act(async () => {
      await Promise.resolve();
    });

    await act(async () => {
      await result.current.remove('line-1');
    });

    expect(cartService.removeLine).toHaveBeenCalledWith('line-1');
    expect(result.current.cart).toEqual(updated);
    expect(result.current.error).toBeNull();
  });

  test('8. add, decrease, and remove are ignored while busy', async () => {
    cartService.getCart.mockResolvedValueOnce(cartV(1));
    let resolveAdd;
    const addPromise = new Promise((resolve) => {
      resolveAdd = resolve;
    });
    cartService.addToCart.mockReturnValueOnce(addPromise);

    const { result } = renderHook(() => useCart({ enabled: true }));
    await act(async () => {
      await Promise.resolve();
    });

    // Start add mutation
    act(() => {
      result.current.add('dish-1');
    });

    expect(result.current.busy).toBe(true);

    // Call add, decrease, remove while busy -> should be ignored
    act(() => {
      result.current.add('dish-2');
      result.current.decrease('line-1');
      result.current.remove('line-1');
    });

    expect(cartService.addToCart).toHaveBeenCalledTimes(1);
    expect(cartService.decreaseLine).not.toHaveBeenCalled();
    expect(cartService.removeLine).not.toHaveBeenCalled();

    // Resolve initial mutation
    await act(async () => {
      resolveAdd(cartV(2));
      await Promise.resolve();
    });

    expect(result.current.busy).toBe(false);
  });

  test('9. NOT_SAFE error sets matching message from cartErrorMessage, refreshes cart, and calls onStale', async () => {
    cartService.getCart.mockResolvedValue(cartV(1));
    const onStale = vi.fn();
    const error = {
      response: {
        status: 409,
        data: { message: 'RAW SERVER MESSAGE', code: 'NOT_SAFE', reason: 'allergen', clashes: ['peanut'] },
      },
    };
    cartService.addToCart.mockRejectedValueOnce(error);

    const { result } = renderHook(() => useCart({ enabled: true, onStale }));
    await act(async () => {
      await Promise.resolve();
    });

    cartService.getCart.mockClear();

    await act(async () => {
      await result.current.add('dish-peanut');
    });

    expect(result.current.error).toBe('Not added. Contains peanut');
    expect(result.current.error).not.toContain('RAW SERVER MESSAGE');
    expect(cartService.getCart).toHaveBeenCalledTimes(1);
    expect(onStale).toHaveBeenCalledTimes(1);
  });

  test('10. QTY_LIMIT error sets message, refreshes, calls onStale', async () => {
    cartService.getCart.mockResolvedValue(cartV(1));
    const onStale = vi.fn();
    const error = {
      response: {
        status: 409,
        data: { message: 'RAW LIMIT', code: 'QTY_LIMIT' },
      },
    };
    cartService.addToCart.mockRejectedValueOnce(error);

    const { result } = renderHook(() => useCart({ enabled: true, onStale }));
    await act(async () => {
      await Promise.resolve();
    });

    cartService.getCart.mockClear();

    await act(async () => {
      await result.current.add('dish-1');
    });

    expect(result.current.error).toBe(CART_MESSAGES.qtyLimit);
    expect(cartService.getCart).toHaveBeenCalledTimes(1);
    expect(onStale).toHaveBeenCalledTimes(1);
  });

  test('11. CART_FULL error sets message, refreshes, calls onStale', async () => {
    cartService.getCart.mockResolvedValue(cartV(1));
    const onStale = vi.fn();
    const error = {
      response: {
        status: 409,
        data: { code: 'CART_FULL' },
      },
    };
    cartService.addToCart.mockRejectedValueOnce(error);

    const { result } = renderHook(() => useCart({ enabled: true, onStale }));
    await act(async () => {
      await Promise.resolve();
    });

    cartService.getCart.mockClear();

    await act(async () => {
      await result.current.add('dish-1');
    });

    expect(result.current.error).toBe(CART_MESSAGES.cartFull);
    expect(cartService.getCart).toHaveBeenCalledTimes(1);
    expect(onStale).toHaveBeenCalledTimes(1);
  });

  test('12. MIN_QTY error sets message, refreshes, calls onStale', async () => {
    cartService.getCart.mockResolvedValue(cartV(1));
    const onStale = vi.fn();
    const error = {
      response: {
        status: 409,
        data: { code: 'MIN_QTY' },
      },
    };
    cartService.decreaseLine.mockRejectedValueOnce(error);

    const { result } = renderHook(() => useCart({ enabled: true, onStale }));
    await act(async () => {
      await Promise.resolve();
    });

    cartService.getCart.mockClear();

    await act(async () => {
      await result.current.decrease('line-1');
    });

    expect(result.current.error).toBe(CART_MESSAGES.minQty);
    expect(cartService.getCart).toHaveBeenCalledTimes(1);
    expect(onStale).toHaveBeenCalledTimes(1);
  });

  test('13. ITEM_NOT_FOUND and CART_ITEM_NOT_FOUND set message, refresh, and call onStale', async () => {
    cartService.getCart.mockResolvedValue(cartV(1));
    const onStale = vi.fn();

    const { result } = renderHook(() => useCart({ enabled: true, onStale }));
    await act(async () => {
      await Promise.resolve();
    });

    // ITEM_NOT_FOUND on add
    cartService.addToCart.mockRejectedValueOnce({
      response: { status: 404, data: { code: 'ITEM_NOT_FOUND' } },
    });
    cartService.getCart.mockClear();

    await act(async () => {
      await result.current.add('dish-missing');
    });
    expect(result.current.error).toBe(CART_MESSAGES.itemGone);
    expect(cartService.getCart).toHaveBeenCalledTimes(1);
    expect(onStale).toHaveBeenCalledTimes(1);

    // CART_ITEM_NOT_FOUND on remove
    cartService.removeLine.mockRejectedValueOnce({
      response: { status: 404, data: { code: 'CART_ITEM_NOT_FOUND' } },
    });
    cartService.getCart.mockClear();
    onStale.mockClear();

    await act(async () => {
      await result.current.remove('line-gone');
    });
    expect(result.current.error).toBe(CART_MESSAGES.lineChanged);
    expect(cartService.getCart).toHaveBeenCalledTimes(1);
    expect(onStale).toHaveBeenCalledTimes(1);
  });

  test('14. a network error sets the network message and does NOT refresh or call onStale', async () => {
    cartService.getCart.mockResolvedValue(cartV(1));
    const onStale = vi.fn();
    cartService.addToCart.mockRejectedValueOnce(new Error('Network error'));

    const { result } = renderHook(() => useCart({ enabled: true, onStale }));
    await act(async () => {
      await Promise.resolve();
    });

    cartService.getCart.mockClear();

    await act(async () => {
      await result.current.add('dish-1');
    });

    expect(result.current.error).toBe(CART_MESSAGES.network);
    expect(cartService.getCart).not.toHaveBeenCalled();
    expect(onStale).not.toHaveBeenCalled();
  });

  test('15. a 401 with an ended code sets no error', async () => {
    cartService.getCart.mockResolvedValue(cartV(1));
    const error = {
      response: { status: 401, data: { code: 'SESSION_CLOSED' } },
    };
    cartService.addToCart.mockRejectedValueOnce(error);

    const { result } = renderHook(() => useCart({ enabled: true }));
    await act(async () => {
      await Promise.resolve();
    });

    await act(async () => {
      await result.current.add('dish-1');
    });

    expect(result.current.error).toBeNull();
  });

  test('16. success clears an earlier error', async () => {
    cartService.getCart.mockResolvedValue(cartV(1));
    cartService.addToCart.mockRejectedValueOnce(new Error('Network error'));

    const { result } = renderHook(() => useCart({ enabled: true }));
    await act(async () => {
      await Promise.resolve();
    });

    // Trigger error
    await act(async () => {
      await result.current.add('dish-1');
    });
    expect(result.current.error).toBe(CART_MESSAGES.network);

    // Next successful operation clears error
    cartService.addToCart.mockResolvedValueOnce(cartV(2));
    await act(async () => {
      await result.current.add('dish-1');
    });
    expect(result.current.error).toBeNull();
  });

  test('17. applyCart applies a newer cart, updates state, and returns true', async () => {
    cartService.getCart.mockResolvedValueOnce(cartV(1));
    const { result } = renderHook(() => useCart({ enabled: true }));
    await act(async () => {
      await Promise.resolve();
    });
    expect(result.current.cart.version).toBe(1);

    let applied;
    act(() => {
      applied = result.current.applyCart(cartV(2));
    });

    expect(applied).toBe(true);
    expect(result.current.cart.version).toBe(2);
    expect(result.current.status).toBe('ready');
  });

  test('18. applyCart rejects an older cart, keeps current cart, and returns false', async () => {
    cartService.getCart.mockResolvedValueOnce(cartV(2));
    const { result } = renderHook(() => useCart({ enabled: true }));
    await act(async () => {
      await Promise.resolve();
    });
    expect(result.current.cart.version).toBe(2);

    let applied;
    act(() => {
      applied = result.current.applyCart(cartV(1));
    });

    expect(applied).toBe(false);
    expect(result.current.cart.version).toBe(2);
  });

  test('19. applyCart rejects a malformed cart and returns false', async () => {
    cartService.getCart.mockResolvedValueOnce(cartV(1));
    const { result } = renderHook(() => useCart({ enabled: true }));
    await act(async () => {
      await Promise.resolve();
    });

    for (const bad of [null, undefined, {}, { version: 'x' }, { version: 2, lines: 'invalid' }]) {
      let applied;
      act(() => {
        applied = result.current.applyCart(bad);
      });
      expect(applied).toBe(false);
      expect(result.current.cart.version).toBe(1);
    }
  });

  test('20. applyCart does nothing and returns false after unmount', async () => {
    cartService.getCart.mockResolvedValueOnce(cartV(1));
    const { result, unmount } = renderHook(() => useCart({ enabled: true }));
    await act(async () => {
      await Promise.resolve();
    });

    unmount();

    let applied;
    act(() => {
      applied = result.current.applyCart(cartV(2));
    });

    expect(applied).toBe(false);
  });
});
