// phone.js: Indian mobile number helpers for maitred (pure functions, no database).
//
// Viva note: the number is NOT verified yet (there is no SMS code). Today it identifies a guest
// at a table and gives staff a masked contact. Verification can be added later without changing
// the stored format, which is always "+91" followed by 10 digits.

const MOBILE_DIGITS = /^[6-9]\d{9}$/;
const STORED_FORMAT = /^\+91[6-9]\d{9}$/;

/**
 * Turns what a guest typed into the stored format "+91XXXXXXXXXX", or null if it is not a valid
 * Indian mobile number. Accepts spaces, hyphens and brackets, an optional +91 or 91 prefix and
 * an optional leading 0. Only ASCII digits are accepted.
 */
export const normalisePhone = (input) => {
  if (typeof input !== 'string') {
    return null;
  }
  const trimmed = input.trim();
  if (trimmed.length === 0 || trimmed.length > 20) {
    return null;
  }
  // Digits, spaces, hyphens and brackets, with at most one "+" and only at the very start.
  if (!/^\+?[0-9\s\-()]+$/.test(trimmed)) {
    return null;
  }
  const hasPlus = trimmed.startsWith('+');
  let digits = trimmed.replace(/[^0-9]/g, '');
  if (hasPlus) {
    if (!digits.startsWith('91')) {
      return null;
    }
    digits = digits.slice(2);
  } else if (digits.length === 12 && digits.startsWith('91')) {
    digits = digits.slice(2);
  } else if (digits.length === 11 && digits.startsWith('0')) {
    digits = digits.slice(1);
  }
  return MOBILE_DIGITS.test(digits) ? `+91${digits}` : null;
};

/**
 * Hides the middle of a stored number for screens: "+919824079988" becomes "+91 98••• ••988".
 * Returns "" for anything that is not in the stored format (for example a number that was
 * erased when the session closed).
 */
export const maskPhone = (stored) => {
  if (typeof stored !== 'string' || !STORED_FORMAT.test(stored)) {
    return '';
  }
  const digits = stored.slice(3);
  return `+91 ${digits.slice(0, 2)}••• ••${digits.slice(7)}`;
};
