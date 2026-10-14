// cartService.js: guest cart API service
import guestApi from './guestApi.js';

export const getCart = async () => {
  const response = await guestApi.get('/sessions/cart');
  return response.data?.cart;
};

export const addToCart = async (menuItemId) => {
  const response = await guestApi.post('/sessions/cart/items', { menuItemId });
  return response.data?.cart;
};

export const decreaseLine = async (cartItemId) => {
  const encodedId = encodeURIComponent(cartItemId);
  const response = await guestApi.patch(`/sessions/cart/items/${encodedId}`, { delta: -1 });
  return response.data?.cart;
};

export const removeLine = async (cartItemId) => {
  const encodedId = encodeURIComponent(cartItemId);
  const response = await guestApi.delete(`/sessions/cart/items/${encodedId}`);
  return response.data?.cart;
};
