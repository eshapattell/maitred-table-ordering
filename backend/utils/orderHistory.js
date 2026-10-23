// orderHistory.js: what a guest may see of the orders already placed at their table (no database, no
// network). FINAL drop-in (Task 11e).
//
// Viva notes:
// - Every guest at the table sees the same history: which dishes were ordered, how many, by whom, and
//   whether a dish was cancelled. They never see prices, allergy information, cooking status, ids of
//   other tables or any phone number.
// - A surprise dish stays hidden (no name, no dish id) until it has been served and revealed.
// - Totals count only dishes that were not cancelled.
export const SURPRISE_NAME = 'Surprise dish';
const HEX24 = /^[0-9a-f]{24}$/i;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const idString = (value) => (typeof value === 'string' ? value : value && typeof value.toString === 'function' ? value.toString() : '');
const isPositiveInt = (n) => Number.isInteger(n) && n >= 1;
const timeOf = (value) => (value instanceof Date && Number.isFinite(value.getTime()) ? value.toISOString() : typeof value === 'string' && value !== '' ? value : null);

export const orderHistoryView = (orders) => {
  const rounds = [];
  let dishes = 0;
  let items = 0;
  for (const order of Array.isArray(orders) ? orders : []) {
    if (!order || typeof order !== 'object') continue;
    const rows = [];
    for (const item of Array.isArray(order.items) ? order.items : []) {
      if (!item || typeof item !== 'object') continue;
      if (typeof item.orderItemId !== 'string' || !UUID.test(item.orderItemId)) continue;
      if (!isPositiveInt(item.qty) || typeof item.name !== 'string' || item.name === '') continue;
      const hidden = item.isSurprise === true && !(item.revealed === true && item.status === 'served');
      const dishId = idString(item.itemId);
      const cancelled = item.status === 'cancelled';
      rows.push({
        id: item.orderItemId,
        menuItemId: hidden || !HEX24.test(dishId) ? null : dishId.toLowerCase(),
        name: hidden ? SURPRISE_NAME : item.name,
        qty: item.qty,
        orderedBy: typeof item.orderedBy === 'string' ? item.orderedBy : '',
        cancelled,
      });
      if (!cancelled) { dishes += 1; items += item.qty; }
    }
    if (rows.length === 0) continue;
    rounds.push({ id: idString(order._id), placedAt: timeOf(order.createdAt), items: rows });
  }
  return { orders: rounds, totals: { dishes, items } };
};
