// guestCart.js: pure helpers for the shared cart screens (FINAL drop-in, Task 10c).
// The SERVER decides everything that matters: the cart a guest sees is built for THAT guest (safety
// flags, who may edit which line), and every change is checked again when it is saved. These helpers
// only decide what to SHOW and when to ASK AGAIN. guestCart.test.js builds real cart views with the
// backend's own code, so the field names cannot drift apart.
import { GUEST_POLL_MS } from './guestSession.js';
import { unsafeLabel } from './guestMenu.js';

// Event names of the live connection. Must match backend/utils/liveRules.js (a test enforces it).
export const LIVE_EVENTS = Object.freeze({
  SESSION_CHANGED: 'session:changed',
  CART_CHANGED: 'cart:changed',
});

// Must match CART_LIMITS.maxQuantity in backend/utils/cartRules.js (a test enforces it).
export const CART_MAX_QUANTITY = 20;

// While the live connection works the page only needs a slow safety-net refresh; without it, every 5 seconds.
export const LIVE_SAFETY_POLL_MS = 30000;
export const pollIntervalFor = (live) => (live === true ? LIVE_SAFETY_POLL_MS : GUEST_POLL_MS);

export const emptyCart = () => ({ version: 0, lines: [], totalQuantity: 0, total: 0, hasHiddenLines: false });

const isCart = (cart) =>
  Boolean(cart) && typeof cart === 'object' && Number.isInteger(cart.version) && cart.version >= 0 && Array.isArray(cart.lines);

// Show an incoming cart only if it is not OLDER than the one on screen (a slow answer must never
// replace a newer one). A malformed answer is never shown.
export const shouldApplyCart = (current, incoming) => {
  if (!isCart(incoming)) return false;
  if (!isCart(current)) return true;
  return incoming.version >= current.version;
};

// Should a "cart changed" ping make us ask for the cart? Yes unless the ping is clearly not newer
// than what we hold. A ping we cannot read means "ask, to be safe".
export const shouldFetchForPing = (currentVersion, payload) => {
  const version = payload?.version;
  if (!Number.isInteger(version) || version < 0) return true;
  if (!Number.isInteger(currentVersion)) return true;
  return version > currentVersion;
};

// What to ask for when something happens on the live connection. The connection carries no data, so
// the answer is always "ask the normal routes". A refused connection (connect_error) is NEVER read as
// "you were removed": it only means "ask the normal route what is going on".
export const actionsFor = (event, payload, cartVersion) => {
  switch (event) {
    case 'connect':
      return { session: true, cart: true };
    case LIVE_EVENTS.SESSION_CHANGED:
      return { session: true, cart: true };
    case LIVE_EVENTS.CART_CHANGED:
      return { session: false, cart: shouldFetchForPing(cartVersion, payload) };
    case 'connect_error':
      return { session: true, cart: false };
    default:
      return { session: false, cart: false };
  }
};

// The state of the live connection: "connecting", "live" or "reconnecting".
export const nextLiveState = (state, event) => {
  if (event === 'connect') return 'live';
  if (event === 'disconnect' || event === 'connect_error') return 'reconnecting';
  return state === 'live' || state === 'reconnecting' ? state : 'connecting';
};

export const cartSummary = (cart) => ({
  itemCount: Number.isInteger(cart?.totalQuantity) && cart.totalQuantity > 0 ? cart.totalQuantity : 0,
  total: Number.isFinite(cart?.total) && cart.total >= 0 ? cart.total : 0,
  hasLines: Array.isArray(cart?.lines) && cart.lines.length > 0,
});

// How many of a dish THIS guest has in the cart (their own line only).
export const myQuantityFor = (cart, menuItemId, viewerId) => {
  if (typeof menuItemId !== 'string' || menuItemId === '' || typeof viewerId !== 'string' || viewerId === '') return 0;
  const lines = Array.isArray(cart?.lines) ? cart.lines : [];
  return lines
    .filter((line) => line && line.isSurprise !== true && line.menuItemId === menuItemId && line.addedBy?.id === viewerId && line.unavailable !== true)
    .reduce((sum, line) => sum + (Number.isInteger(line.quantity) && line.quantity > 0 ? line.quantity : 0), 0);
};

