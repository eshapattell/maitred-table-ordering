// allergyFilter.js: Deterministic, rule-based allergy safety engine for maitred
// Principles: Plain JavaScript only, zero external dependencies, fail-closed safety.

/**
 * Standard list of recognized food allergens monitored by maitred.
 * Frozen to prevent accidental runtime mutations.
 */
export const KNOWN_ALLERGENS = Object.freeze([
  'peanut',
  'tree nut',
  'dairy',
  'egg',
  'gluten',
  'soy',
  'fish',
  'shellfish',
  'sesame',
  'mustard',
]);

/**
 * Normalises an individual allergen string:
 * - Returns empty string for non-string values.
 * - Trims, lowercases, and collapses multiple whitespace characters to a single space.
 */
export const normaliseAllergen = (value) => {
  if (typeof value !== 'string') {
    return '';
  }
  return value.trim().toLowerCase().replace(/\s+/g, ' ');
};

/**
 * Normalises an array of allergen entries:
 * - Returns empty array if input is not an array.
 * - Drops non-strings and empty strings.
 * - Returns a sorted, de-duplicated array of normalised allergen tokens.
 */
export const normaliseAllergies = (list) => {
  if (!Array.isArray(list)) {
    return [];
  }
  const set = new Set();
  for (let i = 0; i < list.length; i++) {
    const entry = list[i];
    if (typeof entry === 'string') {
      const normalised = normaliseAllergen(entry);
      if (normalised.length > 0) {
        set.add(normalised);
      }
    }
  }
  return [...set].sort();
};

/**
 * Validates whether a value is a plain JavaScript object (not null, not array, typeof object).
 */
const isObject = (val) => val !== null && typeof val === 'object' && !Array.isArray(val);

/**
 * Determines whether a dish is safe for a guest with given allergies.
 * Applies safety rules in strict sequential order, stopping at the first matching rule.
 *
 * @param {Array<string>} participantAllergies - Raw list of guest-declared allergies
 * @param {Object} item - Menu item object to test for safety
 * @returns {{ safe: boolean, clashes: Array<string>, reason: string }}
 */
export const checkItemSafety = (participantAllergies, item) => {
  // 1. Fail closed if the menu item is not a valid object
  if (!isObject(item)) {
    return { safe: false, clashes: [], reason: 'invalid' };
  }

  // 2. Fail closed if participantAllergies is not an array or contains any non-string item
  // Plain index loop ensures sparse array holes (undefined) are detected as non-strings.
  if (!Array.isArray(participantAllergies)) {
    return { safe: false, clashes: [], reason: 'invalid' };
  }
  for (let i = 0; i < participantAllergies.length; i++) {
    if (typeof participantAllergies[i] !== 'string') {
      return { safe: false, clashes: [], reason: 'invalid' };
    }
  }

  // 3. Normalise guest allergies; if no valid allergies remain, the dish is safe.
  // Viva note: If the guest has no allergies, there is no dietary hazard to protect
  // against, so the dish is safe even if unconfirmed or lacking an allergen list.
  const guestAllergies = normaliseAllergies(participantAllergies);
  if (guestAllergies.length === 0) {
    return { safe: true, clashes: [], reason: 'ok' };
  }

  // 4. If any guest allergy is not in KNOWN_ALLERGENS, fail closed across all dishes.
  // We cannot safely evaluate an unknown allergy without risk of harm.
  const unknownGuestAllergies = [];
  for (let i = 0; i < guestAllergies.length; i++) {
    if (!KNOWN_ALLERGENS.includes(guestAllergies[i])) {
      unknownGuestAllergies.push(guestAllergies[i]);
    }
  }
  if (unknownGuestAllergies.length > 0) {
    return {
      safe: false,
      clashes: [...unknownGuestAllergies].sort(),
      reason: 'unrecognised-allergy',
    };
  }

  // 5. If the restaurant staff has not explicitly confirmed the dish allergens, fail closed.
  if (item.allergensConfirmed !== true) {
    return { safe: false, clashes: [], reason: 'unconfirmed' };
  }

  // 6. Fail closed if item.allergens is not an array or contains non-string entries.
  if (!Array.isArray(item.allergens)) {
    return { safe: false, clashes: [], reason: 'invalid' };
  }
  for (let i = 0; i < item.allergens.length; i++) {
    if (typeof item.allergens[i] !== 'string') {
      return { safe: false, clashes: [], reason: 'invalid' };
    }
  }

  // 7. Normalise dish allergens. If any tag is not in KNOWN_ALLERGENS, fail closed.
  // Viva note: A typo such as "peanuts" or "wheat" instead of "peanut" or "gluten"
  // would evade exact equality checks. Rejecting unrecognised dish tags prevents dangerous leaks.
  const dishAllergens = normaliseAllergies(item.allergens);
  for (let i = 0; i < dishAllergens.length; i++) {
    if (!KNOWN_ALLERGENS.includes(dishAllergens[i])) {
      return { safe: false, clashes: [], reason: 'unrecognised-tag' };
    }
  }

  // 8. Compute exact matches between guest allergies and dish allergens.
  const clashes = [];
  for (let i = 0; i < guestAllergies.length; i++) {
    if (dishAllergens.includes(guestAllergies[i])) {
      clashes.push(guestAllergies[i]);
    }
  }

  if (clashes.length > 0) {
    return {
      safe: false,
      clashes: [...clashes].sort(),
      reason: 'allergen',
    };
  }

  return { safe: true, clashes: [], reason: 'ok' };
};

/**
 * Boolean convenience wrapper over checkItemSafety().
 */
export const isItemSafe = (participantAllergies, item) => {
  return checkItemSafety(participantAllergies, item).safe;
};
