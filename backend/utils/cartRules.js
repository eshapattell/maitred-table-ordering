// cartRules.js: the pure rules for the shared table cart (no database, no network).
// FINAL drop-in (Task 10b). The database operations live in the controller; these functions decide
// what is allowed, so they can be tested without a database.

export const CART_LIMITS = Object.freeze({ maxLines: 40, maxQuantity: 20 });

const HEX24 = /^[0-9a-fA-F]{24}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

export const isValidItemId = (value) => typeof value === 'string' && HEX24.test(value);
export const isValidCartItemId = (value) => typeof value === 'string' && UUID.test(value);

// A quantity is a real whole number from 1 to the limit. Strings, decimals, NaN and null are not.
const isQuantity = (n) => typeof n === 'number' && Number.isInteger(n) && n >= 1 && n <= CART_LIMITS.maxQuantity;

const asObject = (body) => (body && typeof body === 'object' && !Array.isArray(body) ? body : {});

// Body of POST /cart/items: { menuItemId, quantity? } (quantity defaults to 1 only when it is absent).
export const validateAddInput = (body) => {
  const b = asObject(body);
  if (!isValidItemId(b.menuItemId)) return { ok: false, message: 'Invalid menuItemId' };
  const quantity = b.quantity === undefined ? 1 : b.quantity;
  if (!isQuantity(quantity)) return { ok: false, message: 'Quantity must be a whole number from 1 to 20' };
  return { ok: true, menuItemId: b.menuItemId, quantity };
};

// Body of PATCH /cart/items/:id: exactly { delta: -1 } (take one off). Adding more always goes through
// POST /cart/items, which is where the allergy check lives. The decrease is applied with one atomic
// operation that checks "quantity is above 1" in the same step, so two phones tapping at once can
// never push a quantity below 1.
export const validateDecreaseInput = (body) => {
  const b = asObject(body);
  return b.delta === -1 ? { ok: true } : { ok: false, message: 'delta must be -1' };
};

// Who may change or remove a line: an APPROVED guest for their own lines, and the host for any line.
export const canEditLine = (viewer, line) => {
  if (!viewer || typeof viewer !== 'object' || viewer.status !== 'approved') return false;
  if (typeof viewer.id !== 'string' || viewer.id === '') return false;
  if (!line || typeof line !== 'object') return false;
  return viewer.role === 'host' || line.addedBy === viewer.id;
};

// A price in rupees (at most two decimals) as whole paise, or null when it is not a usable price.
export const priceToPaise = (price) => {
  if (typeof price !== 'number' || !Number.isFinite(price) || price <= 0 || price > 100000) return null;
  const paise = Math.round(price * 100);
  return Math.abs(price * 100 - paise) < 1e-6 ? paise : null;
};

// The exact shape stored in TableSession.cart for an ordinary (not surprise) line.
export const newCartLine = (input) => {
  const { cartItemId, itemId, quantity, addedBy } = input ?? {};
  if (!isValidCartItemId(cartItemId) || !isValidItemId(String(itemId)) || !isQuantity(quantity) || typeof addedBy !== 'string' || addedBy === '') {
    throw new TypeError('Invalid cart line');
  }
  return { cartItemId, itemId, qty: quantity, addedBy, isSurprise: false };
};
