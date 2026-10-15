import React from "react";
import { describe, test, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { AuthContext } from "../context/AuthContext.jsx";
import ProtectedRoute from "./ProtectedRoute.jsx";
import { ROUTE_PATHS } from "../utils/routePaths.js";

const renderWithAuth = (authValue, initialEntry, element) => {
  return render(
    <AuthContext.Provider value={authValue}>
      <MemoryRouter initialEntries={[initialEntry]}>
        <Routes>
          <Route path="/test" element={element} />
          <Route path={ROUTE_PATHS.LOGIN} element={<div>Login Page</div>} />
          <Route path={ROUTE_PATHS.OWNER_MENU} element={<div>Owner Menu Page</div>} />
          <Route path={ROUTE_PATHS.KITCHEN} element={<div>Kitchen Page</div>} />
        </Routes>
      </MemoryRouter>
    </AuthContext.Provider>
  );
};

describe("ProtectedRoute", () => {
  test("anonymous user redirects to login page", () => {
    renderWithAuth(
      { status: "anonymous", user: null },
      "/test",
      <ProtectedRoute roles={["owner"]}>
        <div>Owner Secret Content</div>
      </ProtectedRoute>
    );

    expect(screen.queryByText("Owner Secret Content")).not.toBeInTheDocument();
    expect(screen.getByText("Login Page")).toBeInTheDocument();
  });

  test("'loading' status displays the Loader and not the protected page", () => {
    renderWithAuth(
      { status: "loading", user: null },
      "/test",
      <ProtectedRoute roles={["owner"]}>
        <div>Owner Secret Content</div>
      </ProtectedRoute>
    );

    expect(screen.getByRole("status")).toBeInTheDocument();
    expect(screen.queryByText("Owner Secret Content")).not.toBeInTheDocument();
  });

  test("a kitchen user on an owner page is redirected to kitchen", () => {
    renderWithAuth(
      { status: "authenticated", user: { role: "kitchen", name: "Chef" } },
      "/test",
      <ProtectedRoute roles={["owner"]}>
        <div>Owner Secret Content</div>
      </ProtectedRoute>
    );

    expect(screen.queryByText("Owner Secret Content")).not.toBeInTheDocument();
    expect(screen.getByText("Kitchen Page")).toBeInTheDocument();
  });

  test("an owner sees the owner page", () => {
    renderWithAuth(
      { status: "authenticated", user: { role: "owner", name: "Boss" } },
      "/test",
      <ProtectedRoute roles={["owner"]}>
        <div>Owner Secret Content</div>
      </ProtectedRoute>
    );

    expect(screen.getByText("Owner Secret Content")).toBeInTheDocument();
    expect(screen.queryByText("Login Page")).not.toBeInTheDocument();
  });

  test("with no roles prop, any authenticated user sees the page", () => {
    renderWithAuth(
      { status: "authenticated", user: { role: "kitchen", name: "Chef" } },
      "/test",
      <ProtectedRoute>
        <div>Universal Staff Content</div>
      </ProtectedRoute>
    );

    expect(screen.getByText("Universal Staff Content")).toBeInTheDocument();
  });

  test("an owner can access routes allowing ['kitchen', 'owner']", () => {
    renderWithAuth(
      { status: "authenticated", user: { role: "owner", name: "Boss" } },
      "/test",
      <ProtectedRoute roles={["kitchen", "owner"]}>
        <div>Kitchen Content</div>
      </ProtectedRoute>
    );

    expect(screen.getByText("Kitchen Content")).toBeInTheDocument();
  });
});
