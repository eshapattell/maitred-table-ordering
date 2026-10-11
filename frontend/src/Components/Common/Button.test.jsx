import React from "react";
import { describe, test, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import Button from "./Button.jsx";

describe("Button component", () => {
  test("renders primary variant by default with children text", () => {
    render(<Button>Click Me</Button>);
    const button = screen.getByRole("button", { name: "Click Me" });
    expect(button).toHaveClass("btn");
    expect(button).toHaveClass("btn--primary");
    expect(button).not.toHaveAttribute("aria-busy");
  });

  test("ghost variant has btn--ghost class", () => {
    render(<Button variant="ghost">Sign out</Button>);
    const button = screen.getByRole("button", { name: "Sign out" });
    expect(button).toHaveClass("btn--ghost");
    expect(button).not.toHaveClass("btn--primary");
  });

  test("loading disables button, sets aria-busy='true', and prevents onClick", async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(
      <Button loading onClick={onClick}>
        Submitting
      </Button>
    );

    const button = screen.getByRole("button", { name: "Submitting" });
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute("aria-busy", "true");

    await user.click(button);
    expect(onClick).not.toHaveBeenCalled();
  });

  test("a disabled button does not call onClick", async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(
      <Button disabled onClick={onClick}>
        Disabled Action
      </Button>
    );

    const button = screen.getByRole("button", { name: "Disabled Action" });
    expect(button).toBeDisabled();

    await user.click(button);
    expect(onClick).not.toHaveBeenCalled();
  });

  test("active button calls onClick handler when clicked", async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(<Button onClick={onClick}>Active Action</Button>);

    await user.click(screen.getByRole("button", { name: "Active Action" }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });
});
