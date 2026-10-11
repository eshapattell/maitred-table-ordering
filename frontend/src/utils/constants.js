// constants.js: app-wide constants (name, events, storage keys, roles)
export const APP_NAME = "MaîtreD";

export const STORAGE_KEYS = Object.freeze({
  AUTH_TOKEN: "maitred.authToken",
});

export const EVENTS = Object.freeze({
  UNAUTHORISED: "maitred:unauthorised",
});

export const ROLES = Object.freeze({
  OWNER: "owner",
  KITCHEN: "kitchen",
});
