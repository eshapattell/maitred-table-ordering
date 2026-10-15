// orderRules.js: pure rules for placing an order and moving dishes through the kitchen (no database,
// no network). FINAL drop-in (Task 11a).
//
// Viva notes:
// - Only the host places the order, and everything that CAN be cooked is ordered; a line that cannot
//   be ordered simply stays in the cart (nothing is deleted and nothing blocks the rest).
// - Each dish on a ticket has its OWN status: the kitchen works dish by dish, not table by table.
// - A line is checked against the allergies of the guest who ADDED it. A dish that is unsafe for
//   somebody else at the table is fine: that guest simply does not eat it.
import { checkItemSafety } from './allergyFilter.js';

export const ITEM_STATUSES = Object.freeze(['placed', 'preparing', 'ready', 'served', 'cancelled']);
export const ACTIVE_STATUSES = Object.freeze(['placed', 'preparing', 'ready']);
const NEXT_STATUS = Object.freeze({ placed: 'preparing', preparing: 'ready', ready: 'served' });

// The staff live connection: a separate namespace with its own authentication.
export const KITCHEN_NAMESPACE = '/kitchen';
export const ORDER_EVENTS = Object.freeze({ ORDERS_CHANGED: 'orders:changed' });
export const KITCHEN_ROLES = Object.freeze(['owner', 'kitchen']);

export const LEFT_REASONS = Object.freeze({
  UNAVAILABLE: 'unavailable',
  NOT_SUITABLE: 'not-suitable',
  ADDER_LEFT: 'adder-left',
  ADDER_UNKNOWN: 'adder-allergies-unknown',
  SURPRISE: 'surprise',
  INVALID: 'invalid-line',
});

const HEX24 = /^[0-9a-f]{24}$/i;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const asObject = (body) => (body && typeof body === 'object' && !Array.isArray(body) ? body : {});
const idString = (value) => (typeof value === 'string' ? value : value && typeof value.toString === 'function' ? value.toString() : '');
const isPositiveInt = (n) => Number.isInteger(n) && n >= 1;
const isPrice = (n) => typeof n === 'number' && Number.isFinite(n) && n >= 0;
const toPaise = (rupees) => Math.round(rupees * 100);

export const isValidOrderId = (value) => typeof value === 'string' && HEX24.test(value);
export const isValidOrderItemId = (value) => typeof value === 'string' && UUID.test(value);

export const kitchenRoomFor = (restaurantId) => {
  const id = idString(restaurantId);
  return HEX24.test(id) ? `kitchen:${id.toLowerCase()}` : null;
};

// May this staff member listen to the kitchen? Only an owner or kitchen account with a restaurant.
export const staffSocketAccess = (user) => {
  if (!user || typeof user !== 'object' || Array.isArray(user)) return { allowed: false, reason: 'unknown-user' };
  if (!KITCHEN_ROLES.includes(user.role)) return { allowed: false, reason: 'role' };
  if (!kitchenRoomFor(user.restaurantId)) return { allowed: false, reason: 'no-restaurant' };
  return { allowed: true, reason: 'ok' };
};

// POST /sessions/orders body: { expectedVersion } where expectedVersion is the cart version the host was
// looking at. A stale version means "the cart changed under you", so nothing is ordered.
export const validateExpectedVersion = (body) => {
  const v = asObject(body).expectedVersion;
  return Number.isInteger(v) && v >= 0 ? { ok: true, expectedVersion: v } : { ok: false, message: 'expectedVersion must be a whole number' };
};

// PATCH body: { status }. "placed" is never a target (nothing moves back to the start).
export const validateStatusInput = (body) => {
  const s = asObject(body).status;
  return ['preparing', 'ready', 'served', 'cancelled'].includes(s) ? { ok: true, status: s } : { ok: false, message: 'status must be preparing, ready, served or cancelled' };
};

// One step forward, or "cancelled" while nothing has started. Everything else (skipping, going back,
// leaving served or cancelled, unknown values) is refused.
export const canMoveStatus = (from, to) => {
  if (typeof from !== 'string' || typeof to !== 'string') return false;
  if (NEXT_STATUS[from] === to) return true;
  return from === 'placed' && to === 'cancelled';
};

// Split the cart into lines that can be ordered and lines that stay in the cart.
export const classifyCartLines = ({ session, items }) => {
  const cart = Array.isArray(session?.cart) ? session.cart : [];
  const people = Array.isArray(session?.participants) ? session.participants : [];
  const dishes = new Map();
  for (const dish of Array.isArray(items) ? items : []) {
    if (dish && typeof dish === 'object') dishes.set(idString(dish._id), dish);
  }
  const ready = [];
  const left = [];
  for (const line of cart) {
    if (!line || typeof line !== 'object' || !isValidOrderItemId(line.cartItemId)) continue;
    const leave = (reason) => left.push({ cartItemId: line.cartItemId, reason });
    if (line.isSurprise === true) { leave(LEFT_REASONS.SURPRISE); continue; }
    if (!isPositiveInt(line.qty)) { leave(LEFT_REASONS.INVALID); continue; }
    const dish = dishes.get(idString(line.itemId));
    if (!dish || dish.available !== true || dish.archived === true || !isPrice(dish.price) || typeof dish.name !== 'string' || dish.name === '') { leave(LEFT_REASONS.UNAVAILABLE); continue; }
    const adder = people.find((p) => p && p.id === line.addedBy);
    if (!adder || adder.status !== 'approved') { leave(LEFT_REASONS.ADDER_LEFT); continue; }
    if (adder.allergiesDeclared !== true) { leave(LEFT_REASONS.ADDER_UNKNOWN); continue; }
    if (checkItemSafety(adder.allergies, dish).safe !== true) { leave(LEFT_REASONS.NOT_SUITABLE); continue; }
    ready.push({ line, dish, adder });
  }
  return { ready, left };
};

