import React from "react";
import { describe, test, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { AuthContext } from "../context/AuthContext.jsx";
import Login from "./Login.jsx";
import { MESSAGES } from "../utils/messages.js";
import { ROUTE_PATHS } from "../utils/routePaths.js";

const renderLogin = (loginMock = vi.fn()) => {
  const authValue = {
    status: "anonymous",
    user: null,
    login: loginMock,
    logout: vi.fn(),
  };

  return {
    ...render(
      <AuthContext.Provider value={authValue}>
        <MemoryRouter initialEntries={["/login"]}>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path={ROUTE_PATHS.OWNER_MENU} element={<div>Owner Menu Landed</div>} />
            <Route path={ROUTE_PATHS.KITCHEN} element={<div>Kitchen Landed</div>} />
          </Routes>
        </MemoryRouter>
      </AuthContext.Provider>
    ),
    loginMock,
  };
};

describe("Login page", () => {
  let logSpy;
  let errorSpy;
  let warnSpy;

  beforeEach(() => {
    logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    logSpy.mockRestore();
    errorSpy.mockRestore();
    warnSpy.mockRestore();
  });

  test("both fields are reachable by label and the password field is type='password'", () => {
    renderLogin();

    const emailInput = screen.getByLabelText(MESSAGES.auth.email);
    const passwordInput = screen.getByLabelText(MESSAGES.auth.password);

    expect(emailInput).toBeInTheDocument();
    expect(emailInput).toHaveAttribute("type", "email");
    expect(emailInput).toHaveAttribute("autoComplete", "username");

    expect(passwordInput).toBeInTheDocument();
    expect(passwordInput).toHaveAttribute("type", "password");
    expect(passwordInput).toHaveAttribute("autoComplete", "current-password");
  });

  test("submit calls login with trimmed email and exact password", async () => {
    const user = userEvent.setup();
    const loginMock = vi.fn().mockResolvedValueOnce({ role: "owner", name: "Ravi" });
    renderLogin(loginMock);

    await user.type(screen.getByLabelText(MESSAGES.auth.email), "  staff@maitred.in  ");
    await user.type(screen.getByLabelText(MESSAGES.auth.password), "Secret123! ");
    await user.click(screen.getByRole("button", { name: MESSAGES.auth.submit }));

    await waitFor(() => {
      expect(loginMock).toHaveBeenCalledWith("staff@maitred.in", "Secret123! ");
    });
  });

  test("an owner lands on the owner menu page on successful login", async () => {
    const user = userEvent.setup();
    const loginMock = vi.fn().mockResolvedValueOnce({ role: "owner", name: "Owner Chef" });
    renderLogin(loginMock);

    await user.type(screen.getByLabelText(MESSAGES.auth.email), "owner@example.com");
    await user.type(screen.getByLabelText(MESSAGES.auth.password), "ownerpass");
    await user.click(screen.getByRole("button", { name: MESSAGES.auth.submit }));

    await waitFor(() => {
      expect(screen.getByText("Owner Menu Landed")).toBeInTheDocument();
    });
  });

  test("a kitchen user lands on the kitchen dashboard on successful login", async () => {
    const user = userEvent.setup();
    const loginMock = vi.fn().mockResolvedValueOnce({ role: "kitchen", name: "Cook Anita" });
    renderLogin(loginMock);

    await user.type(screen.getByLabelText(MESSAGES.auth.email), "kitchen@example.com");
    await user.type(screen.getByLabelText(MESSAGES.auth.password), "cookpass");
    await user.click(screen.getByRole("button", { name: MESSAGES.auth.submit }));

    await waitFor(() => {
      expect(screen.getByText("Kitchen Landed")).toBeInTheDocument();
    });
  });

  test("HTTP 401 shows exactly MESSAGES.auth.invalid, keeps email, and clears password", async () => {
    const user = userEvent.setup();
    const err401 = { response: { status: 401, data: { message: "Internal server message that should not leak" } } };
    const loginMock = vi.fn().mockRejectedValueOnce(err401);
    renderLogin(loginMock);

    const emailInput = screen.getByLabelText(MESSAGES.auth.email);
    const passwordInput = screen.getByLabelText(MESSAGES.auth.password);

    await user.type(emailInput, "user@example.com");
    await user.type(passwordInput, "wrongpwd");
    await user.click(screen.getByRole("button", { name: MESSAGES.auth.submit }));

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent(MESSAGES.auth.invalid);
    });

    expect(screen.queryByText("Internal server message that should not leak")).not.toBeInTheDocument();
    expect(emailInput).toHaveValue("user@example.com");
    expect(passwordInput).toHaveValue("");
  });

  test("HTTP 400 shows MESSAGES.auth.required", async () => {
    const user = userEvent.setup();
    const err400 = { response: { status: 400, data: { message: "Validation error" } } };
    const loginMock = vi.fn().mockRejectedValueOnce(err400);
    renderLogin(loginMock);

    await user.type(screen.getByLabelText(MESSAGES.auth.email), "user@example.com");
    await user.type(screen.getByLabelText(MESSAGES.auth.password), "p");
    await user.click(screen.getByRole("button", { name: MESSAGES.auth.submit }));

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent(MESSAGES.auth.required);
    });
  });

  test.each([
    ["network error", new Error("Network Error")],
    ["HTTP 500", { response: { status: 500, data: { message: "DB failure" } } }],
    ["HTTP 429", { response: { status: 429, data: { message: "Rate limit" } } }],
  ])("%s shows MESSAGES.auth.unavailable and never the server message", async (_, errorObj) => {
    const user = userEvent.setup();
    const loginMock = vi.fn().mockRejectedValueOnce(errorObj);
    renderLogin(loginMock);

    await user.type(screen.getByLabelText(MESSAGES.auth.email), "user@example.com");
    await user.type(screen.getByLabelText(MESSAGES.auth.password), "secretpass");
    await user.click(screen.getByRole("button", { name: MESSAGES.auth.submit }));

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent(MESSAGES.auth.unavailable);
    });

    if (errorObj.response?.data?.message) {
      expect(screen.queryByText(errorObj.response.data.message)).not.toBeInTheDocument();
    }
  });

  test("while submitting, button is disabled, shows submitting text, has aria-busy, and double-submit does not call login again", async () => {
    const user = userEvent.setup();
    let resolveLogin;
    const pendingPromise = new Promise((resolve) => {
      resolveLogin = resolve;
    });
    const loginMock = vi.fn().mockReturnValue(pendingPromise);

    renderLogin(loginMock);

    await user.type(screen.getByLabelText(MESSAGES.auth.email), "slow@example.com");
    await user.type(screen.getByLabelText(MESSAGES.auth.password), "pass");

    const submitBtn = screen.getByRole("button", { name: MESSAGES.auth.submit });
    await user.click(submitBtn);

    expect(submitBtn).toBeDisabled();
    expect(submitBtn).toHaveAttribute("aria-busy", "true");
    expect(submitBtn).toHaveTextContent(MESSAGES.auth.submitting);
    expect(loginMock).toHaveBeenCalledTimes(1);

    // Second click during submission should be ignored
    await user.click(submitBtn);
    expect(loginMock).toHaveBeenCalledTimes(1);

    // Resolve login
    resolveLogin({ role: "owner", name: "Ravi" });
    await waitFor(() => {
      expect(screen.getByText("Owner Menu Landed")).toBeInTheDocument();
    });
  });

  test("spies on console.log, console.error and console.warn never receive the password", async () => {
    const user = userEvent.setup();
    const secretPassword = "superSecretPasswordXYZ!";
    const loginMock = vi.fn().mockRejectedValueOnce(new Error("Simulated failure"));
    renderLogin(loginMock);

    await user.type(screen.getByLabelText(MESSAGES.auth.email), "user@example.com");
    await user.type(screen.getByLabelText(MESSAGES.auth.password), secretPassword);
    await user.click(screen.getByRole("button", { name: MESSAGES.auth.submit }));

    await waitFor(() => {
      expect(screen.getByRole("alert")).toBeInTheDocument();
    });

    for (const spy of [logSpy, errorSpy, warnSpy]) {
      for (const call of spy.mock.calls) {
        for (const arg of call) {
          expect(String(arg)).not.toContain(secretPassword);
        }
      }
    }
  });
});
