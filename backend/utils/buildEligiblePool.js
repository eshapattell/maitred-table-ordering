// buildEligiblePool.js: Deterministic safe dish pool builder for Carte Blanche recommendations
// Principles: Plain JavaScript only, imports ONLY isItemSafe from allergyFilter.js, zero side-effects.
import { isItemSafe } from './allergyFilter.js';

/**
 * Validates whether a value is a plain JavaScript object (not null, not array, typeof object).
 */
const isObject = (val) => val !== null && typeof val === 'object' && !Array.isArray(val);

/**
 * Filters a restaurant menu to produce an eligible, safe dish pool for a specific guest.
 * Returns a new array in original menu order containing the exact same item objects.
 *
 * @param {Object} participant - Guest participant object containing allergies and tasteProfile
 * @param {Array<Object>} menuItems - Full menu item array from restaurant
 * @param {Object} [options={}] - Optional filters: maxPrice, excludeItemIds
 * @returns {Array<Object>} New array of matching menu item references
 */
export const buildEligiblePool = (participant, menuItems, options = {}) => {
  // Fail closed if participant is not a valid plain object or menuItems is not an array
  if (!isObject(participant) || !Array.isArray(menuItems)) {
    return [];
  }

  // Missing or non-object tasteProfile represents "no preferences", but allergies are still enforced
  const tasteProfile = isObject(participant.tasteProfile) ? participant.tasteProfile : {};

  // Compute budget limit: lowest positive finite number between options.maxPrice and participant.tasteProfile.budget
  const budgetLimits = [];
  if (typeof options?.maxPrice === 'number' && Number.isFinite(options.maxPrice) && options.maxPrice > 0) {
    budgetLimits.push(options.maxPrice);
  }
  if (typeof tasteProfile.budget === 'number' && Number.isFinite(tasteProfile.budget) && tasteProfile.budget > 0) {
    budgetLimits.push(tasteProfile.budget);
  }
  const hasBudgetLimit = budgetLimits.length > 0;
  const budgetLimit = hasBudgetLimit ? Math.min(...budgetLimits) : null;

  // Prepare excluded item IDs set (compared strictly as strings)
  let excludedSet = null;
  if (Array.isArray(options?.excludeItemIds) && options.excludeItemIds.length > 0) {
    excludedSet = new Set(options.excludeItemIds.map((id) => String(id)));
  }

  // Determine dietary restriction
  // Viva note: Missing/empty/non-veg means unrestricted.
  // "veg" and "egg" require isVeg === true (egg is treated as veg because menu only has isVeg, erring on caution).
  // Any other value or non-string defaults safely to vegetarian.
  const rawDiet = tasteProfile.diet;
  let requiresVeg = false;
  if (rawDiet !== undefined && rawDiet !== null) {
    if (typeof rawDiet === 'string') {
      const trimmedDiet = rawDiet.trim().toLowerCase();
      if (trimmedDiet === '' || trimmedDiet === 'non-veg') {
        requiresVeg = false;
      } else {
        requiresVeg = true;
      }
    } else {
      requiresVeg = true;
    }
  }

  // Pre-filter valid dislikes (ignoring non-strings and empty strings)
  const validDislikes = [];
  if (Array.isArray(tasteProfile.dislikes)) {
    for (let i = 0; i < tasteProfile.dislikes.length; i++) {
      const d = tasteProfile.dislikes[i];
      if (typeof d === 'string') {
        const normalised = d.trim().toLowerCase();
        if (normalised.length > 0) {
          validDislikes.push(normalised);
        }
      }
    }
  }

  const result = [];

  for (let i = 0; i < menuItems.length; i++) {
    const item = menuItems[i];

    // Non-object entries in menuItems are skipped
    if (!isObject(item)) {
      continue;
    }

    // a. Item must be available
    if (item.available !== true) {
      continue;
    }

    // b. Item must be safe according to deterministic allergy filter
    if (!isItemSafe(participant.allergies, item)) {
      continue;
    }

    // c. Item must satisfy vegetarian requirements if diet is restricted
    if (requiresVeg && item.isVeg !== true) {
      continue;
    }

    // d. Item must not contain any disliked ingredient in name or description
    if (validDislikes.length > 0) {
      const name = typeof item.name === 'string' ? item.name.toLowerCase() : '';
      const desc = typeof item.description === 'string' ? item.description.toLowerCase() : '';
      const text = `${name} ${desc}`;
      let hasDislikedIngredient = false;
      for (let j = 0; j < validDislikes.length; j++) {
        if (text.includes(validDislikes[j])) {
          hasDislikedIngredient = true;
          break;
        }
      }
      if (hasDislikedIngredient) {
        continue;
      }
    }

    // e. Item price must be a finite number within budget ceiling
    if (hasBudgetLimit) {
      if (typeof item.price !== 'number' || !Number.isFinite(item.price) || item.price > budgetLimit) {
        continue;
      }
    }

    // f. Item must not be in excluded IDs list (checks _id and id only if defined)
    if (excludedSet !== null) {
      const isExcluded =
        (item._id !== null && item._id !== undefined && excludedSet.has(String(item._id))) ||
        (item.id !== null && item.id !== undefined && excludedSet.has(String(item.id)));
      if (isExcluded) {
        continue;
      }
    }

    // Passed all validation criteria: keep the original item object
    result.push(item);
  }

  return result;
};
