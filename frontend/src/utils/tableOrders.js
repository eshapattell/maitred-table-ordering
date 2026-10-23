// tableOrders.js: pure helpers for the "Ordered so far" list and the per-dish counts (FINAL drop-in,
// Task 11e). The SERVER decides what a guest may see (backend/utils/orderHistory.js); these helpers only
// tidy the answer and count it. tableOrders.test.js builds real answers with the backend's own rule, so
// the field names cannot drift apart.

const HEX24 = /^[0-9a-f]{24}$/i;

export const emptyHistory = () => ({ orders: [], totals: { dishes: 0, items: 0 } });

const cleanRow = (row) => {
  if (!row || typeof row !== 'object') return null;
  if (typeof row.id !== 'string' || row.id === '') return null;
  if (typeof row.name !== 'string' || row.name === '') return null;
  if (!Number.isInteger(row.qty) || row.qty < 1) return null;
  return {
    id: row.id,
    menuItemId: typeof row.menuItemId === 'string' && HEX24.test(row.menuItemId) ? row.menuItemId.toLowerCase() : null,
    name: row.name,
    qty: row.qty,
    orderedBy: typeof row.orderedBy === 'string' ? row.orderedBy : '',
    cancelled: row.cancelled === true,
  };
};

// Keep only rounds and rows that can be trusted, and work the totals out again from the rows (the
// totals the server sent are never trusted).
export const sanitizeHistory = (history) => {
  const orders = [];
  let dishes = 0;
  let items = 0;
  for (const round of Array.isArray(history?.orders) ? history.orders : []) {
    if (!round || typeof round !== 'object' || typeof round.id !== 'string' || round.id === '') continue;
    const rows = (Array.isArray(round.items) ? round.items : []).map(cleanRow).filter(Boolean);
    if (rows.length === 0) continue;
    for (const row of rows) if (!row.cancelled) { dishes += 1; items += row.qty; }
    orders.push({ id: round.id, placedAt: typeof round.placedAt === 'string' && round.placedAt !== '' ? round.placedAt : null, items: rows });
  }
  return { orders, totals: { dishes, items } };
};

// How many of each dish the whole table has ordered so far, across every order and every guest.
// Cancelled dishes and hidden (surprise) dishes are not counted. Returns { dishId: quantity }.
export const orderedQuantities = (history) => {
  const counts = {};
  for (const round of sanitizeHistory(history).orders) {
    for (const row of round.items) {
      if (row.cancelled || row.menuItemId === null) continue;
      counts[row.menuItemId] = (counts[row.menuItemId] || 0) + row.qty;
    }
  }
  return counts;
};

export const orderedQuantityFor = (history, menuItemId) => {
  if (typeof menuItemId !== 'string' || !HEX24.test(menuItemId)) return 0;
  return orderedQuantities(history)[menuItemId.toLowerCase()] || 0;
};

// The rounds in the order they were placed, numbered from 1.
export const roundsOf = (history) => sanitizeHistory(history).orders.map((round, index) => ({ number: index + 1, id: round.id, placedAt: round.placedAt, rows: round.items }));

export const historySummary = (history) => {
  const clean = sanitizeHistory(history);
  return { rounds: clean.orders.length, dishes: clean.totals.dishes, items: clean.totals.items, hasOrders: clean.totals.items > 0 };
};

export const HISTORY_MESSAGES = Object.freeze({
  network: 'We could not reach the restaurant. Please check your connection and try again.',
  tryAgain: 'Please try again in a moment',
  tooMany: 'Too many attempts. Please wait a moment and try again.',
  generic: 'Something went wrong. Please try again.',
});

// Wording for a failed load of the list. Never shows the server's own text.
export const historyErrorMessage = (err) => {
  const response = err?.response;
  if (!response) return HISTORY_MESSAGES.network;
  if (response.status === 503) return HISTORY_MESSAGES.tryAgain;
  if (response.status === 429) return HISTORY_MESSAGES.tooMany;
  return HISTORY_MESSAGES.generic;
};
