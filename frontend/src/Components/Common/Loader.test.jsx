import React from "react";
import { describe, test, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import Loader from "./Loader.jsx";
import { MESSAGES } from "../../utils/messages.js";

describe("Loader component", () => {
  test("renders role status with polite loading message", () => {
    render(<Loader />);
    const loader = screen.getByRole("status");
    expect(loader).toBeInTheDocument();
    expect(loader).toHaveTextContent(MESSAGES.common.loading);
    expect(loader).toHaveClass("loader");
  });
});
