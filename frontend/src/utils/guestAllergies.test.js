import { describe, test, expect } from 'vitest';
import { validateAllergyAnswer, ALLERGY_MESSAGES } from './guestAllergies.js';
import { ALLERGEN_VALUES } from './allergens.js';

describe('validateAllergyAnswer', () => {
  test('ticking allergies is a valid answer, sent in canonical order', () => {
    expect(validateAllergyAnswer({ allergens: ['mustard', 'peanut', 'soy'], none: false })).toEqual({ valid: true, error: null, allergies: ['peanut', 'soy', 'mustard'] });
  });
  test('"I have no allergies" is a valid answer and sends an explicit empty list', () => {
    expect(validateAllergyAnswer({ allergens: [], none: true })).toEqual({ valid: true, error: null, allergies: [] });
  });
  test('no answer at all is NOT "no allergies"', () => {
    for (const input of [{ allergens: [], none: false }, { allergens: [] }, { allergens: [], none: undefined }, { allergens: [], none: 'true' }, { allergens: [], none: 1 }]) {
      const r = validateAllergyAnswer(input);
      expect(r.valid).toBe(false);
      expect(r.error).toBe(ALLERGY_MESSAGES.unanswered);
      expect(r.allergies).toBeNull();
    }
  });
  test('ticking allergies and "none" together is a conflict', () => {
    expect(validateAllergyAnswer({ allergens: ['dairy'], none: true })).toEqual({ valid: false, error: ALLERGY_MESSAGES.conflict, allergies: null });
  });
  test('unknown values and non-lists are rejected', () => {
    for (const allergens of [['wheat'], ['Peanut'], ['peanut ', 'soy'], [null], [5], 'dairy', undefined, null, {}]) {
      expect(validateAllergyAnswer({ allergens, none: false }).error).toBe(ALLERGY_MESSAGES.unknown);
    }
  });
  test('duplicates are collapsed', () => expect(validateAllergyAnswer({ allergens: ['dairy', 'dairy', 'soy'] }).allergies).toEqual(['dairy', 'soy']));
  test('all ten allergies can be ticked', () => expect(validateAllergyAnswer({ allergens: [...ALLERGEN_VALUES] }).allergies).toEqual([...ALLERGEN_VALUES]));
  test('missing input never throws and is invalid', () => {
    expect(validateAllergyAnswer().valid).toBe(false);
    expect(validateAllergyAnswer({}).valid).toBe(false);
    expect(validateAllergyAnswer(null).valid).toBe(false);
  });
  test('the messages are frozen', () => expect(Object.isFrozen(ALLERGY_MESSAGES)).toBe(true));
});
