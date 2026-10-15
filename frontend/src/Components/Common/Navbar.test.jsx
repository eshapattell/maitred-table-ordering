import React from "react";
import { describe, test, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { AuthContext } from "../../context/AuthContext.jsx";
import Navbar from "./Navbar.jsx";
import { APP_NAME } from "../../utils/constants.js";
import { MESSAGES } from "../../utils/messages.js";
import { ROUTE_PATHS } from "../../utils/routePaths.js";

const renderNavbar = (authValue, initialEntries = ["/"]) => {
  return render(
    <AuthContext.Provider value={authValue}>
      <MemoryRouter initialEntries={initialEntries}>
        <Navbar />
      </MemoryRouter>
    </AuthContext.Provider>
  );
};

describe("Navbar component", () => {
  test("anonymous user sees the brand and no navigation links or sign-out button", () => {
    renderNavbar({ status: "anonymous", user: null, logout: vi.fn() });

    expect(screen.getByRole("link", { name: APP_NAME })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: MESSAGES.auth.signOut })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: MESSAGES.nav.menu })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: MESSAGES.nav.tables })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: MESSAGES.nav.kitchen })).not.toBeInTheDocument();
  });

  test("an owner sees the name, the role, both owner links and sign-out button", () => {
    const logoutMock = vi.fn();
    renderNavbar({
      status: "authenticated",
      user: { id: "u1", name: "Ravi Kumar", role: "owner" },
      logout: logoutMock,
    });

    expect(screen.getByRole("link", { name: APP_NAME })).toBeInTheDocument();
    expect(screen.getByText("Ravi Kumar")).toBeInTheDocument();
    expect(screen.getByText("(owner)")).toBeInTheDocument();

    const menuLink = screen.getByRole("link", { name: MESSAGES.nav.menu });
    const tablesLink = screen.getByRole("link", { name: MESSAGES.nav.tables });
    expect(menuLink).toHaveAttribute("href", ROUTE_PATHS.OWNER_MENU);
    expect(tablesLink).toHaveAttribute("href", ROUTE_PATHS.OWNER_TABLES);

    expect(screen.getByRole("link", { name: MESSAGES.nav.kitchen })).toHaveAttribute("href", ROUTE_PATHS.KITCHEN);
    expect(screen.getByRole("button", { name: MESSAGES.auth.signOut })).toBeInTheDocument();
  });

  test("clicking sign-out button calls logout handler", async () => {
    const user = userEvent.setup();
    const logoutMock = vi.fn();
    renderNavbar({
      status: "authenticated",
      user: { id: "u1", name: "Ravi Kumar", role: "owner" },
      logout: logoutMock,
    });

    const signOutBtn = screen.getByRole("button", { name: MESSAGES.auth.signOut });
    await user.click(signOutBtn);

    expect(logoutMock).toHaveBeenCalledTimes(1);
  });

  test("a kitchen user sees only the kitchen link and sign-out button", () => {
    renderNavbar({
      status: "authenticated",
      user: { id: "u2", name: "Chef Anita", role: "kitchen" },
      logout: vi.fn(),
    });

    expect(screen.getByRole("link", { name: APP_NAME })).toBeInTheDocument();
    expect(screen.getByText("Chef Anita")).toBeInTheDocument();
    expect(screen.getByText("(kitchen)")).toBeInTheDocument();

    const kitchenLink = screen.getByRole("link", { name: MESSAGES.nav.kitchen });
    expect(kitchenLink).toHaveAttribute("href", ROUTE_PATHS.KITCHEN);

    expect(screen.queryByRole("link", { name: MESSAGES.nav.menu })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: MESSAGES.nav.tables })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: MESSAGES.auth.signOut })).toBeInTheDocument();
  });

  test("on /table, renders brand as plain text span and no staff links or sign-out button", () => {
    renderNavbar(
      {
        status: "authenticated",
        user: { id: "u1", name: "Ravi Kumar", role: "owner" },
        logout: vi.fn(),
      },
      ["/table"]
    );

    expect(screen.queryByRole("link", { name: APP_NAME })).not.toBeInTheDocument();
    expect(screen.getByText(APP_NAME)).toBeInTheDocument();
    expect(screen.getByText(APP_NAME).tagName).toBe("SPAN");
    expect(screen.queryByRole("button", { name: MESSAGES.auth.signOut })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: MESSAGES.nav.menu })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: MESSAGES.nav.tables })).not.toBeInTheDocument();
  });

  test("on /r/..., renders brand as plain text span and no staff links or sign-out button", () => {
    renderNavbar(
      {
        status: "authenticated",
        user: { id: "u1", name: "Ravi Kumar", role: "owner" },
        logout: vi.fn(),
      },
      ["/r/rest-1/t/4"]
    );

    expect(screen.queryByRole("link", { name: APP_NAME })).not.toBeInTheDocument();
    expect(screen.getByText(APP_NAME)).toBeInTheDocument();
    expect(screen.getByText(APP_NAME).tagName).toBe("SPAN");
    expect(screen.queryByRole("button", { name: MESSAGES.auth.signOut })).not.toBeInTheDocument();
  });

  test("on staff routes (/menu, /tables), renders brand as Link to /", () => {
    renderNavbar(
      {
        status: "authenticated",
        user: { id: "u1", name: "Ravi Kumar", role: "owner" },
        logout: vi.fn(),
      },
      ["/menu"]
    );

    const brandLink = screen.getByRole("link", { name: APP_NAME });
    expect(brandLink).toBeInTheDocument();
    expect(brandLink).toHaveAttribute("href", ROUTE_PATHS.HOME);
  });

  test("the owner sees the Kitchen link", () => {
    renderNavbar({
      status: "authenticated",
      user: { id: "u1", name: "Ravi Kumar", role: "owner" },
      logout: vi.fn(),
    });

    const kitchenLink = screen.getByRole("link", { name: MESSAGES.nav.kitchen });
    expect(kitchenLink).toBeInTheDocument();
    expect(kitchenLink).toHaveAttribute("href", ROUTE_PATHS.KITCHEN);
  });

  test("a kitchen user does not see the owner links", () => {
    renderNavbar({
      status: "authenticated",
      user: { id: "u2", name: "Chef Anita", role: "kitchen" },
      logout: vi.fn(),
    });

    expect(screen.queryByRole("link", { name: MESSAGES.nav.menu })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: MESSAGES.nav.tables })).not.toBeInTheDocument();
  });

  test("a guest page shows none of the staff links", () => {
    renderNavbar(
      {
        status: "authenticated",
        user: { id: "u1", name: "Ravi Kumar", role: "owner" },
        logout: vi.fn(),
      },
      ["/r/rest-1/table/4"]
    );

    expect(screen.queryByRole("link", { name: MESSAGES.nav.menu })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: MESSAGES.nav.tables })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: MESSAGES.nav.kitchen })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: MESSAGES.auth.signOut })).not.toBeInTheDocument();
  });
});

