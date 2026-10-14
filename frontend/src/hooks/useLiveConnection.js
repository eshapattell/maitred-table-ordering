// useLiveConnection.js: Hook managing the receive-only Socket.io live connection
import { useState, useEffect, useRef } from 'react';
import { connectLive } from '../services/liveSocket.js';
import { LIVE_EVENTS, actionsFor, nextLiveState } from '../utils/guestCart.js';

export const useLiveConnection = ({
  enabled,
  getCartVersion,
  onSessionChanged,
  onCartChanged,
  onLiveChange,
}) => {
  const [liveState, setLiveState] = useState('connecting');

  const getCartVersionRef = useRef(getCartVersion);
  const onSessionChangedRef = useRef(onSessionChanged);
  const onCartChangedRef = useRef(onCartChanged);
  const onLiveChangeRef = useRef(onLiveChange);

  getCartVersionRef.current = getCartVersion;
  onSessionChangedRef.current = onSessionChanged;
  onCartChangedRef.current = onCartChanged;
  onLiveChangeRef.current = onLiveChange;

  const liveStateRef = useRef('connecting');
  const isLiveRef = useRef(false);

  useEffect(() => {
    if (!enabled) {
      if (isLiveRef.current) {
        isLiveRef.current = false;
        onLiveChangeRef.current?.(false);
      }
      liveStateRef.current = 'connecting';
      setLiveState('connecting');
      return;
    }

    const socket = connectLive();
    if (!socket) {
      liveStateRef.current = 'connecting';
      setLiveState('connecting');
      return;
    }

    let active = true;

    const handleEvent = (eventName, payload) => {
      if (!active) return;
      const currentVersion = getCartVersionRef.current?.();
      const next = nextLiveState(liveStateRef.current, eventName);
      const wasLive = isLiveRef.current;
      const nowLive = next === 'live';

      liveStateRef.current = next;
      setLiveState(next);

      if (nowLive !== wasLive) {
        isLiveRef.current = nowLive;
        onLiveChangeRef.current?.(nowLive);
      }

      const todo = actionsFor(eventName, payload, currentVersion);
      if (todo.session) {
        onSessionChangedRef.current?.();
      }
      if (todo.cart) {
        onCartChangedRef.current?.();
      }
    };

    const onConnect = () => handleEvent('connect');
    const onDisconnect = () => handleEvent('disconnect');
    const onConnectError = (err) => handleEvent('connect_error', err);
    const onSessionChangedEvent = (payload) => handleEvent(LIVE_EVENTS.SESSION_CHANGED, payload);
    const onCartChangedEvent = (payload) => handleEvent(LIVE_EVENTS.CART_CHANGED, payload);

    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    socket.on('connect_error', onConnectError);
    socket.on(LIVE_EVENTS.SESSION_CHANGED, onSessionChangedEvent);
    socket.on(LIVE_EVENTS.CART_CHANGED, onCartChangedEvent);

    return () => {
      active = false;
      if (isLiveRef.current) {
        isLiveRef.current = false;
        onLiveChangeRef.current?.(false);
      }
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
      socket.off('connect_error', onConnectError);
      socket.off(LIVE_EVENTS.SESSION_CHANGED, onSessionChangedEvent);
      socket.off(LIVE_EVENTS.CART_CHANGED, onCartChangedEvent);
      socket.disconnect();
    };
  }, [enabled]);

  return { liveState };
};

export default useLiveConnection;
