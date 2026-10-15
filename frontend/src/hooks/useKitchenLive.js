// useKitchenLive.js: Hook managing receive-only Socket.io live connection for kitchen board
import { useState, useEffect, useRef } from 'react';
import { connectKitchen } from '../services/kitchenSocket.js';
import { KITCHEN_EVENTS, actionsForEvent, nextLiveState } from '../utils/kitchenBoard.js';

export const useKitchenLive = ({ enabled = true, onRefetch, onLiveChange } = {}) => {
  const [liveState, setLiveState] = useState('connecting');

  const onRefetchRef = useRef(onRefetch);
  const onLiveChangeRef = useRef(onLiveChange);

  onRefetchRef.current = onRefetch;
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

    const socket = connectKitchen();
    if (!socket) {
      liveStateRef.current = 'connecting';
      setLiveState('connecting');
      return;
    }

    let active = true;

    const handleEvent = (eventName) => {
      if (!active) return;
      const next = nextLiveState(liveStateRef.current, eventName);
      const wasLive = isLiveRef.current;
      const nowLive = next === 'live';

      liveStateRef.current = next;
      setLiveState(next);

      if (nowLive !== wasLive) {
        isLiveRef.current = nowLive;
        onLiveChangeRef.current?.(nowLive);
      }

      if (actionsForEvent(eventName).refetch) {
        onRefetchRef.current?.();
      }
    };

    const onConnect = () => handleEvent('connect');
    const onDisconnect = () => handleEvent('disconnect');
    const onConnectError = () => handleEvent('connect_error');
    const onOrdersChanged = () => handleEvent(KITCHEN_EVENTS.ORDERS_CHANGED);

    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    socket.on('connect_error', onConnectError);
    socket.on(KITCHEN_EVENTS.ORDERS_CHANGED, onOrdersChanged);

    return () => {
      active = false;
      if (isLiveRef.current) {
        isLiveRef.current = false;
        onLiveChangeRef.current?.(false);
      }
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
      socket.off('connect_error', onConnectError);
      socket.off(KITCHEN_EVENTS.ORDERS_CHANGED, onOrdersChanged);
      socket.disconnect();
    };
  }, [enabled]);

  return { liveState };
};

export default useKitchenLive;
