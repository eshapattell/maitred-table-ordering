import React from "react";
import { describe, test, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { kitchenOrderView } from "../../../../backend/utils/orderRules.js";
import OrderTicket from "./OrderTicket.jsx";
import { MESSAGES } from "../../utils/messages.js";

const uuid = (n) => `00000000-0000-4000-8000-0000000000${String(n).padStart(2, "0")}`;

const dishRow = (n, name, qty, orderedBy, status, flags = []) => ({
  orderItemId: uuid(n),
  itemId: "a".repeat(24),
  name,
  price: 250,
  qty,
  orderedBy,
  allergyFlags: flags,
  status,
  isSurprise: false,
  revealed: false,
});

const makeOrder = (id, createdAt, items, tableAllergies = [], tableNumber = 4) =>
  kitchenOrderView({
    _id: id.repeat(24),
    sessionId: "b".repeat(24),
    restaurantId: "c".repeat(24),
    tableNumber,
    createdAt,
    items,
    tableAllergies,
    status: "placed",
  });

describe("OrderTicket component", () => {
  afterEach(() => {
    cleanup();
  });

  test("renders header with table heading, placedAt time line, and ticket status chip", () => {
    const placedTime = "2026-10-14T13:42:00.000Z";
    const nowTime = new Date("2026-10-14T13:45:00.000Z");
    const ticket = makeOrder("1", placedTime, [dishRow(1, "Soup", 2, "Asha", "placed")], [], 5);

    render(<OrderTicket order={ticket} now={nowTime} />);

    const header = screen.getByRole("heading", { level: 2, name: MESSAGES.kitchen.tableHeading(5) }).closest("header");
    expect(header).toBeInTheDocument();
    expect(within(header).getByText(MESSAGES.kitchen.statusPlaced)).toBeInTheDocument();
  });

  test("renders allergy banner only when table has allergies", () => {
    const ticketWithAllergies = makeOrder(
      "1",
      "2026-10-14T13:42:00.000Z",
      [dishRow(1, "Salad", 1, "Asha", "placed")],
      [{ nickname: "Asha", allergies: ["tree nut"] }]
    );

    render(<OrderTicket order={ticketWithAllergies} />);
    const banner = screen.getByRole("note");
    expect(banner).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 3, name: MESSAGES.kitchen.allergiesHeading })).toBeInTheDocument();
    expect(screen.getByText("Asha: tree nut")).toBeInTheDocument();
  });

  test("allergy banner lists every allergic guest and shows no other personal data", () => {
    const ticketWithMultiple = makeOrder(
      "1",
      "2026-10-14T13:42:00.000Z",
      [dishRow(1, "Soup", 1, "Dev", "placed")],
      [
        { nickname: "Asha", allergies: ["tree nut"] },
        { nickname: "Chitra", allergies: ["peanut", "sesame"] },
      ]
    );

    render(<OrderTicket order={ticketWithMultiple} />);
    expect(screen.getByText("Asha: tree nut")).toBeInTheDocument();
    expect(screen.getByText("Chitra: peanut, sesame")).toBeInTheDocument();
    // Ensure no phone numbers or token IDs appear
    expect(screen.queryByText(/00000000/)).not.toBeInTheDocument();
    expect(screen.queryByText(/919/)).not.toBeInTheDocument();
  });

  test("does not render allergy banner when table has no allergies", () => {
    const ticketNoAllergies = makeOrder("1", "2026-10-14T13:42:00.000Z", [dishRow(1, "Soup", 1, "Dev", "placed")], []);

    render(<OrderTicket order={ticketNoAllergies} />);
    expect(screen.queryByRole("note")).not.toBeInTheDocument();
    expect(screen.queryByText(MESSAGES.kitchen.allergiesHeading)).not.toBeInTheDocument();
  });

  test("renders placed dish with 'Start' action button and 'Cancel dish' button", () => {
    const ticket = makeOrder("1", "2026-10-14T13:42:00.000Z", [dishRow(1, "Tomato Soup", 2, "Bala", "placed")]);

    render(<OrderTicket order={ticket} />);

    expect(screen.getByText(MESSAGES.kitchen.quantityLine(2, "Tomato Soup"))).toBeInTheDocument();
    expect(screen.getByText(MESSAGES.kitchen.orderedBy("Bala"))).toBeInTheDocument();

    const startBtn = screen.getByRole("button", { name: MESSAGES.kitchen.actionStartAria("Tomato Soup") });
    expect(startBtn).toBeInTheDocument();
    expect(startBtn).toHaveTextContent(MESSAGES.kitchen.actionStart);

    const cancelBtn = screen.getByRole("button", { name: MESSAGES.kitchen.cancelDishAria("Tomato Soup") });
    expect(cancelBtn).toBeInTheDocument();
    expect(cancelBtn).toHaveTextContent(MESSAGES.kitchen.cancelDish);
  });

  test("renders preparing dish with 'Mark ready' button and NO cancel button", () => {
    const ticket = makeOrder("1", "2026-10-14T13:42:00.000Z", [dishRow(1, "Pasta", 1, "Chitra", "preparing")]);

    render(<OrderTicket order={ticket} />);

    const readyBtn = screen.getByRole("button", { name: MESSAGES.kitchen.actionReadyAria("Pasta") });
    expect(readyBtn).toBeInTheDocument();
    expect(readyBtn).toHaveTextContent(MESSAGES.kitchen.actionReady);

    expect(screen.queryByRole("button", { name: MESSAGES.kitchen.cancelDishAria("Pasta") })).not.toBeInTheDocument();
  });

  test("renders ready dish with 'Mark served' button and NO cancel button", () => {
    const ticket = makeOrder("1", "2026-10-14T13:42:00.000Z", [dishRow(1, "Cake", 1, "Asha", "ready")]);

    render(<OrderTicket order={ticket} />);

    const servedBtn = screen.getByRole("button", { name: MESSAGES.kitchen.actionServedAria("Cake") });
    expect(servedBtn).toBeInTheDocument();
    expect(servedBtn).toHaveTextContent(MESSAGES.kitchen.actionServed);

    expect(screen.queryByRole("button", { name: MESSAGES.kitchen.cancelDishAria("Cake") })).not.toBeInTheDocument();
  });

  test("clicks on Start call onMove with orderId, dish, and 'preparing'", async () => {
    const user = userEvent.setup();
    const onMove = vi.fn();
    const ticket = makeOrder("1", "2026-10-14T13:42:00.000Z", [dishRow(1, "Tomato Soup", 2, "Bala", "placed")]);

    render(<OrderTicket order={ticket} onMove={onMove} />);

    const startBtn = screen.getByRole("button", { name: MESSAGES.kitchen.actionStartAria("Tomato Soup") });
    await user.click(startBtn);

    expect(onMove).toHaveBeenCalledTimes(1);
    expect(onMove).toHaveBeenCalledWith(ticket.id, ticket.items[0], "preparing");
  });

  test("clicks on Mark ready call onMove with orderId, dish, and 'ready'", async () => {
    const user = userEvent.setup();
    const onMove = vi.fn();
    const ticket = makeOrder("1", "2026-10-14T13:42:00.000Z", [dishRow(1, "Pasta", 1, "Chitra", "preparing")]);

    render(<OrderTicket order={ticket} onMove={onMove} />);

    const readyBtn = screen.getByRole("button", { name: MESSAGES.kitchen.actionReadyAria("Pasta") });
    await user.click(readyBtn);

    expect(onMove).toHaveBeenCalledTimes(1);
    expect(onMove).toHaveBeenCalledWith(ticket.id, ticket.items[0], "ready");
  });

  test("clicks on Mark served call onMove with orderId, dish, and 'served'", async () => {
    const user = userEvent.setup();
    const onMove = vi.fn();
    const ticket = makeOrder("1", "2026-10-14T13:42:00.000Z", [dishRow(1, "Cake", 1, "Asha", "ready")]);

    render(<OrderTicket order={ticket} onMove={onMove} />);

    const servedBtn = screen.getByRole("button", { name: MESSAGES.kitchen.actionServedAria("Cake") });
    await user.click(servedBtn);

    expect(onMove).toHaveBeenCalledTimes(1);
    expect(onMove).toHaveBeenCalledWith(ticket.id, ticket.items[0], "served");
  });

  test("clicks on Cancel dish call onCancel with orderId and dish", async () => {
    const user = userEvent.setup();
    const onCancel = vi.fn();
    const ticket = makeOrder("1", "2026-10-14T13:42:00.000Z", [dishRow(1, "Soup", 1, "Bala", "placed")]);

    render(<OrderTicket order={ticket} onCancel={onCancel} />);

    const cancelBtn = screen.getByRole("button", { name: MESSAGES.kitchen.cancelDishAria("Soup") });
    await user.click(cancelBtn);

    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onCancel).toHaveBeenCalledWith(ticket.id, ticket.items[0]);
  });

  test("buttons are disabled while busyKey matches order.id:dish.id", () => {
    const ticket = makeOrder("1", "2026-10-14T13:42:00.000Z", [dishRow(1, "Soup", 1, "Bala", "placed")]);
    const busyKey = `${ticket.id}:${ticket.items[0].id}`;

    render(<OrderTicket order={ticket} busyKey={busyKey} />);

    const startBtn = screen.getByRole("button", { name: MESSAGES.kitchen.actionStartAria("Soup") });
    const cancelBtn = screen.getByRole("button", { name: MESSAGES.kitchen.cancelDishAria("Soup") });

    expect(startBtn).toBeDisabled();
    expect(cancelBtn).toBeDisabled();
  });

  test("buttons on other dishes remain enabled when one dish is busy", () => {
    const ticket = makeOrder("1", "2026-10-14T13:42:00.000Z", [
      dishRow(1, "Soup", 1, "Bala", "placed"),
      dishRow(2, "Salad", 1, "Asha", "preparing"),
    ]);
    const busyKey = `${ticket.id}:${ticket.items[0].id}`;

    render(<OrderTicket order={ticket} busyKey={busyKey} />);

    const soupStartBtn = screen.getByRole("button", { name: MESSAGES.kitchen.actionStartAria("Soup") });
    const saladReadyBtn = screen.getByRole("button", { name: MESSAGES.kitchen.actionReadyAria("Salad") });

    expect(soupStartBtn).toBeDisabled();
    expect(saladReadyBtn).not.toBeDisabled();
  });

  test("renders allergen tags only when present on a dish", () => {
    const ticket = makeOrder("1", "2026-10-14T13:42:00.000Z", [
      dishRow(1, "Soup", 1, "Bala", "placed", ["dairy", "gluten"]),
      dishRow(2, "Rice", 1, "Dev", "placed", []),
    ]);

    render(<OrderTicket order={ticket} />);

    expect(screen.getByText(MESSAGES.kitchen.contains("dairy, gluten"))).toBeInTheDocument();
    expect(screen.queryByText(/Contains:$/)).not.toBeInTheDocument();
  });

  test("renders finished dishes in done section without buttons", () => {
    const ticket = makeOrder("1", "2026-10-14T13:42:00.000Z", [
      dishRow(1, "Soup", 1, "Bala", "placed"),
      dishRow(2, "Tea", 1, "Bala", "served"),
      dishRow(3, "Pasta", 1, "Chitra", "cancelled"),
    ]);

    render(<OrderTicket order={ticket} />);

    expect(screen.getByRole("heading", { level: 3, name: MESSAGES.kitchen.doneHeading })).toBeInTheDocument();
    expect(screen.getByText("Tea")).toBeInTheDocument();
    expect(screen.getByText("Pasta")).toBeInTheDocument();

    // Verify there are no action or cancel buttons for Tea or Pasta
    expect(screen.queryByRole("button", { name: /Tea/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Pasta/ })).not.toBeInTheDocument();
  });

  test("a ticket with no open dishes still renders safely", () => {
    const ticket = makeOrder("1", "2026-10-14T13:42:00.000Z", [dishRow(1, "Wine", 1, "Dev", "served")]);

    render(<OrderTicket order={ticket} />);

    expect(screen.getByRole("heading", { level: 2, name: MESSAGES.kitchen.tableHeading(4) })).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 3, name: MESSAGES.kitchen.doneHeading })).toBeInTheDocument();
    expect(screen.getByText("Wine")).toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  test("null order renders safely returning null", () => {
    const { container } = render(<OrderTicket order={null} />);
    expect(container.firstChild).toBeNull();
  });
});
