// menuService.js: API client functions for menu management
import api from './api.js';

export const fetchMenu = async () => {
  const res = await api.get('/menu');
  return res.data.items;
};

export const createMenuItem = async (payload) => {
  const res = await api.post('/menu', payload);
  return res.data.item;
};

export const updateMenuItem = async (itemId, payload) => {
  const res = await api.patch(`/menu/${encodeURIComponent(itemId)}`, payload);
  return res.data.item;
};

export const confirmAllergens = async (itemId, allergens) => {
  const res = await api.post(`/menu/${encodeURIComponent(itemId)}/confirm-allergens`, { allergens });
  return res.data.item;
};

export const setAvailability = async (itemId, available) => {
  const res = await api.patch(`/menu/${encodeURIComponent(itemId)}/availability`, { available });
  return res.data.item;
};
