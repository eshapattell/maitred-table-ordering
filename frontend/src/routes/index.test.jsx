import React from "react";
import { describe, test, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { AuthContext } from "../context/AuthContext.jsx";
import AppRoutes from "./index.jsx";
import { MESSAGES } from "../utils/messages.js";

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

    expect(screen.getByRole("heading", { name: MESSAGES.nav.menu })).toBeInTheDocument();
    expect(screen.getByText(MESSAGES.common.comingSoon)).toBeInTheDocument();
  });

  test("an authenticated kitchen user at '/owner/menu' ends up on the kitchen page", () => {
    renderWithRoutes(
      { status: "authenticated", user: { id: "u2", name: "Chef Anita", role: "kitchen" } },
      "/owner/menu"
    );

    expect(screen.getByRole("heading", { name: MESSAGES.nav.kitchen })).toBeInTheDocument();
    expect(screen.getByText(MESSAGES.common.comingSoon)).toBeInTheDocument();
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
});
