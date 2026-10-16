// useHostOrders.js: Hook managing host order placement and sent-to-kitchen dish management
import { useState, useEffect, useRef, useCallback } from 'react';
import { placeOrder, fetchPlacedItems, cancelPlacedItem } from '../services/guestOrderService.js';
import { placementMessage, orderErrorMessage, staleAfterOrderError, placedRows } from '../utils/guestOrder.js';
import { endedCodeOf } from '../utils/guestSession.js';

export const useHostOrders = ({ enabled = true, onCartApplied, onStale } = {}) => {
  const [rows, setRows] = useState([]);
  const [placing, setPlacing] = useState(false);
  const [cancelKey, setCancelKey] = useState(null);
  const [message, setMessage] = useState(null);
  const [error, setError] = useState(null);

  const isMountedRef = useRef(true);
  const enabledRef = useRef(enabled);
  const onCartAppliedRef = useRef(onCartApplied);
  const onStaleRef = useRef(onStale);
  const placingRef = useRef(false);
  const inFlightCancelsRef = useRef(new Set());

  enabledRef.current = enabled;
  onCartAppliedRef.current = onCartApplied;
  onStaleRef.current = onStale;

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const loadPlaced = useCallback(async () => {
    if (!isMountedRef.current || !enabledRef.current) return;
    try {
      const items = await fetchPlacedItems();
      if (!isMountedRef.current || !enabledRef.current) return;
      setRows(placedRows(items));
    } catch {
      // Failure is silent and keeps the old rows
    }
  }, []);

  useEffect(() => {
    enabledRef.current = enabled;
    if (enabled) {
      loadPlaced();
    }
  }, [enabled, loadPlaced]);

  const place = useCallback(async (expectedVersion) => {
    if (placingRef.current) return;
    if (!isMountedRef.current) return;

    placingRef.current = true;
    setPlacing(true);
    setMessage(null);
    setError(null);

    try {
      const answer = await placeOrder(expectedVersion);
      if (!isMountedRef.current) return;

      if (typeof onCartAppliedRef.current === 'function') {
        onCartAppliedRef.current(answer?.cart);
      }
      setMessage(placementMessage(answer));
      setError(null);
      await loadPlaced();
    } catch (err) {
      if (!isMountedRef.current) return;
      const code = endedCodeOf(err);
      if (code) {
        return;
      }
      setError(orderErrorMessage(err));
      setMessage(null);
      if (staleAfterOrderError(err)) {
        if (typeof onStaleRef.current === 'function') {
          onStaleRef.current();
        }
        await loadPlaced();
      }
    } finally {
      if (isMountedRef.current) {
        placingRef.current = false;
        setPlacing(false);
      }
    }
  }, [loadPlaced]);

  const cancel = useCallback(async (row) => {
    if (!row || typeof row !== 'object') return;
    const key = `${row.orderId}:${row.orderItemId}`;
    if (inFlightCancelsRef.current.has(key)) return;
    if (!isMountedRef.current) return;

    inFlightCancelsRef.current.add(key);
    setCancelKey(key);

    try {
      await cancelPlacedItem(row.orderId, row.orderItemId);
      if (!isMountedRef.current) return;
      setError(null);
      await loadPlaced();
    } catch (err) {
      if (!isMountedRef.current) return;
      const code = endedCodeOf(err);
      if (code) {
        return;
      }
      setError(orderErrorMessage(err));
      setMessage(null);
      if (staleAfterOrderError(err)) {
        if (typeof onStaleRef.current === 'function') {
          onStaleRef.current();
        }
        await loadPlaced();
      }
    } finally {
      inFlightCancelsRef.current.delete(key);
      if (isMountedRef.current) {
        setCancelKey((prev) => (prev === key ? null : prev));
      }
    }
  }, [loadPlaced]);

  const dismiss = useCallback(() => {
    setMessage(null);
    setError(null);
  }, []);

  return {
    rows,
    placing,
    cancelKey,
    message,
    error,
    loadPlaced,
    place,
    cancel,
    dismiss,
  };
};

export default useHostOrders;
