// cartView.js: what a guest is allowed to see of the shared cart (pure, no database).
// FINAL drop-in (Task 10b). The server builds a PERSONAL view for each guest: it adds a safety flag
// computed for THAT guest from the current menu, hides surprise dishes completely, and never includes
// a phone number or another guest's allergies.
import { checkItemSafety } from './allergyFilter.js';
import { canEditLine, priceToPaise } from './cartRules.js';

export const SURPRISE_NAME = 'Surprise dish';
export const UNAVAILABLE_NAME = 'Unavailable dish';
export const FORMER_GUEST = 'Former guest';

const arrayOf = (value) => (Array.isArray(value) ? value : []);

// session: { cart, cartVersion, participants }, items: the menu documents for the cart's dishes
// (available or not), viewer: the guest's own participant entry.
export const buildCartView = (input) => {
  const { session, items, viewer } = input ?? {};
  const people = arrayOf(session?.participants).filter((p) => p && typeof p === 'object');
  const byId = new Map();
  for (const item of arrayOf(items)) {
    if (item && item._id !== undefined && item._id !== null) byId.set(String(item._id), item);
  }
  // A guest who has not answered the allergy question never sees anything marked safe.
  const declared = viewer?.allergiesDeclared === true;

  let totalPaise = 0;
  let totalQuantity = 0;
  let hasHiddenLines = false;

  const lines = arrayOf(session?.cart)
    .filter((line) => line && typeof line === 'object')
    .map((line) => {
      // A corrupt stored quantity is never guessed: the line is shown as unavailable and left out of the totals.
      const validQuantity = Number.isInteger(line.qty) && line.qty >= 1;
      const quantity = validQuantity ? line.qty : 0;
      const item = byId.get(String(line.itemId));
      const adder = people.find((p) => p.id === line.addedBy);
      const isSurprise = line.isSurprise === true;
      const paise = item ? priceToPaise(item.price) : null;
      const unavailable = !validQuantity || !item || item.available !== true || paise === null;

      let safeForYou = false;
      let reason = 'unavailable';
      let clashes = [];
      if (!unavailable) {
        if (!declared) {
          reason = 'allergies-not-declared';
        } else {
          const safety = checkItemSafety(viewer.allergies, item);
          safeForYou = safety.safe === true;
          reason = safety.reason;
          clashes = arrayOf(safety.clashes);
        }
      }

      totalQuantity += quantity;

      let counted = false;
      if (isSurprise) {
        hasHiddenLines = true;
        reason = null; // never explain why: it would describe the hidden dish
        clashes = [];
      } else if (!unavailable) {
        totalPaise += paise * quantity;
        counted = true;
      }

      return {
        id: String(line.cartItemId),
        menuItemId: isSurprise ? null : String(line.itemId),
        name: isSurprise ? SURPRISE_NAME : item ? item.name : UNAVAILABLE_NAME,
        price: isSurprise || unavailable ? null : paise / 100,
        quantity,
        lineTotal: counted ? (paise * quantity) / 100 : null,
        addedBy: { id: String(line.addedBy), nickname: adder && typeof adder.nickname === 'string' ? adder.nickname : FORMER_GUEST },
        isSurprise,
        canEdit: canEditLine(viewer, line),
        unavailable,
        safeForYou,
        reason,
        clashes,
      };
    });

  return {
    version: Number.isInteger(session?.cartVersion) && session.cartVersion >= 0 ? session.cartVersion : 0,
    lines,
    totalQuantity,
    total: totalPaise / 100,
    hasHiddenLines,
  };
};
