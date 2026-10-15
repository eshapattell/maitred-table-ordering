// useKitchenBoard.js: State management and live sync hook for kitchen order board
import { useState, useEffect, useRef, useCallback } from 'react';
import { fetchActiveOrders, updateDishStatus } from '../services/orderService.js';
import {
  sortOrders,
  splitDishes,
  pollIntervalFor,
  boardErrorMessage,
  staleAfterBoardError,
} from '../utils/kitchenBoard.js';
import { useKitchenLive } from './useKitchenLive.js';

export const useKitchenBoard = ({ enabled = true } = {}) => {
  const [orders, setOrders] = useState([]);
  const [status, setStatus] = useState('loading');
  const [error, setError] = useState(null);
  const [busyKey, setBusyKey] = useState(null);
  const [isLive, setIsLive] = useState(false);

  const mountedRef = useRef(true);
  const enabledRef = useRef(enabled);
  enabledRef.current = enabled;

  const inFlightRef = useRef(false);
  const queuedRef = useRef(false);
  const seqRef = useRef(0);
  const hasBoardRef = useRef(false);
  const busySetRef = useRef(new Set());
  const timerRef = useRef(null);
  const isLiveRef = useRef(false);

  const clearPollTimer = () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  };

  const schedulePoll = useCallback(() => {
    clearPollTimer();
    if (!mountedRef.current || !enabledRef.current) return;
    if (typeof document !== 'undefined' && document.hidden) return;

    const delay = pollIntervalFor(isLiveRef.current);
    timerRef.current = setTimeout(() => {
      runFetch();
    }, delay);
  }, []);

  const runFetch = useCallback(async () => {
    if (!mountedRef.current || !enabledRef.current) return;
    if (inFlightRef.current) {
      queuedRef.current = true;
      return;
    }

    inFlightRef.current = true;
    const currentSeq = ++seqRef.current;
    clearPollTimer();

    try {
      const data = await fetchActiveOrders();
      if (!mountedRef.current) return;
      if (currentSeq === seqRef.current) {
        hasBoardRef.current = true;
        setOrders(sortOrders(data));
        setStatus('ready');
      }
    } catch (err) {
      if (!mountedRef.current) return;
      if (currentSeq === seqRef.current) {
        if (!hasBoardRef.current) {
          setStatus('error');
        }
      }
    } finally {
      inFlightRef.current = false;
      if (queuedRef.current && mountedRef.current && enabledRef.current) {
        queuedRef.current = false;
        runFetch();
      } else if (mountedRef.current && enabledRef.current) {
        schedulePoll();
      }
    }
  }, [schedulePoll]);

  const refresh = useCallback(() => {
    runFetch();
  }, [runFetch]);

  const handleLiveChange = useCallback((live) => {
    isLiveRef.current = live;
    setIsLive(live);
    schedulePoll();
  }, [schedulePoll]);

  const { liveState } = useKitchenLive({
    enabled,
    onRefetch: refresh,
    onLiveChange: handleLiveChange,
  });

  const moveDish = useCallback(
    async (orderId, orderItemId, targetStatus) => {
      const key = `${orderId}:${orderItemId}`;
      if (busySetRef.current.has(key)) return;

      busySetRef.current.add(key);
      setBusyKey(key);

      try {
        const updatedOrder = await updateDishStatus(orderId, orderItemId, targetStatus);
        if (!mountedRef.current) return;

        setError(null);
        const { open } = splitDishes(updatedOrder);
        if (open.length === 0) {
          setOrders((prev) => prev.filter((o) => o.id !== updatedOrder.id));
        } else {
          setOrders((prev) =>
            sortOrders(prev.map((o) => (o.id === updatedOrder.id ? updatedOrder : o)))
          );
        }
      } catch (err) {
        if (!mountedRef.current) return;
        const statusCode = err?.response?.status;
        if (statusCode !== 401) {
          setError(boardErrorMessage(err));
          if (staleAfterBoardError(err)) {
            runFetch();
          }
        }
      } finally {
        busySetRef.current.delete(key);
        if (mountedRef.current) {
          setBusyKey((prev) => (prev === key ? null : prev));
        }
      }
    },
    [runFetch]
  );

  useEffect(() => {
    mountedRef.current = true;
    if (!enabled) {
      clearPollTimer();
      return;
    }

    runFetch();

    const handleWindowActive = () => {
      if (!mountedRef.current || !enabledRef.current) return;
      if (typeof document !== 'undefined' && document.hidden) return;
      runFetch();
    };

    const handleVisibilityChange = () => {
      if (!mountedRef.current || !enabledRef.current) return;
      if (typeof document === 'undefined') return;
      if (document.hidden) {
        clearPollTimer();
      } else {
        handleWindowActive();
      }
    };

    const handleFocus = () => handleWindowActive();
    const handleOnline = () => handleWindowActive();

    if (typeof window !== 'undefined') {
      window.addEventListener('focus', handleFocus);
      window.addEventListener('online', handleOnline);
    }
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', handleVisibilityChange);
    }

    return () => {
      mountedRef.current = false;
      clearPollTimer();
      if (typeof window !== 'undefined') {
        window.removeEventListener('focus', handleFocus);
        window.removeEventListener('online', handleOnline);
      }
      if (typeof document !== 'undefined') {
        document.removeEventListener('visibilitychange', handleVisibilityChange);
      }
    };
  }, [enabled, runFetch]);

  return { orders, status, error, busyKey, liveState, refresh, moveDish };
};

export default useKitchenBoard;
