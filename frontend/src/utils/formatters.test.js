import { describe, test, expect } from "vitest";
import { formatPrice } from "./formatters.js";

describe("formatPrice", () => {
  test("formats 250 as ₹250", () => {
    expect(formatPrice(250)).toBe("₹250");
  });

  test("formats 1800 as ₹1,800", () => {
    expect(formatPrice(1800)).toBe("₹1,800");
  });

  test("formats 250000 as ₹2,50,000 in Indian numbering system", () => {
    expect(formatPrice(250000)).toBe("₹2,50,000");
  });

  test.each([null, undefined, "100", NaN, Infinity, -Infinity, {}, [], true, false])(
    "returns empty string for non-finite or non-number input: %p",
    (input) => {
      expect(formatPrice(input)).toBe("");
    }
  );
});
