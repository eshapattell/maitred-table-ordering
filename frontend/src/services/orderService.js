// orderService.js: API client functions for staff kitchen order management
import api from './api.js';

export const fetchActiveOrders = async () => {
  const res = await api.get('/orders');
  return res.data.orders;
};

export const updateDishStatus = async (orderId, orderItemId, status) => {
  const res = await api.patch(
    `/orders/${encodeURIComponent(orderId)}/items/${encodeURIComponent(orderItemId)}/status`,
    { status }
  );
  return res.data.order;
};
