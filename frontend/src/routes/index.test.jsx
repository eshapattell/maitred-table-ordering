import React from "react";
import { describe, test, expect, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { AuthContext } from "../context/AuthContext.jsx";
import AppRoutes from "./index.jsx";
import { MESSAGES } from "../utils/messages.js";

vi.mock("../services/orderService.js", () => ({
  fetchActiveOrders: vi.fn().mockResolvedValue([]),
  updateDishStatus: vi.fn(),
}));

vi.mock("../services/kitchenSocket.js", () => ({
  connectKitchen: vi.fn(() => null),
}));

const renderWithRoutes = (authValue, initialEntry = "/") => {
  const fullAuth = {
    login: vi.fn(),
    logout: vi.fn(),
    ...authValue,
  };
  return render(
    <AuthContext.Provider value={fullAuth}>
      <MemoryRouter initialEntries={[initialEntry]}>
        <AppRoutes />
      </MemoryRouter>
    </AuthContext.Provider>
  );
};

describe("AppRoutes configuration and navigation switchboard", () => {
  test("anonymous at '/' redirects to login and shows the login form", () => {
    renderWithRoutes({ status: "anonymous", user: null }, "/");

    expect(screen.getByRole("heading", { name: "MaîtreD" })).toBeInTheDocument();
    expect(screen.getByText(MESSAGES.auth.title)).toBeInTheDocument();
    expect(screen.getByLabelText(MESSAGES.auth.email)).toBeInTheDocument();
  });

  test("an authenticated owner at '/' lands on the owner menu", () => {
    renderWithRoutes(
      { status: "authenticated", user: { id: "u1", name: "Ravi", role: "owner" } },
      "/"
    );

    expect(screen.getByRole("heading", { level: 1, name: MESSAGES.nav.menu })).toBeInTheDocument();
  });

  test("an authenticated kitchen user at '/owner/menu' ends up on the kitchen page", () => {
    renderWithRoutes(
      { status: "authenticated", user: { id: "u2", name: "Chef Anita", role: "kitchen" } },
      "/owner/menu"
    );

    return waitFor(() => {
      expect(screen.getByRole("heading", { name: MESSAGES.nav.kitchen })).toBeInTheDocument();
    });
  });

  test("an authenticated user at '/login' is redirected home (owner to /owner/menu)", () => {
    renderWithRoutes(
      { status: "authenticated", user: { id: "u3", name: "Ravi", role: "owner" } },
      "/login"
    );

    expect(screen.getByRole("heading", { name: MESSAGES.nav.menu })).toBeInTheDocument();
  });

  test("an unknown path shows the not-found text and return link", () => {
    renderWithRoutes({ status: "anonymous", user: null }, "/some/nonexistent/deep/route");

    expect(screen.getByText(MESSAGES.common.notFound)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: MESSAGES.common.backHome })).toBeInTheDocument();
  });

  test("'loading' at '/' shows the Loader", () => {
    renderWithRoutes({ status: "loading", user: null }, "/");

    expect(screen.getByRole("status")).toBeInTheDocument();
    expect(screen.getByText(MESSAGES.common.loading)).toBeInTheDocument();
  });

  test("the owner can open /kitchen", async () => {
    renderWithRoutes(
      { status: "authenticated", user: { id: "u1", name: "Ravi", role: "owner" } },
      "/kitchen"
    );

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: MESSAGES.kitchen.boardTitle })).toBeInTheDocument();
    });
  });

  test("a signed-out visitor is sent to login when accessing /kitchen", () => {
    renderWithRoutes({ status: "anonymous", user: null }, "/kitchen");

    expect(screen.getByText(MESSAGES.auth.title)).toBeInTheDocument();
  });
});
