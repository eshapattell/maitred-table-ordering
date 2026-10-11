// allergens.js: Master allergen taxonomy for maitred
// Note: this list must match backend/utils/allergyFilter.js KNOWN_ALLERGENS; a test enforces it.

export const ALLERGENS = Object.freeze([
  Object.freeze({ value: "peanut", label: "Peanut" }),
  Object.freeze({ value: "tree nut", label: "Tree nut" }),
  Object.freeze({ value: "dairy", label: "Dairy" }),
  Object.freeze({ value: "egg", label: "Egg" }),
  Object.freeze({ value: "gluten", label: "Gluten" }),
  Object.freeze({ value: "soy", label: "Soy" }),
  Object.freeze({ value: "fish", label: "Fish" }),
  Object.freeze({ value: "shellfish", label: "Shellfish" }),
  Object.freeze({ value: "sesame", label: "Sesame" }),
  Object.freeze({ value: "mustard", label: "Mustard" }),
]);

export const ALLERGEN_VALUES = Object.freeze(ALLERGENS.map((item) => item.value));