// How many lines stayed behind, and why (the host sees one calm sentence built from this).
export const placementSummary = (left) => {
  const byReason = {};
  for (const entry of Array.isArray(left) ? left : []) {
    if (entry && typeof entry.reason === 'string') byReason[entry.reason] = (byReason[entry.reason] || 0) + 1;
  }
  return { total: Object.values(byReason).reduce((a, b) => a + b, 0), byReason };
};

// The dish as it is at this moment: name, price and allergen tags are COPIED, so later menu changes
// never alter an order that was already placed.
export const freezeOrderItem = ({ line, dish, adder, orderItemId }) => ({
  orderItemId,
  itemId: dish._id,
  name: dish.name,
  price: dish.price,
  qty: line.qty,
  orderedBy: adder.nickname,
  allergyFlags: Array.isArray(dish.allergens) ? dish.allergens.filter((t) => typeof t === 'string') : [],
  isSurprise: false,
  revealed: false,
  status: 'placed',
});

// The allergies at the table at this moment, by nickname. Only seated guests who answered the
// question and have at least one allergy. Never a phone number, never an id.
export const tableAllergiesOf = (session) => {
  const people = Array.isArray(session?.participants) ? session.participants : [];
  const result = [];
  for (const p of people) {
    if (!p || p.status !== 'approved' || p.allergiesDeclared !== true || !Array.isArray(p.allergies)) continue;
    const allergies = p.allergies.filter((a) => typeof a === 'string' && a !== '');
    if (allergies.length > 0 && typeof p.nickname === 'string') result.push({ nickname: p.nickname, allergies: [...allergies] });
  }
  return result;
};

// Total in rupees from whole paise; cancelled dishes are not charged.
export const orderTotal = (items) => {
  let paise = 0;
  for (const item of Array.isArray(items) ? items : []) {
    if (!item || item.status === 'cancelled' || !isPrice(item.price) || !isPositiveInt(item.qty)) continue;
    paise += toPaise(item.price) * item.qty;
  }
  return paise / 100;
};

// The status of a whole order is WORKED OUT from its dishes and never stored, so it cannot disagree.
export const orderStatusOf = (items) => {
  const live = (Array.isArray(items) ? items : []).filter((i) => i && i.status !== 'cancelled');
  if (live.length === 0) return 'cancelled';
  const statuses = live.map((i) => i.status);
  if (statuses.some((s) => !ITEM_STATUSES.includes(s))) return 'preparing';
  if (statuses.every((s) => s === 'served')) return 'served';
  if (statuses.every((s) => s === 'placed')) return 'placed';
  if (statuses.every((s) => s === 'ready' || s === 'served')) return 'ready';
  return 'preparing';
};

export const isActiveOrder = (order) =>
  Array.isArray(order?.items) && order.items.some((i) => i && ACTIVE_STATUSES.includes(i.status));

// What the kitchen board may see of an order: no prices, no session id, no dish ids, no phones.
export const kitchenOrderView = (order) => ({
  id: idString(order?._id),
  tableNumber: order?.tableNumber ?? null,
  placedAt: order?.createdAt ?? null,
  status: orderStatusOf(order?.items),
  items: (Array.isArray(order?.items) ? order.items : []).filter((i) => i && typeof i === 'object').map((i) => ({
    id: i.orderItemId,
    name: i.name,
    qty: i.qty,
    orderedBy: i.orderedBy,
    allergyFlags: Array.isArray(i.allergyFlags) ? [...i.allergyFlags] : [],
    status: i.status,
  })),
  tableAllergies: (Array.isArray(order?.tableAllergies) ? order.tableAllergies : []).filter((t) => t && typeof t.nickname === 'string')
    .map((t) => ({ nickname: t.nickname, allergies: Array.isArray(t.allergies) ? [...t.allergies] : [] })),
});

// The host's short "still waiting for the kitchen" list (the only dishes they may still cancel).
export const placedItemsOf = (orders) => {
  const out = [];
  for (const order of Array.isArray(orders) ? orders : []) {
    for (const item of Array.isArray(order?.items) ? order.items : []) {
      if (item && item.status === 'placed') out.push({ orderId: idString(order._id), orderItemId: item.orderItemId, name: item.name, qty: item.qty, orderedBy: item.orderedBy });
    }
  }
  return out;
};
