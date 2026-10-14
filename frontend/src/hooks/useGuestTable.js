// useGuestTable.js: Hook managing live polling and state of the guest's session
import { useState, useEffect, useRef, useCallback } from 'react';
import { fetchMyTable, readGuestToken } from '../services/guestService.js';
import { GUEST_POLL_MS, endedCodeOf } from '../utils/guestSession.js';
import { EVENTS } from '../utils/constants.js';

export const useGuestTable = ({ pollMs } = {}) => {
  const token = readGuestToken();
  const [status, setStatus] = useState(token ? 'loading' : 'noToken');
  const [data, setData] = useState(null);
  const [endedCode, setEndedCode] = useState(null);
  const [offline, setOffline] = useState(false);

  const pollMsRef = useRef(pollMs ?? GUEST_POLL_MS);
  pollMsRef.current = pollMs ?? GUEST_POLL_MS;

  const isMountedRef = useRef(true);
  const inFlightRef = useRef(false);
  const timerRef = useRef(null);
  const statusRef = useRef(status);
  const dataRef = useRef(data);

  statusRef.current = status;
  dataRef.current = data;

  const clearPollTimer = () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  };

  const schedulePoll = () => {
    clearPollTimer();
    if (!isMountedRef.current) return;
    if (statusRef.current === 'ended' || statusRef.current === 'noToken') return;
    if (typeof document !== 'undefined' && document.hidden) return;

    const delay = typeof pollMsRef.current === 'number' && pollMsRef.current > 0 ? pollMsRef.current : GUEST_POLL_MS;
    timerRef.current = setTimeout(() => {
      fetchData();
    }, delay);
  };

  const fetchData = async () => {
    if (inFlightRef.current) return;
    if (statusRef.current === 'ended' || statusRef.current === 'noToken') return;

    inFlightRef.current = true;
    clearPollTimer();

    try {
      const result = await fetchMyTable();
      if (!isMountedRef.current) return;
      if (statusRef.current === 'ended') return;

      setData(result);
      dataRef.current = result;
      setStatus('ready');
      statusRef.current = 'ready';
      setOffline(false);
    } catch (err) {
      if (!isMountedRef.current) return;
      if (statusRef.current === 'ended') return;

      const code = endedCodeOf(err);
      if (code) {
        setStatus('ended');
        statusRef.current = 'ended';
        setEndedCode(code);
        clearPollTimer();
        return;
      }

      setOffline(true);
      if (!dataRef.current) {
        setStatus('error');
        statusRef.current = 'error';
      } else {
        setStatus('ready');
        statusRef.current = 'ready';
      }
    } finally {
      inFlightRef.current = false;
      if (isMountedRef.current && statusRef.current !== 'ended' && statusRef.current !== 'noToken') {
        schedulePoll();
      }
    }
  };

  const refresh = useCallback(() => {
    if (inFlightRef.current) return;
    if (statusRef.current === 'ended' || statusRef.current === 'noToken') return;
    clearPollTimer();
    fetchData();
  }, []);

  const applyData = useCallback((newData) => {
    if (!isMountedRef.current) return;
    setData(newData);
    dataRef.current = newData;
    setStatus('ready');
    statusRef.current = 'ready';
  }, []);

  useEffect(() => {
    isMountedRef.current = true;

    if (!readGuestToken()) {
      setStatus('noToken');
      statusRef.current = 'noToken';
      return;
    }

    fetchData();

    const handleGuestEnded = (e) => {
      if (!isMountedRef.current) return;
      clearPollTimer();
      setStatus('ended');
      statusRef.current = 'ended';
      setEndedCode(e?.detail?.code || null);
    };

    const handleWindowActive = () => {
      if (!isMountedRef.current) return;
      if (typeof document !== 'undefined' && document.hidden) return;
      if (statusRef.current !== 'ended' && statusRef.current !== 'noToken') {
        if (!inFlightRef.current) {
          clearPollTimer();
          fetchData();
        }
      }
    };

    const handleVisibilityChange = () => {
      if (!isMountedRef.current) return;
      if (typeof document === 'undefined') return;

      if (document.hidden) {
        clearPollTimer();
      } else {
        handleWindowActive();
      }
    };

    const handleFocus = () => {
      handleWindowActive();
    };

    const handleOnline = () => {
      handleWindowActive();
    };

    if (typeof window !== 'undefined') {
      window.addEventListener(EVENTS.GUEST_ENDED, handleGuestEnded);
      window.addEventListener('focus', handleFocus);
      window.addEventListener('online', handleOnline);
    }
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', handleVisibilityChange);
    }

    return () => {
      isMountedRef.current = false;
      clearPollTimer();
      if (typeof window !== 'undefined') {
        window.removeEventListener(EVENTS.GUEST_ENDED, handleGuestEnded);
        window.removeEventListener('focus', handleFocus);
        window.removeEventListener('online', handleOnline);
      }
      if (typeof document !== 'undefined') {
        document.removeEventListener('visibilitychange', handleVisibilityChange);
      }
    };
  }, []);

  return { status, data, endedCode, offline, refresh, applyData };
};

export default useGuestTable;
