// guestOrderService.js: API service for host order placement and cancellation
import guestApi from './guestApi.js';

export const placeOrder = async (expectedVersion) => {
  const response = await guestApi.post('/sessions/orders', { expectedVersion });
  return response.data;
};

export const fetchPlacedItems = async () => {
  const response = await guestApi.get('/sessions/orders/placed');
  return Array.isArray(response?.data?.items) ? response.data.items : [];
};

export const cancelPlacedItem = async (orderId, orderItemId) => {
  const encodedOrderId = encodeURIComponent(orderId);
  const encodedItemId = encodeURIComponent(orderItemId);
  const response = await guestApi.post(`/sessions/orders/${encodedOrderId}/items/${encodedItemId}/cancel`);
  return response.data;
};
