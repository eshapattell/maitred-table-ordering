import { describe, test, expect } from "vitest";
import { formatPrice, formatClock } from "./formatters.js";

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

describe("formatClock", () => {
  test("formats local evening time like 7:42 pm", () => {
    const d = new Date(2026, 9, 14, 19, 42);
    expect(formatClock(d)).toBe("7:42 pm");
  });

  test("formats local morning time with 2-digit minutes like 7:05 am", () => {
    const d = new Date(2026, 9, 14, 7, 5);
    expect(formatClock(d)).toBe("7:05 am");
  });

  test("formats local noon 12:00 pm", () => {
    const d = new Date(2026, 9, 14, 12, 0);
    expect(formatClock(d)).toBe("12:00 pm");
  });

  test("formats local midnight 12:00 am", () => {
    const d = new Date(2026, 9, 14, 0, 0);
    expect(formatClock(d)).toBe("12:00 am");
  });

  test("formats ISO string input in local time", () => {
    const d = new Date(2026, 9, 14, 15, 30);
    expect(formatClock(d.toISOString())).toBe("3:30 pm");
  });

  test.each([null, undefined, "", "not-a-date", {}, [], true, false, NaN])(
    "returns empty string for unreadable date input: %p",
    (input) => {
      expect(formatClock(input)).toBe("");
    }
  );
});

