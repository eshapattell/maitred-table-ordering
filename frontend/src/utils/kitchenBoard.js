// kitchenBoard.js: pure helpers for the kitchen board screen (FINAL drop-in, Task 11b).
// The SERVER decides what a dish may do next and who may see what; these helpers only decide what to
// SHOW and when to ASK AGAIN. kitchenBoard.test.js builds real tickets with the backend's own code,
// so the field names cannot drift apart.

// Must match backend/utils/orderRules.js (a test enforces it).
export const KITCHEN_NAMESPACE = '/kitchen';
export const KITCHEN_EVENTS = Object.freeze({ ORDERS_CHANGED: 'orders:changed' });

// While the live connection works the board only needs a slow safety-net refresh.
export const BOARD_POLL_LIVE_MS = 30000;
export const BOARD_POLL_FALLBACK_MS = 5000;
export const pollIntervalFor = (live) => (live === true ? BOARD_POLL_LIVE_MS : BOARD_POLL_FALLBACK_MS);

const NEXT = Object.freeze({ placed: 'preparing', preparing: 'ready', ready: 'served' });
const OPEN = Object.freeze(['placed', 'preparing', 'ready']);

// The one step forward a dish can take, or null when it is finished (served or cancelled).
export const nextStatusOf = (status) => (typeof status === 'string' && Object.prototype.hasOwnProperty.call(NEXT, status) ? NEXT[status] : null);

// A dish can only be cancelled while the kitchen has not started it.
export const canCancelDish = (dish) => dish?.status === 'placed';

// Which buttons a dish gets: one forward button, and Cancel while it is still "placed".
export const dishActions = (dish) => ({ next: nextStatusOf(dish?.status), canCancel: canCancelDish(dish) });

export const isOpenDish = (dish) => Boolean(dish) && OPEN.includes(dish.status);

// Dishes still to cook or serve, and dishes that are finished, in ticket order.
export const splitDishes = (order) => {
  const dishes = (Array.isArray(order?.items) ? order.items : []).filter((d) => d && typeof d === 'object');
  return { open: dishes.filter(isOpenDish), done: dishes.filter((d) => !isOpenDish(d)) };
};

// "Asha: tree nut" lines for the allergy banner at the top of a ticket. Nothing else about the guest.
export const allergyLines = (order) =>
  (Array.isArray(order?.tableAllergies) ? order.tableAllergies : [])
    .filter((t) => t && typeof t.nickname === 'string' && Array.isArray(t.allergies))
    .map((t) => ({ nickname: t.nickname, allergies: t.allergies.filter((a) => typeof a === 'string' && a !== '') }))
    .filter((t) => t.allergies.length > 0)
    .map((t) => `${t.nickname}: ${t.allergies.join(', ')}`);

export const hasAllergyWarning = (order) => allergyLines(order).length > 0;

// The allergen tags of one dish (what it contains), or an empty list.
export const dishAllergens = (dish) => (Array.isArray(dish?.allergyFlags) ? dish.allergyFlags.filter((a) => typeof a === 'string' && a !== '') : []);

// Whole minutes since the order was placed; null when the time cannot be read.
export const waitMinutes = (placedAt, now = new Date()) => {
  const placed = placedAt instanceof Date ? placedAt.getTime() : typeof placedAt === 'string' || typeof placedAt === 'number' ? new Date(placedAt).getTime() : NaN;
  const current = now instanceof Date ? now.getTime() : NaN;
  if (!Number.isFinite(placed) || !Number.isFinite(current)) return null;
  return Math.max(0, Math.floor((current - placed) / 60000));
};

// Oldest order first (an order with no readable time goes last), then by id so the order is stable.
export const sortOrders = (orders) => {
  const time = (o) => {
    const raw = o?.placedAt;
    const readable = (typeof raw === 'string' && raw !== '') || typeof raw === 'number' || raw instanceof Date;
    const t = readable ? new Date(raw).getTime() : NaN;
    return Number.isFinite(t) ? t : Infinity;
  };
  return (Array.isArray(orders) ? orders : []).filter((o) => o && typeof o === 'object').sort((a, b) => (time(a) - time(b)) || String(a.id).localeCompare(String(b.id)));
};

export const boardSummary = (orders) => {
  const byStatus = { placed: 0, preparing: 0, ready: 0 };
  let openDishes = 0;
  const list = (Array.isArray(orders) ? orders : []).filter((o) => o && typeof o === 'object');
  for (const order of list) {
    for (const dish of splitDishes(order).open) { byStatus[dish.status] += 1; openDishes += 1; }
  }
  return { orders: list.length, openDishes, byStatus };
};

// What to do when something happens on the live connection. The connection carries no data, so the
// answer is always "ask the normal route again". A refused connection also asks: if the staff login
// has expired, that request answers 401 and the staff client signs the person out.
export const actionsForEvent = (event) => ({
  refetch: event === 'connect' || event === KITCHEN_EVENTS.ORDERS_CHANGED || event === 'connect_error',
});

export const nextLiveState = (state, event) => {
  if (event === 'connect') return 'live';
  if (event === 'disconnect' || event === 'connect_error') return 'reconnecting';
  return state === 'live' || state === 'reconnecting' ? state : 'connecting';
};

export const BOARD_MESSAGES = Object.freeze({
  dishMoved: 'That dish has already moved on',
  orderGone: 'That order is no longer on the board',
  tryAgain: 'Please try again in a moment',
  tooMany: 'Too many attempts. Please wait a moment and try again.',
  network: 'We could not reach the server. Please check the connection and try again.',
  generic: 'Something went wrong. Please try again.',
});

// Wording for a failed kitchen action. Never shows the server's own text.
export const boardErrorMessage = (err) => {
  const response = err?.response;
  if (!response) return BOARD_MESSAGES.network;
  const code = response.data && typeof response.data === 'object' ? response.data.code : undefined;
  if (code === 'INVALID_MOVE') return BOARD_MESSAGES.dishMoved;
  if (code === 'ORDER_NOT_FOUND') return BOARD_MESSAGES.orderGone;
  if (code === 'TRY_AGAIN' || response.status === 503) return BOARD_MESSAGES.tryAgain;
  if (response.status === 429) return BOARD_MESSAGES.tooMany;
  return BOARD_MESSAGES.generic;
};

// After these answers the board was out of date, so refresh it.
export const staleAfterBoardError = (err) => {
  const response = err?.response;
  if (!response) return false;
  const code = response.data && typeof response.data === 'object' ? response.data.code : undefined;
  return code === 'INVALID_MOVE' || code === 'ORDER_NOT_FOUND' || code === 'TRY_AGAIN' || response.status === 503;
};
