// api.js: Configured Axios HTTP client instance with session token interceptors
import axios from "axios";
import { STORAGE_KEYS, EVENTS } from "../utils/constants.js";

/**
 * Storage Strategy & XSS Trade-off:
 * The JWT token is kept in sessionStorage so that it automatically disappears when the
 * browser tab is closed, preventing persistent leakage on shared restaurant devices.
 * However, because sessionStorage is accessible to any script executing on the page,
 * it remains vulnerable to Cross-Site Scripting (XSS). This risk is reduced by never
 * injecting HTML from data and by keeping dependencies minimal; a strict Content-Security-Policy
 * still has to be added at deployment (see the Known gaps table in docs/TESTING.md).
 */
const api = axios.create({
  baseURL: "/api",
  timeout: 15000,
});

// Request interceptor: attach Bearer token if present in sessionStorage
api.interceptors.request.use(
  (config) => {
    const token = sessionStorage.getItem(STORAGE_KEYS.AUTH_TOKEN);
    if (token) {
      config.headers = config.headers || {};
      if (typeof config.headers.set === "function") {
        config.headers.set("Authorization", `Bearer ${token}`);
      } else {
        config.headers.Authorization = `Bearer ${token}`;
      }
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Response interceptor: handle 401s on authenticated calls
api.interceptors.response.use(
  (response) => response,
  (error) => {
    const status = error?.response?.status;
    const headers = error?.config?.headers;
    const hasAuthHeader = Boolean(
      headers &&
        (headers.Authorization ||
          headers.authorization ||
          (typeof headers.get === "function" && headers.get("Authorization")))
    );

    // Only clear token and dispatch UNAUTHORISED if the failing request carried an Authorization header.
    // A 401 on an unauthenticated request (e.g. wrong password during login) changes nothing.
    if (status === 401 && hasAuthHeader) {
      sessionStorage.removeItem(STORAGE_KEYS.AUTH_TOKEN);
      if (typeof window !== "undefined" && typeof window.dispatchEvent === "function") {
        window.dispatchEvent(new Event(EVENTS.UNAUTHORISED));
      }
    }

    return Promise.reject(error);
  }
);

export default api;
