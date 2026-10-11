// routePaths.js: Route definitions and role destination resolver
export const ROUTE_PATHS = Object.freeze({
  HOME: "/",
  LOGIN: "/login",
  OWNER_MENU: "/owner/menu",
  OWNER_TABLES: "/owner/tables",
  KITCHEN: "/kitchen",
  GUEST_TABLE: "/r/:restaurantId/table/:tableNo",
});

export const homePathFor = (role) => {
  if (role === "owner") return ROUTE_PATHS.OWNER_MENU;
  if (role === "kitchen") return ROUTE_PATHS.KITCHEN;
  return ROUTE_PATHS.LOGIN;
};
