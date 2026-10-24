// useTableOrders.js: Hook managing table order history state, loading, and concurrency
import { useState, useEffect, useRef, useCallback } from 'react';
import { fetchTableOrders } from '../services/guestOrderService.js';
import { emptyHistory, sanitizeHistory, historyErrorMessage } from '../utils/tableOrders.js';
import { endedCodeOf } from '../utils/guestSession.js';

export const useTableOrders = ({ enabled = false } = {}) => {
  const [history, setHistory] = useState(emptyHistory);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState(null);

  const isMountedRef = useRef(true);
  const loadedRef = useRef(false);
  const enabledRef = useRef(enabled);
  enabledRef.current = enabled;

  const inFlightRef = useRef(false);
  const queuedRef = useRef(false);
  const seqRef = useRef(0);
  const latestAppliedSeqRef = useRef(0);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const doLoad = useCallback(async () => {
    if (!isMountedRef.current || !enabledRef.current) return;

    if (inFlightRef.current) {
      queuedRef.current = true;
      return;
    }

    inFlightRef.current = true;
    const currentSeq = ++seqRef.current;

    try {
      const raw = await fetchTableOrders();
      if (!isMountedRef.current) return;
      if (currentSeq < latestAppliedSeqRef.current) return;
      latestAppliedSeqRef.current = currentSeq;

      const clean = sanitizeHistory(raw);
      setHistory(clean);
      loadedRef.current = true;
      setLoaded(true);
      setError(null);
    } catch (err) {
      if (!isMountedRef.current) return;
      if (currentSeq < latestAppliedSeqRef.current) return;

      const code = endedCodeOf(err);
      if (code) {
        return;
      }

      if (!loadedRef.current) {
        setError(historyErrorMessage(err));
      }
    } finally {
      inFlightRef.current = false;
      if (queuedRef.current && isMountedRef.current && enabledRef.current) {
        queuedRef.current = false;
        doLoad();
      }
    }
  }, []);

  const load = useCallback(() => {
    if (!enabledRef.current) return;
    doLoad();
  }, [doLoad]);

  useEffect(() => {
    enabledRef.current = enabled;
    if (enabled) {
      doLoad();
    } else {
      queuedRef.current = false;
    }
  }, [enabled, doLoad]);

  return { history, loaded, error, load };
};
