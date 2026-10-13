// guestService.js: API functions and token helpers for guest sessions
import guestApi from './guestApi.js';
import { STORAGE_KEYS } from '../utils/constants.js';

export const joinTable = async ({ restaurantId, tableNumber, qrToken, phone, nickname }) => {
  const response = await guestApi.post('/sessions/join', {
    restaurantId,
    tableNumber,
    qrToken,
    phone,
    nickname,
  });
  return response.data;
};

export const fetchMyTable = async () => {
  const response = await guestApi.get('/sessions/me');
  return response.data;
};

export const declareAllergies = async (allergies) => {
  const response = await guestApi.post('/sessions/allergies', { allergies });
  return response.data;
};

export const fetchGuestMenu = async () => {
  const response = await guestApi.get('/sessions/menu');
  return Array.isArray(response.data?.items) ? response.data.items : [];
};

export const approveGuest = async (id) => {
  const encodedId = encodeURIComponent(id);
  const response = await guestApi.post(`/sessions/participants/${encodedId}/approve`);
  return response.data;
};

export const rejectGuest = async (id) => {
  const encodedId = encodeURIComponent(id);
  const response = await guestApi.post(`/sessions/participants/${encodedId}/reject`);
  return response.data;
};

export const saveGuestToken = (token) => {
  if (typeof token === 'string' && token.trim() !== '') {
    sessionStorage.setItem(STORAGE_KEYS.GUEST_TOKEN, token);
  }
};

export const readGuestToken = () => {
  if (typeof sessionStorage === 'undefined') return '';
  const token = sessionStorage.getItem(STORAGE_KEYS.GUEST_TOKEN);
  return typeof token === 'string' ? token : '';
};

export const clearGuestToken = () => {
  if (typeof sessionStorage !== 'undefined') {
    sessionStorage.removeItem(STORAGE_KEYS.GUEST_TOKEN);
  }
};
