// constants.js: app-wide constants (name, events, storage keys, roles)
export const APP_NAME = "MaîtreD";

export const STORAGE_KEYS = Object.freeze({
  AUTH_TOKEN: "maitred.authToken",
  GUEST_TOKEN: "maitred.guestToken",
});

export const EVENTS = Object.freeze({
  UNAUTHORISED: "maitred:unauthorised",
  GUEST_ENDED: "maitred:guest-ended",
});

export const ROLES = Object.freeze({
  OWNER: "owner",
  KITCHEN: "kitchen",
});
