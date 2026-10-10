// splitBill.js: pure bill-splitting functions for maitred (no database, no network, no AI).
//
// Viva note: money is calculated in whole PAISE (integers), never in fractional rupees.
// A floating point number cannot store 0.1 exactly, so adding rupee decimals can drift by a
// paisa. With integers the shares always add up to exactly the total.

export const SPLIT_MODES = Object.freeze(['equal', 'item', 'custom']);

const MAX_PARTICIPANTS = 50;
const MAX_RUPEES = 10000000; // one crore: far above any table bill, and keeps every number a safe integer
const MAX_QTY = 1000;

/** Converts rupees (a number with at most 2 decimals) to whole paise. Throws on anything else. */
export const toPaise = (rupees) => {
  if (typeof rupees !== 'number' || !Number.isFinite(rupees) || rupees < 0 || rupees > MAX_RUPEES) {
    throw new Error('Amount must be a number of rupees between 0 and 10000000');
  }
  const paise = Math.round(rupees * 100);
  // 19.99 * 100 is 1998.9999999999998 in floating point, so compare with a tiny tolerance.
  if (Math.abs(rupees * 100 - paise) > 1e-6) {
    throw new Error('Amount cannot have more than 2 decimal places');
  }
  return paise;
};

/** Converts whole paise back to rupees. */
export const toRupees = (paise) => paise / 100;

/** Checks the list of people at the table and returns a copy of it. */
const validateParticipants = (participantIds) => {
  if (
    !Array.isArray(participantIds) ||
    participantIds.length < 1 ||
    participantIds.length > MAX_PARTICIPANTS
  ) {
    throw new Error(`Between 1 and ${MAX_PARTICIPANTS} participants are required`);
  }
  const seen = new Set();
  for (const id of participantIds) {
    if (typeof id !== 'string' || id.trim() === '') {
      throw new Error('Every participant id must be a non-empty string');
    }
    if (seen.has(id)) {
      throw new Error('Participant ids must be unique');
    }
    seen.add(id);
  }
  return [...participantIds];
};

/** Turns order items ({ price, qty, orderedBy }) into whole-paise amounts per item line. */
const itemsToPaise = (items) => {
  if (!Array.isArray(items)) {
    throw new Error('Items must be an array');
  }
  return items.map((item) => {
    if (item === null || typeof item !== 'object') {
      throw new Error('Every item must be an object');
    }
    if (!Number.isInteger(item.qty) || item.qty < 1 || item.qty > MAX_QTY) {
      throw new Error('Item quantity must be a whole number from 1 to 1000');
    }
    const paise = toPaise(item.price) * item.qty;
    if (!Number.isSafeInteger(paise)) {
      throw new Error('Item amount is too large');
    }
    return { orderedBy: item.orderedBy, paise };
  });
};

const sumPaise = (list) => list.reduce((sum, value) => sum + value, 0);

/** The total of an order's items, in rupees. */
export const orderTotal = (items) => toRupees(sumPaise(itemsToPaise(items).map((i) => i.paise)));

/**
 * Equal split. Any leftover paise go one each to the first people in the list, so the shares
 * add up exactly: 100 rupees between 3 people is 33.34, 33.33, 33.33.
 */
export const splitEqual = (totalRupees, participantIds) => {
  const total = toPaise(totalRupees);
  const ids = validateParticipants(participantIds);
  const base = Math.floor(total / ids.length);
  const extra = total - base * ids.length; // always fewer than the number of people
  return ids.map((id, index) => ({
    participantId: id,
    amount: toRupees(base + (index < extra ? 1 : 0)),
  }));
};

/** Split by item: each person pays for the items they ordered (item.orderedBy). */
export const splitByItem = (items, participantIds) => {
  const ids = validateParticipants(participantIds);
  const owed = new Map(ids.map((id) => [id, 0]));
  for (const { orderedBy, paise } of itemsToPaise(items)) {
    if (!owed.has(orderedBy)) {
      throw new Error('An item was ordered by someone who is not in this bill');
    }
    owed.set(orderedBy, owed.get(orderedBy) + paise);
  }
  return ids.map((id) => ({ participantId: id, amount: toRupees(owed.get(id)) }));
};

/**
 * Custom split: the host enters an amount for every person (0 is allowed).
 * The amounts must add up to the bill exactly, to the paisa.
 */
export const splitCustom = (totalRupees, shares, participantIds) => {
  const total = toPaise(totalRupees);
  const ids = validateParticipants(participantIds);
  if (!Array.isArray(shares)) {
    throw new Error('Shares must be an array');
  }
  const entered = new Map();
  for (const share of shares) {
    if (share === null || typeof share !== 'object' || !ids.includes(share.participantId)) {
      throw new Error('A share belongs to someone who is not in this bill');
    }
    if (entered.has(share.participantId)) {
      throw new Error('A participant appears twice in the shares');
    }
    entered.set(share.participantId, toPaise(share.amount));
  }
  for (const id of ids) {
    if (!entered.has(id)) {
      throw new Error('Every participant needs a share (use 0 for no payment)');
    }
  }
  const sum = sumPaise([...entered.values()]);
  if (sum !== total) {
    throw new Error(
      `Shares add up to ${toRupees(sum).toFixed(2)} but the bill is ${toRupees(total).toFixed(2)}`
    );
  }
  return ids.map((id) => ({ participantId: id, amount: toRupees(entered.get(id)) }));
};

/**
 * Builds a Bill document body: { splitMode, total, shares: [{ participantId, amount, paid }] }.
 * - equal:  needs total and participantIds
 * - item:   needs items and participantIds (the total is worked out from the items; if a total
 *           is also given it must match)
 * - custom: needs total, shares and participantIds
 */
export const splitBill = ({ mode, total, items, participantIds, shares } = {}) => {
  if (!SPLIT_MODES.includes(mode)) {
    throw new Error('Unknown split mode');
  }
  let totalPaise;
  let result;
  if (mode === 'equal') {
    totalPaise = toPaise(total);
    result = splitEqual(total, participantIds);
  } else if (mode === 'item') {
    totalPaise = sumPaise(itemsToPaise(items).map((i) => i.paise));
    if (total !== undefined && toPaise(total) !== totalPaise) {
      throw new Error('The total does not match the items');
    }
    result = splitByItem(items, participantIds);
  } else {
    totalPaise = toPaise(total);
    result = splitCustom(total, shares, participantIds);
  }
  // Final safety net: the shares must add up to the total in whole paise.
  if (sumPaise(result.map((r) => toPaise(r.amount))) !== totalPaise) {
    throw new Error('Internal error: shares do not add up to the total');
  }
  return {
    splitMode: mode,
    total: toRupees(totalPaise),
    shares: result.map((r) => ({ ...r, paid: false })),
  };
};
