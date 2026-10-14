// useCart.js: Hook managing table cart state, updates, and concurrency
import { useState, useEffect, useRef, useCallback } from 'react';
import { getCart, addToCart, decreaseLine, removeLine } from '../services/cartService.js';
import { shouldApplyCart, cartErrorMessage, staleAfter } from '../utils/guestCart.js';
import { endedCodeOf } from '../utils/guestSession.js';

export const useCart = ({ enabled = true, onStale } = {}) => {
  const [cart, setCart] = useState(null);
  const [status, setStatus] = useState(enabled ? 'loading' : 'idle');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const cartRef = useRef(null);
  const busyRef = useRef(false);
  const enabledRef = useRef(enabled);
  const onStaleRef = useRef(onStale);
  const isMountedRef = useRef(true);

  const inFlightRefreshRef = useRef(false);
  const queuedRefreshRef = useRef(false);

  enabledRef.current = enabled;
  onStaleRef.current = onStale;

  const applyIncomingCart = useCallback((incoming) => {
    if (!isMountedRef.current) return false;
    if (shouldApplyCart(cartRef.current, incoming)) {
      cartRef.current = incoming;
      setCart(incoming);
      setStatus('ready');
      return true;
    }
    return false;
  }, []);

  const doRefresh = useCallback(async () => {
    if (!isMountedRef.current || !enabledRef.current) return;

    if (inFlightRefreshRef.current) {
      queuedRefreshRef.current = true;
      return;
    }

    inFlightRefreshRef.current = true;
    if (!cartRef.current) {
      setStatus('loading');
    }

    try {
      const result = await getCart();
      if (!isMountedRef.current || !enabledRef.current) return;
      applyIncomingCart(result);
    } catch (err) {
      if (!isMountedRef.current || !enabledRef.current) return;
      const code = endedCodeOf(err);
      if (!code) {
        if (!cartRef.current) {
          setStatus('error');
        }
      }
    } finally {
      inFlightRefreshRef.current = false;
      if (queuedRefreshRef.current && isMountedRef.current && enabledRef.current) {
        queuedRefreshRef.current = false;
        doRefresh();
      }
    }
  }, [applyIncomingCart]);

  const refresh = useCallback(() => {
    doRefresh();
  }, [doRefresh]);

  const mutate = useCallback(async (serviceFn, arg) => {
    if (busyRef.current) return;
    if (!enabledRef.current) return;

    busyRef.current = true;
    setBusy(true);

    try {
      const updated = await serviceFn(arg);
      if (!isMountedRef.current || !enabledRef.current) return;
      applyIncomingCart(updated);
      setError(null);
    } catch (err) {
      if (!isMountedRef.current || !enabledRef.current) return;
      const code = endedCodeOf(err);
      if (!code) {
        setError(cartErrorMessage(err));
        if (staleAfter(err)) {
          doRefresh();
          onStaleRef.current?.();
        }
      }
    } finally {
      if (isMountedRef.current) {
        busyRef.current = false;
        setBusy(false);
      }
    }
  }, [applyIncomingCart, doRefresh]);

  const add = useCallback((menuItemId) => mutate(addToCart, menuItemId), [mutate]);
  const decrease = useCallback((cartItemId) => mutate(decreaseLine, cartItemId), [mutate]);
  const remove = useCallback((cartItemId) => mutate(removeLine, cartItemId), [mutate]);

  const getVersion = useCallback(() => {
    return cartRef.current?.version;
  }, []);

  useEffect(() => {
    isMountedRef.current = true;
    enabledRef.current = enabled;

    if (enabled) {
      doRefresh();
    }

    return () => {
      isMountedRef.current = false;
    };
  }, [enabled, doRefresh]);

  return {
    cart,
    status,
    busy,
    error,
    refresh,
    add,
    decrease,
    remove,
    getVersion,
  };
};

export default useCart;
