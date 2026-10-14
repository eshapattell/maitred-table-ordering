// liveSocket.js: Socket.io connection manager for guest sessions
import { io } from 'socket.io-client';
import { readGuestToken } from './guestService.js';

export const connectLive = () => {
  const token = readGuestToken();
  if (!token || typeof token !== 'string' || token.trim() === '') {
    return null;
  }

  return io({
    path: '/socket.io',
    auth: (callback) => {
      callback({ token: readGuestToken() });
    },
    transports: ['websocket', 'polling'],
    reconnectionDelayMax: 5000,
  });
};
