// kitchenSocket.js: Socket.io connection manager for staff kitchen board
import { io } from 'socket.io-client';
import { KITCHEN_NAMESPACE } from '../utils/kitchenBoard.js';
import { readAuthToken } from './api.js';

export const connectKitchen = () => {
  const token = readAuthToken();
  if (!token || typeof token !== 'string' || token.trim() === '') {
    return null;
  }

  return io(KITCHEN_NAMESPACE, {
    path: '/socket.io',
    auth: (callback) => {
      callback({ token: readAuthToken() });
    },
    transports: ['websocket', 'polling'],
    reconnectionDelayMax: 5000,
  });
};
