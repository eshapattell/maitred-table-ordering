import React from "react";
import { describe, test, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import ErrorMessage from "./ErrorMessage.jsx";

describe("ErrorMessage component", () => {
  test("renders role alert with children text", () => {
    render(<ErrorMessage>Invalid credentials provided</ErrorMessage>);
    const alert = screen.getByRole("alert");
    expect(alert).toBeInTheDocument();
    expect(alert).toHaveTextContent("Invalid credentials provided");
    expect(alert).toHaveClass("alert");
  });

  test("renders nothing when children are null, undefined, or empty", () => {
    const { container: c1 } = render(<ErrorMessage>{null}</ErrorMessage>);
    expect(c1.firstChild).toBeNull();

    const { container: c2 } = render(<ErrorMessage>{""}</ErrorMessage>);
    expect(c2.firstChild).toBeNull();

    const { container: c3 } = render(<ErrorMessage />);
    expect(c3.firstChild).toBeNull();
  });
});
