// guestAllergies.js: the guest's allergy answer (FINAL drop-in, Task 10a).
// "No answer" must never become "no allergies": the guest either ticks allergies or says "none".
import { ALLERGEN_VALUES } from './allergens.js';

export const ALLERGY_MESSAGES = Object.freeze({
  unknown: 'Choose your allergies from the list',
  unanswered: 'Tick your allergies, or tell us you have none',
  conflict: 'Untick "I have no allergies" or remove the ticked allergies',
});

// Returns { valid, error, allergies }. allergies is in the canonical order and is the exact body
// field for POST /api/sessions/allergies (an explicit [] means "none").
export const validateAllergyAnswer = (answer) => {
  const { allergens, none } = answer ?? {};
  if (!Array.isArray(allergens) || allergens.some((a) => !ALLERGEN_VALUES.includes(a))) {
    return { valid: false, error: ALLERGY_MESSAGES.unknown, allergies: null };
  }
  const chosen = ALLERGEN_VALUES.filter((value) => allergens.includes(value));
  if (chosen.length === 0 && none !== true) return { valid: false, error: ALLERGY_MESSAGES.unanswered, allergies: null };
  if (chosen.length > 0 && none === true) return { valid: false, error: ALLERGY_MESSAGES.conflict, allergies: null };
  return { valid: true, error: null, allergies: chosen };
};
