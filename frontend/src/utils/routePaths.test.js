import { describe, test, expect } from "vitest";
import { ROUTE_PATHS, homePathFor } from "./routePaths.js";

describe("routePaths and homePathFor", () => {
  test("ROUTE_PATHS has all required route constants", () => {
    expect(ROUTE_PATHS.HOME).toBe("/");
    expect(ROUTE_PATHS.LOGIN).toBe("/login");
    expect(ROUTE_PATHS.OWNER_MENU).toBe("/owner/menu");
    expect(ROUTE_PATHS.OWNER_TABLES).toBe("/owner/tables");
    expect(ROUTE_PATHS.KITCHEN).toBe("/kitchen");
    expect(ROUTE_PATHS.GUEST_TABLE).toBe("/r/:restaurantId/table/:tableNo");
  });

  test("homePathFor('owner') returns OWNER_MENU route", () => {
    expect(homePathFor("owner")).toBe(ROUTE_PATHS.OWNER_MENU);
  });

  test("homePathFor('kitchen') returns KITCHEN route", () => {
    expect(homePathFor("kitchen")).toBe(ROUTE_PATHS.KITCHEN);
  });

  test.each(["guest", "admin", "customer", "", null, undefined, 123, {}])(
    "homePathFor returns LOGIN route for unknown role or undefined: %p",
    (role) => {
      expect(homePathFor(role)).toBe(ROUTE_PATHS.LOGIN);
    }
  );
});
