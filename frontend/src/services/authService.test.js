import { describe, test, expect, vi, beforeEach } from "vitest";
import * as authService from "./authService.js";
import api from "./api.js";

describe("authService", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  test("login posts email and password to '/auth/login' and returns response.data", async () => {
    const mockData = {
      token: "jwt-12345",
      user: { id: "u1", name: "Ravi", role: "owner" },
    };
    const postSpy = vi.spyOn(api, "post").mockResolvedValueOnce({ data: mockData });

    const result = await authService.login("ravi@example.com", "secretpass");

    expect(postSpy).toHaveBeenCalledWith("/auth/login", {
      email: "ravi@example.com",
      password: "secretpass",
    });
    expect(result).toEqual(mockData);
  });

  test("login propagates errors when api.post rejects", async () => {
    const error = new Error("Network failure");
    vi.spyOn(api, "post").mockRejectedValueOnce(error);

    await expect(authService.login("fail@example.com", "pass")).rejects.toThrow("Network failure");
  });

  test("fetchCurrentUser gets '/auth/me' and returns response.data.user", async () => {
    const mockUser = { id: "u2", name: "Anita", role: "kitchen" };
    const getSpy = vi.spyOn(api, "get").mockResolvedValueOnce({
      data: { user: mockUser },
    });

    const result = await authService.fetchCurrentUser();

    expect(getSpy).toHaveBeenCalledWith("/auth/me");
    expect(result).toEqual(mockUser);
  });

  test("fetchCurrentUser propagates errors when api.get rejects", async () => {
    const error = new Error("Unauthorized");
    vi.spyOn(api, "get").mockRejectedValueOnce(error);

    await expect(authService.fetchCurrentUser()).rejects.toThrow("Unauthorized");
  });
});