// Lines grouped by the guest who added them, in the order they first appear.
export const groupLinesByAdder = (cart) => {
  const groups = [];
  const byId = new Map();
  for (const line of Array.isArray(cart?.lines) ? cart.lines : []) {
    if (!line || typeof line !== 'object') continue;
    const id = typeof line.addedBy?.id === 'string' ? line.addedBy.id : '';
    const nickname = typeof line.addedBy?.nickname === 'string' && line.addedBy.nickname !== '' ? line.addedBy.nickname : 'Former guest';
    if (!byId.has(id)) {
      const group = { adder: { id, nickname }, lines: [] };
      byId.set(id, group);
      groups.push(group);
    }
    byId.get(id).lines.push(line);
  }
  return groups;
};

// Which buttons a line gets. "+" only ever adds to the guest's OWN line (adding goes through the add
// route, where the allergy check lives), and only while the dish is safe for them and still available.
// "-" and "Remove" follow the server's own canEdit flag. A surprise line gets no buttons at all.
export const lineActions = (line, viewerId) => {
  const none = { canIncrease: false, canDecrease: false, canRemove: false };
  if (!line || typeof line !== 'object' || line.isSurprise === true) return none;
  const quantity = Number.isInteger(line.quantity) ? line.quantity : 0;
  const canEdit = line.canEdit === true;
  const own = typeof viewerId === 'string' && viewerId !== '' && line.addedBy?.id === viewerId;
  return {
    canIncrease: own && canEdit && line.unavailable !== true && line.safeForYou === true && quantity >= 1 && quantity < CART_MAX_QUANTITY,
    canDecrease: canEdit && quantity > 1,
    canRemove: canEdit,
  };
};

// The note shown on a line that is not fine for this guest, or null when it is fine. It reuses the
// wording of the menu so a dish reads the same everywhere.
export const lineWarning = (line) => {
  if (!line || typeof line !== 'object' || line.isSurprise === true) return null;
  if (line.unavailable === true) return 'No longer available';
  if (line.safeForYou === true) return null;
  return unsafeLabel({ safe: false, reason: line.reason, clashes: line.clashes });
};

export const CART_MESSAGES = Object.freeze({
  notAdded: 'Not added',
  itemGone: 'This dish is no longer available',
  qtyLimit: 'You have reached the limit for this dish',
  cartFull: 'The order for this table is full',
  minQty: 'Use Remove to take the last one off',
  lineChanged: 'That item has already changed',
  tryAgain: 'Please try again in a moment',
  tooMany: 'Too many attempts. Please wait a moment and try again.',
  network: 'We could not reach the restaurant. Please check your connection and try again.',
  generic: 'Something went wrong. Please try again.',
});

// Wording for a failed cart change. Never shows the server's own text.
export const cartErrorMessage = (err) => {
  const response = err?.response;
  if (!response) return CART_MESSAGES.network;
  const data = response.data && typeof response.data === 'object' ? response.data : {};
  switch (data.code) {
    case 'NOT_SAFE':
      return `${CART_MESSAGES.notAdded}. ${unsafeLabel({ safe: false, reason: data.reason, clashes: data.clashes })}`;
    case 'ITEM_NOT_FOUND': return CART_MESSAGES.itemGone;
    case 'QTY_LIMIT': return CART_MESSAGES.qtyLimit;
    case 'CART_FULL': return CART_MESSAGES.cartFull;
    case 'MIN_QTY': return CART_MESSAGES.minQty;
    case 'CART_ITEM_NOT_FOUND': return CART_MESSAGES.lineChanged;
    case 'TRY_AGAIN': return CART_MESSAGES.tryAgain;
    default: break;
  }
  if (response.status === 503) return CART_MESSAGES.tryAgain;
  if (response.status === 429) return CART_MESSAGES.tooMany;
  return CART_MESSAGES.generic;
};

// After these answers the screen was out of date, so refresh both the cart and the menu.
const STALE_CODES = Object.freeze(['ITEM_NOT_FOUND', 'CART_ITEM_NOT_FOUND', 'QTY_LIMIT', 'CART_FULL', 'MIN_QTY', 'NOT_SAFE', 'TRY_AGAIN']);
export const staleAfter = (err) => {
  const response = err?.response;
  if (!response) return false;
  return STALE_CODES.includes(response?.data?.code) || response.status === 503;
};
