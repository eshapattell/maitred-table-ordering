import React from "react";
import { describe, test, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AuthProvider, useAuth } from "./AuthContext.jsx";
import * as authService from "../services/authService.js";
import { STORAGE_KEYS, EVENTS } from "../utils/constants.js";

const Consumer = ({ onLoginSuccess, onLoginError }) => {
  const { status, user, login, logout } = useAuth();

  const handleLoginClick = async () => {
    try {
      const u = await login("owner@example.com", "password123");
      onLoginSuccess?.(u);
    } catch (err) {
      onLoginError?.(err);
    }
  };

  return (
    <div>
      <span data-testid="status">{status}</span>
      <span data-testid="username">{user?.name || "none"}</span>
      <span data-testid="userrole">{user?.role || "none"}</span>
      <button onClick={handleLoginClick}>Do Login</button>
      <button onClick={logout}>Do Logout</button>
    </div>
  );
};

describe("AuthContext", () => {
  beforeEach(() => {
    sessionStorage.clear();
    vi.restoreAllMocks();
  });

  test("no token gives 'anonymous' and does not call fetchCurrentUser", async () => {
    const fetchSpy = vi.spyOn(authService, "fetchCurrentUser");

    render(
      <AuthProvider>
        <Consumer />
      </AuthProvider>
    );

    expect(screen.getByTestId("status")).toHaveTextContent("anonymous");
    expect(screen.getByTestId("username")).toHaveTextContent("none");
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  test("a token plus a successful call gives 'authenticated' with the user", async () => {
    sessionStorage.setItem(STORAGE_KEYS.AUTH_TOKEN, "valid-token");
    const mockUser = { id: "u1", name: "Chef Ravi", role: "owner" };
    vi.spyOn(authService, "fetchCurrentUser").mockResolvedValueOnce(mockUser);

    render(
      <AuthProvider>
        <Consumer />
      </AuthProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId("status")).toHaveTextContent("authenticated");
    });
    expect(screen.getByTestId("username")).toHaveTextContent("Chef Ravi");
    expect(screen.getByTestId("userrole")).toHaveTextContent("owner");
  });

  test("a 401 failure clears the token and gives 'anonymous'", async () => {
    sessionStorage.setItem(STORAGE_KEYS.AUTH_TOKEN, "expired-token");
    const error401 = { response: { status: 401 } };
    vi.spyOn(authService, "fetchCurrentUser").mockRejectedValueOnce(error401);

    render(
      <AuthProvider>
        <Consumer />
      </AuthProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId("status")).toHaveTextContent("anonymous");
    });
    expect(sessionStorage.getItem(STORAGE_KEYS.AUTH_TOKEN)).toBeNull();
    expect(screen.getByTestId("username")).toHaveTextContent("none");
  });

  test("a network failure gives 'anonymous' and keeps the token in sessionStorage", async () => {
    sessionStorage.setItem(STORAGE_KEYS.AUTH_TOKEN, "kept-token");
    const networkError = new Error("Network unreachable");
    vi.spyOn(authService, "fetchCurrentUser").mockRejectedValueOnce(networkError);

    render(
      <AuthProvider>
        <Consumer />
      </AuthProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId("status")).toHaveTextContent("anonymous");
    });
    expect(sessionStorage.getItem(STORAGE_KEYS.AUTH_TOKEN)).toBe("kept-token");
  });

  test("login success stores the token and sets the user", async () => {
    const user = userEvent.setup();
    const mockUser = { id: "u2", name: "Priya", role: "kitchen" };
    vi.spyOn(authService, "login").mockResolvedValueOnce({
      token: "new-jwt-token",
      user: mockUser,
    });

    render(
      <AuthProvider>
        <Consumer />
      </AuthProvider>
    );

    expect(screen.getByTestId("status")).toHaveTextContent("anonymous");

    await user.click(screen.getByRole("button", { name: "Do Login" }));

    await waitFor(() => {
      expect(screen.getByTestId("status")).toHaveTextContent("authenticated");
    });
    expect(screen.getByTestId("username")).toHaveTextContent("Priya");
    expect(sessionStorage.getItem(STORAGE_KEYS.AUTH_TOKEN)).toBe("new-jwt-token");
  });

  test("login failure re-throws, stores nothing and stays 'anonymous'", async () => {
    const user = userEvent.setup();
    const loginError = new Error("Invalid credentials");
    vi.spyOn(authService, "login").mockRejectedValueOnce(loginError);
    const onError = vi.fn();

    render(
      <AuthProvider>
        <Consumer onLoginError={onError} />
      </AuthProvider>
    );

    await user.click(screen.getByRole("button", { name: "Do Login" }));

    await waitFor(() => {
      expect(onError).toHaveBeenCalledWith(loginError);
    });
    expect(screen.getByTestId("status")).toHaveTextContent("anonymous");
    expect(sessionStorage.getItem(STORAGE_KEYS.AUTH_TOKEN)).toBeNull();
  });

  test("logout clears the token and sets status to anonymous", async () => {
    const user = userEvent.setup();
    sessionStorage.setItem(STORAGE_KEYS.AUTH_TOKEN, "to-be-cleared");
    vi.spyOn(authService, "fetchCurrentUser").mockResolvedValueOnce({
      id: "u3",
      name: "Ravi",
      role: "owner",
    });

    render(
      <AuthProvider>
        <Consumer />
      </AuthProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId("status")).toHaveTextContent("authenticated");
    });

    await user.click(screen.getByRole("button", { name: "Do Logout" }));

    expect(sessionStorage.getItem(STORAGE_KEYS.AUTH_TOKEN)).toBeNull();
    expect(screen.getByTestId("status")).toHaveTextContent("anonymous");
    expect(screen.getByTestId("username")).toHaveTextContent("none");
  });

  test("EVENTS.UNAUTHORISED dispatches logs the user out", async () => {
    sessionStorage.setItem(STORAGE_KEYS.AUTH_TOKEN, "active-token");
    vi.spyOn(authService, "fetchCurrentUser").mockResolvedValueOnce({
      id: "u4",
      name: "Anita",
      role: "owner",
    });

    render(
      <AuthProvider>
        <Consumer />
      </AuthProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId("status")).toHaveTextContent("authenticated");
    });

    act(() => {
      window.dispatchEvent(new Event(EVENTS.UNAUTHORISED));
    });

    await waitFor(() => {
      expect(screen.getByTestId("status")).toHaveTextContent("anonymous");
    });
    expect(screen.getByTestId("username")).toHaveTextContent("none");
  });

  test("only the token (never the user object) is ever written to sessionStorage", async () => {
    const user = userEvent.setup();
    const setItemSpy = vi.spyOn(Storage.prototype, "setItem");
    const mockUser = { id: "u5", name: "Deepak", role: "owner" };
    vi.spyOn(authService, "login").mockResolvedValueOnce({
      token: "secret-token-xyz",
      user: mockUser,
    });

    render(
      <AuthProvider>
        <Consumer />
      </AuthProvider>
    );

    await user.click(screen.getByRole("button", { name: "Do Login" }));

    await waitFor(() => {
      expect(screen.getByTestId("status")).toHaveTextContent("authenticated");
    });

    expect(setItemSpy).toHaveBeenCalledWith(STORAGE_KEYS.AUTH_TOKEN, "secret-token-xyz");
    // Ensure no other keys or serialized user object were saved
    for (const call of setItemSpy.mock.calls) {
      expect(call[0]).toBe(STORAGE_KEYS.AUTH_TOKEN);
      expect(call[1]).not.toContain("Deepak");
    }
  });


});
