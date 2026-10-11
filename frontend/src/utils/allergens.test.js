import { describe, test, expect } from "vitest";
import { ALLERGENS, ALLERGEN_VALUES } from "./allergens.js";
import { KNOWN_ALLERGENS } from "../../../backend/utils/allergyFilter.js";

describe("allergens taxonomy", () => {
  test("ALLERGEN_VALUES equals backend KNOWN_ALLERGENS exactly and in the same order", () => {
    expect([...ALLERGEN_VALUES]).toEqual([...KNOWN_ALLERGENS]);
  });

  test("every label in ALLERGENS is non-empty string", () => {
    expect(ALLERGENS).toHaveLength(10);
    ALLERGENS.forEach((item) => {
      expect(typeof item.label).toBe("string");
      expect(item.label.trim().length).toBeGreaterThan(0);
    });
  });

  test("the values in ALLERGENS are unique", () => {
    const values = ALLERGENS.map((item) => item.value);
    const uniqueValues = new Set(values);
    expect(uniqueValues.size).toBe(values.length);
  });

  test("ALLERGENS and ALLERGEN_VALUES are frozen arrays", () => {
    expect(Object.isFrozen(ALLERGENS)).toBe(true);
    expect(Object.isFrozen(ALLERGEN_VALUES)).toBe(true);
    ALLERGENS.forEach((item) => {
      expect(Object.isFrozen(item)).toBe(true);
    });
  });

  test("Tree nut label is capitalized correctly as 'Tree nut'", () => {
    const treeNut = ALLERGENS.find((item) => item.value === "tree nut");
    expect(treeNut).toBeDefined();
    expect(treeNut.label).toBe("Tree nut");
  });
});
