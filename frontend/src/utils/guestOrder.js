// guestOrder.js: pure helpers for the host's "Place order" step (FINAL drop-in, Task 11d).
// The SERVER decides which lines can be ordered and who may order; these helpers only decide what to
// SHOW and when to ASK AGAIN. guestOrder.test.js builds real server answers with the backend's own
// rules, and reads the backend's source for the error codes, so the names cannot drift apart.
import { isHost } from './guestSession.js';

// Why a cart line stayed in the cart. The keys must match LEFT_REASONS in backend/utils/orderRules.js.
export const LEFT_LABELS = Object.freeze({
  unavailable: 'unavailable',
  'not-suitable': 'not suitable for who added it',
  'adder-left': 'added by someone who left',
  'adder-allergies-unknown': 'allergies not known',
  surprise: 'surprise dish',
  'invalid-line': 'not valid',
});

const ORDER_OF_REASONS = Object.freeze(Object.keys(LEFT_LABELS));

// Only the host sees a Place order button, and only when there is something in the cart. The server
// still decides what can really be ordered.
export const canPlaceOrder = ({ cart, viewer }) =>
  isHost(viewer) && Array.isArray(cart?.lines) && cart.lines.length > 0 && Number.isInteger(cart.version) && cart.version >= 0;

// "unavailable: 2, not suitable for who added it: 1" from a { reason: count } object, in a fixed order.
export const leftPhrase = (byReason) => {
  if (!byReason || typeof byReason !== 'object' || Array.isArray(byReason)) return '';
  const parts = [];
  let other = 0;
  for (const [reason, count] of Object.entries(byReason)) {
    if (!Number.isInteger(count) || count < 1) continue;
    if (!ORDER_OF_REASONS.includes(reason)) other += count;
  }
  for (const reason of ORDER_OF_REASONS) {
    const count = byReason[reason];
    if (Number.isInteger(count) && count > 0) parts.push(`${LEFT_LABELS[reason]}: ${count}`);
  }
  if (other > 0) parts.push(`other: ${other}`);
  return parts.join(', ');
};

const plural = (n, one, many) => (n === 1 ? `1 ${one}` : `${n} ${many}`);

// The calm sentence the host sees after a successful placement.
export const placementMessage = (answer) => {
  const placed = Number.isInteger(answer?.placed) && answer.placed > 0 ? answer.placed : 0;
  if (placed === 0) return '';
  const byReason = answer?.summary?.byReason;
  const detail = leftPhrase(byReason);
  const left = Number.isInteger(answer?.summary?.total) && answer.summary.total > 0 ? answer.summary.total : 0;
  let text = `Order placed: ${plural(placed, 'dish', 'dishes')} sent to the kitchen.`;
  if (left > 0 && detail !== '') text += ` ${plural(left, 'item was', 'items were')} left in the cart (${detail}).`;
  return text;
};

export const ORDER_MESSAGES = Object.freeze({
  cartChanged: 'The order just changed. Please check it and press Place order again',
  nothingToOrder: 'Nothing in the cart can be ordered right now',
  alreadyStarted: 'The kitchen has already started this dish',
  dishGone: 'That dish is no longer on the list',
  tryAgain: 'Please try again in a moment',
  tooMany: 'Too many attempts. Please wait a moment and try again.',
  network: 'We could not reach the restaurant. Please check your connection and try again.',
  generic: 'Something went wrong. Please try again.',
});

// Wording for a failed placement or cancellation. Never shows the server's own text.
export const orderErrorMessage = (err) => {
  const response = err?.response;
  if (!response) return ORDER_MESSAGES.network;
  const data = response.data && typeof response.data === 'object' ? response.data : {};
  switch (data.code) {
    case 'CART_CHANGED': return ORDER_MESSAGES.cartChanged;
    case 'NOTHING_TO_ORDER': {
      const reasons = {};
      for (const entry of Array.isArray(data.left) ? data.left : []) {
        if (entry && typeof entry.reason === 'string') reasons[entry.reason] = (reasons[entry.reason] || 0) + 1;
      }
      const detail = leftPhrase(reasons);
      return detail === '' ? ORDER_MESSAGES.nothingToOrder : `${ORDER_MESSAGES.nothingToOrder} (${detail})`;
    }
    case 'ALREADY_STARTED': return ORDER_MESSAGES.alreadyStarted;
    case 'ORDER_ITEM_NOT_FOUND': return ORDER_MESSAGES.dishGone;
    case 'TRY_AGAIN': return ORDER_MESSAGES.tryAgain;
    default: break;
  }
  if (response.status === 503) return ORDER_MESSAGES.tryAgain;
  if (response.status === 429) return ORDER_MESSAGES.tooMany;
  return ORDER_MESSAGES.generic;
};

// After these answers the screen was out of date, so refresh the cart and the waiting list.
const STALE_CODES = Object.freeze(['CART_CHANGED', 'NOTHING_TO_ORDER', 'ALREADY_STARTED', 'ORDER_ITEM_NOT_FOUND', 'TRY_AGAIN']);
export const staleAfterOrderError = (err) => {
  const response = err?.response;
  if (!response) return false;
  return STALE_CODES.includes(response?.data?.code) || response.status === 503;
};

const HEX24 = /^[0-9a-f]{24}$/i;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// One row of the host's "sent to the kitchen" list, or null when the row cannot be trusted.
export const placedRow = (item) => {
  if (!item || typeof item !== 'object') return null;
  if (typeof item.orderId !== 'string' || !HEX24.test(item.orderId)) return null;
  if (typeof item.orderItemId !== 'string' || !UUID.test(item.orderItemId)) return null;
  if (typeof item.name !== 'string' || item.name === '') return null;
  if (!Number.isInteger(item.qty) || item.qty < 1) return null;
  return { orderId: item.orderId, orderItemId: item.orderItemId, name: item.name, qty: item.qty, orderedBy: typeof item.orderedBy === 'string' ? item.orderedBy : '' };
};

export const placedRows = (items) => (Array.isArray(items) ? items.map(placedRow).filter(Boolean) : []);
