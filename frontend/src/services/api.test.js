import { describe, test, expect, beforeEach, vi } from "vitest";
import axios, { AxiosError } from "axios";
import api from "./api.js";
import { STORAGE_KEYS, EVENTS } from "../utils/constants.js";

describe("api axios client and interceptors", () => {
  beforeEach(() => {
    sessionStorage.clear();
    vi.restoreAllMocks();
  });

  test("baseURL is '/api' and timeout is 15000ms", () => {
    expect(api.defaults.baseURL).toBe("/api");
    expect(api.defaults.timeout).toBe(15000);
  });

  test("Bearer header is added when a token is stored in sessionStorage", async () => {
    sessionStorage.setItem(STORAGE_KEYS.AUTH_TOKEN, "test-valid-jwt");

    let capturedConfig = null;
    api.defaults.adapter = async (config) => {
      capturedConfig = config;
      return {
        data: { success: true },
        status: 200,
        statusText: "OK",
        headers: {},
        config,
      };
    };

    const res = await api.get("/test");
    expect(res.data).toEqual({ success: true });
    expect(capturedConfig.headers.Authorization).toBe("Bearer test-valid-jwt");
  });

  test("Bearer header is absent when no token is in sessionStorage", async () => {
    let capturedConfig = null;
    api.defaults.adapter = async (config) => {
      capturedConfig = config;
      return {
        data: { success: true },
        status: 200,
        statusText: "OK",
        headers: {},
        config,
      };
    };

    await api.get("/test");
    expect(capturedConfig.headers.Authorization).toBeUndefined();
  });

  test("401 on a request with token removes token and dispatches EVENTS.UNAUTHORISED once", async () => {
    sessionStorage.setItem(STORAGE_KEYS.AUTH_TOKEN, "expired-token");

    const eventListener = vi.fn();
    window.addEventListener(EVENTS.UNAUTHORISED, eventListener);

    api.defaults.adapter = async (config) => {
      const err = new AxiosError("Unauthorized", "ERR_BAD_REQUEST", config, null, {
        status: 401,
        statusText: "Unauthorized",
        headers: {},
        config,
        data: { message: "Invalid or expired token" },
      });
      return Promise.reject(err);
    };

    await expect(api.get("/protected")).rejects.toThrow();

    expect(sessionStorage.getItem(STORAGE_KEYS.AUTH_TOKEN)).toBeNull();
    expect(eventListener).toHaveBeenCalledTimes(1);

    window.removeEventListener(EVENTS.UNAUTHORISED, eventListener);
  });

  test("401 on a request without token dispatches nothing and does not alter sessionStorage", async () => {
    const eventListener = vi.fn();
    window.addEventListener(EVENTS.UNAUTHORISED, eventListener);

    api.defaults.adapter = async (config) => {
      const err = new AxiosError("Unauthorized", "ERR_BAD_REQUEST", config, null, {
        status: 401,
        statusText: "Unauthorized",
        headers: {},
        config,
        data: { message: "Invalid credentials" },
      });
      return Promise.reject(err);
    };

    await expect(api.post("/auth/login", { email: "a@b.com", password: "wrong" })).rejects.toThrow();

    expect(eventListener).not.toHaveBeenCalled();
    expect(sessionStorage.getItem(STORAGE_KEYS.AUTH_TOKEN)).toBeNull();

    window.removeEventListener(EVENTS.UNAUTHORISED, eventListener);
  });

  test("500 response never removes the stored token and dispatches nothing", async () => {
    sessionStorage.setItem(STORAGE_KEYS.AUTH_TOKEN, "good-token");

    const eventListener = vi.fn();
    window.addEventListener(EVENTS.UNAUTHORISED, eventListener);

    api.defaults.adapter = async (config) => {
      const err = new AxiosError("Server Error", "ERR_BAD_RESPONSE", config, null, {
        status: 500,
        statusText: "Internal Server Error",
        headers: {},
        config,
        data: { message: "Internal server error" },
      });
      return Promise.reject(err);
    };

    await expect(api.get("/something")).rejects.toThrow();

    expect(sessionStorage.getItem(STORAGE_KEYS.AUTH_TOKEN)).toBe("good-token");
    expect(eventListener).not.toHaveBeenCalled();

    window.removeEventListener(EVENTS.UNAUTHORISED, eventListener);
  });
});
