// guestMenu.js: how the guest's menu is read (FINAL drop-in, Task 10a).
// The SERVER decides whether a dish is safe for this guest (GET /api/sessions/menu adds safe,
// clashes and reason). The browser only displays that flag and NEVER works safety out itself:
// these helpers do not look at a dish's allergen tags at all.
import { ALLERGENS } from './allergens.js';

// Only an exact true counts as safe. Missing, "true", 1 and null are all NOT safe (fail closed).
export const isSafeForGuest = (item) => item?.safe === true;

export const UNSAFE_MESSAGES = Object.freeze({
  unconfirmed: 'Allergens not yet confirmed by the restaurant',
  unknown: 'We cannot confirm this dish for you',
});

// The sentence shown on a dish that is not safe for this guest, or null when it is safe.
export const unsafeLabel = (item) => {
  if (isSafeForGuest(item)) return null;
  if (item?.reason === 'allergen') {
    const clashes = Array.isArray(item.clashes) ? item.clashes : [];
    const names = ALLERGENS.filter((a) => clashes.includes(a.value)).map((a) => a.label.toLowerCase());
    if (names.length > 0) return `Contains ${names.join(', ')}`;
  }
  if (item?.reason === 'unconfirmed') return UNSAFE_MESSAGES.unconfirmed;
  return UNSAFE_MESSAGES.unknown;
};

export const menuCounts = (items) => {
  const list = Array.isArray(items) ? items : [];
  const safe = list.filter(isSafeForGuest).length;
  return { total: list.length, safe, unsafe: list.length - safe };
};

export const filterGuestMenu = (items, hideUnsafe) => {
  const list = Array.isArray(items) ? items : [];
  return hideUnsafe === true ? list.filter(isSafeForGuest) : list;
};
