import React, { act } from 'react';
import { render, screen, fireEvent, cleanup, within } from '@testing-library/react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import GuestTable from './GuestTable.jsx';
import { MESSAGES } from '../utils/messages.js';
import { ORDER_MESSAGES } from '../utils/guestOrder.js';
import { orderHistoryView, SURPRISE_NAME } from '../../../backend/utils/orderHistory.js';
import { freezeOrderItem } from '../../../backend/utils/orderRules.js';
import { buildCartView } from '../../../backend/utils/cartView.js';

const { fakeSocket } = vi.hoisted(() => {
  const listeners = new Map();
  const socket = {
    on: vi.fn((event, fn) => {
      if (!listeners.has(event)) listeners.set(event, []);
      listeners.get(event).push(fn);
      return socket;
    }),
    off: vi.fn((event, fn) => {
      if (!listeners.has(event)) return socket;
      listeners.set(event, listeners.get(event).filter((f) => f !== fn));
      return socket;
    }),
    trigger: async (event, payload) => {
      const fns = [...(listeners.get(event) || [])];
      await act(async () => {
        for (const fn of fns) {
          fn(payload);
        }
      });
    },
    disconnect: vi.fn(),
    reset: () => {
      listeners.clear();
      socket.on.mockClear();
      socket.off.mockClear();
      socket.disconnect.mockClear();
    },
  };
  return { fakeSocket: socket };
});

vi.mock('../services/liveSocket.js', () => ({
  connectLive: vi.fn(() => fakeSocket),
}));

vi.mock('../services/cartService.js', () => ({
  getCart: vi.fn(),
  addToCart: vi.fn(),
  decreaseLine: vi.fn(),
  removeLine: vi.fn(),
}));

vi.mock('../services/guestService.js', () => ({
  fetchMyTable: vi.fn(),
  fetchGuestMenu: vi.fn(),
  declareAllergies: vi.fn(),
  approveGuest: vi.fn(),
  rejectGuest: vi.fn(),
  readGuestToken: vi.fn(),
  saveGuestToken: vi.fn(),
  clearGuestToken: vi.fn(),
}));

vi.mock('../services/guestOrderService.js', () => ({
  fetchPlacedItems: vi.fn().mockResolvedValue([]),
  placeOrder: vi.fn(),
  cancelPlacedItem: vi.fn(),
  fetchTableOrders: vi.fn().mockResolvedValue({ orders: [], totals: { dishes: 0, items: 0 } }),
}));

import * as cartService from '../services/cartService.js';
import * as guestService from '../services/guestService.js';
import * as guestOrderService from '../services/guestOrderService.js';

const makeDish = (id, name, price, over = {}) => ({
  id,
  _id: id,
  name,
  description: `${name} description`,
  price,
  category: 'mains',
  isVeg: true,
  allergens: [],
  allergensConfirmed: true,
  spiceLevel: 'mild',
  flavourTags: [],
  cuisine: 'Indian',
  course: 'main',
  portionSize: 'Serves 1',
  prepMinutes: 15,
  safe: true,
  clashes: [],
  reason: 'safe',
  available: true,
  ...over,
});

const ID = {
  soup: 'a'.repeat(24),
  peanutSalad: 'b'.repeat(24),
  curry: 'c'.repeat(24),
};

const SAMPLE_MENU = [
  makeDish(ID.soup, 'Tomato Soup', 250),
  makeDish(ID.peanutSalad, 'Peanut Salad', 400, {
    allergens: ['peanut'],
    safe: false,
    clashes: ['peanut'],
    reason: 'allergen',
  }),
  makeDish(ID.curry, 'Paneer Curry', 350),
];

const makePerson = (id, nickname, role = 'guest', allergies = []) => ({
  id,
  nickname,
  role,
  status: 'approved',
  allergiesDeclared: true,
  allergies,
});

const HOST = makePerson('h1', 'Hema', 'host', []);
const GUEST = makePerson('g1', 'Ravi', 'guest', ['peanut']);

const makeLine = (n, itemId, qty, addedBy, over = {}) => ({
  cartItemId: `00000000-0000-4000-8000-00000000000${n}`,
  itemId,
  qty,
  addedBy,
  isSurprise: false,
  ...over,
});

const makeSessionData = ({
  status = 'open',
  tableNumber = 5,
  cartVersion = 1,
  cart = [],
  participants = [HOST, GUEST],
  me = HOST,
  pending = [],
} = {}) => ({
  session: { status, tableNumber, cartVersion, participants, cart },
  me,
  participants,
  pending,
});

const makeCart = (sessionData, menuItems = SAMPLE_MENU, viewer = sessionData.me) =>
  buildCartView({
    session: sessionData.session,
    items: menuItems,
    viewer,
  });

const advanceAndFlush = async (ms = 10) => {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
};

const makeFrozenHistoryItem = ({ line, dish, adder, orderItemId, status = 'placed', isSurprise = false, revealed = false }) => {
  const item = freezeOrderItem({ line, dish, adder, orderItemId });
  return {
    ...item,
    status,
    isSurprise,
    revealed,
  };
};

const makeOrderDoc = ({
  id = '111111111111111111111111',
  createdAt = new Date('2026-10-24T12:00:00.000Z'),
  items = [],
} = {}) => ({
  _id: id,
  createdAt,
  items,
});

describe('GuestTableHistory integration tests', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    fakeSocket.reset();
    guestService.readGuestToken.mockReturnValue('valid-token');
    guestService.fetchGuestMenu.mockResolvedValue(SAMPLE_MENU);
    guestOrderService.fetchPlacedItems.mockResolvedValue([]);
    guestOrderService.fetchTableOrders.mockResolvedValue({ orders: [], totals: { dishes: 0, items: 0 } });
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    Object.defineProperty(document, 'hidden', {
      value: false,
      configurable: true,
    });
  });

  it('1. host sees Ordered so far with the table\'s dishes after an order has been placed', async () => {
    const sessionData = makeSessionData({ me: HOST, cart: [] });
    guestService.fetchMyTable.mockResolvedValue(sessionData);
    cartService.getCart.mockResolvedValue(makeCart(sessionData));

    const item1 = makeFrozenHistoryItem({
      line: makeLine(1, ID.soup, 2, HOST.id),
      dish: SAMPLE_MENU[0],
      adder: HOST,
      orderItemId: '00000000-0000-4000-8000-000000000001',
    });
    const orderDoc = makeOrderDoc({ id: '111111111111111111111111', items: [item1] });
    guestOrderService.fetchTableOrders.mockResolvedValue(orderHistoryView([orderDoc]));

    render(<GuestTable />);
    await advanceAndFlush();

    // Open cart modal
    const cartBar = screen.getByRole('button', { name: new RegExp(MESSAGES.guest.cartBarOrdered(2), 'i') });
    fireEvent.click(cartBar);
    await advanceAndFlush();

    const historySection = document.querySelector('.ordered-so-far');
    expect(historySection).toBeTruthy();
    expect(within(historySection).getByText(MESSAGES.guest.orderedHeading)).toBeTruthy();
    expect(within(historySection).getByText(MESSAGES.guest.orderedSummary(2))).toBeTruthy();
    expect(within(historySection).getByText(/Order 1/)).toBeTruthy();
    expect(within(historySection).getByText(/Tomato Soup/)).toBeTruthy();
    expect(within(historySection).getByText('Ordered by Hema')).toBeTruthy();
  });

  it('2. ordinary guest sees Ordered so far with the table\'s dishes', async () => {
    const sessionData = makeSessionData({
      me: GUEST,
      cart: [makeLine(1, ID.soup, 1, GUEST.id)],
    });
    guestService.fetchMyTable.mockResolvedValue(sessionData);
    cartService.getCart.mockResolvedValue(makeCart(sessionData));

    const item1 = makeFrozenHistoryItem({
      line: makeLine(1, ID.soup, 2, HOST.id),
      dish: SAMPLE_MENU[0],
      adder: HOST,
      orderItemId: '00000000-0000-4000-8000-000000000001',
    });
    const orderDoc = makeOrderDoc({ items: [item1] });
    guestOrderService.fetchTableOrders.mockResolvedValue(orderHistoryView([orderDoc]));

    render(<GuestTable />);
    await advanceAndFlush();

    // Ordinary guest opens cart modal
    const cartBar = screen.getByRole('button', { name: /view table order/i });
    fireEvent.click(cartBar);
    await advanceAndFlush();

    const historySection = document.querySelector('.ordered-so-far');
    expect(historySection).toBeTruthy();
    expect(within(historySection).getByText(MESSAGES.guest.orderedHeading)).toBeTruthy();
    expect(within(historySection).getByText(/Tomato Soup/)).toBeTruthy();
    expect(within(historySection).getByText('Ordered by Hema')).toBeTruthy();

    // Ordinary guest sees host note instead of place order button
    expect(screen.getByText(MESSAGES.guest.hostNote)).toBeTruthy();
    expect(screen.queryByRole('button', { name: MESSAGES.guest.placeOrder })).toBeNull();
  });

  it('3. the order sheet shows Ordered so far even when the cart is empty', async () => {
    const sessionData = makeSessionData({ me: HOST, cart: [] });
    guestService.fetchMyTable.mockResolvedValue(sessionData);
    cartService.getCart.mockResolvedValue(makeCart(sessionData));

    const item1 = makeFrozenHistoryItem({
      line: makeLine(1, ID.soup, 1, HOST.id),
      dish: SAMPLE_MENU[0],
      adder: HOST,
      orderItemId: '00000000-0000-4000-8000-000000000001',
    });
    const orderDoc = makeOrderDoc({ items: [item1] });
    guestOrderService.fetchTableOrders.mockResolvedValue(orderHistoryView([orderDoc]));

    render(<GuestTable />);
    await advanceAndFlush();

    fireEvent.click(screen.getByRole('button', { name: new RegExp(MESSAGES.guest.cartBarOrdered(1), 'i') }));
    await advanceAndFlush();

    expect(screen.getByText(MESSAGES.guest.cartEmpty)).toBeTruthy();
    const historySection = document.querySelector('.ordered-so-far');
    expect(historySection).toBeTruthy();
    expect(within(historySection).getByText(/Tomato Soup/)).toBeTruthy();
  });

  it('4. a dish cancelled by the host shows tagged and dimmed after a refresh', async () => {
    const sessionData = makeSessionData({ me: HOST, cart: [] });
    guestService.fetchMyTable.mockResolvedValue(sessionData);
    cartService.getCart.mockResolvedValue(makeCart(sessionData));

    const item1 = makeFrozenHistoryItem({
      line: makeLine(1, ID.soup, 2, HOST.id),
      dish: SAMPLE_MENU[0],
      adder: HOST,
      orderItemId: '00000000-0000-4000-8000-000000000001',
      status: 'cancelled',
    });
    const orderDoc = makeOrderDoc({ items: [item1] });
    guestOrderService.fetchTableOrders.mockResolvedValue(orderHistoryView([orderDoc]));

    render(<GuestTable />);
    await advanceAndFlush();

    fireEvent.click(screen.getByRole('button', { name: /table order is empty/i }));
    await advanceAndFlush();

    const row = document.querySelector('.ordered-row--cancelled');
    expect(row).toBeTruthy();
    expect(within(row).getByText(MESSAGES.guest.cancelledTag)).toBeTruthy();
    expect(within(row).getByText(/Tomato Soup/)).toBeTruthy();
  });

  it('5. a dish cancelled by the kitchen shows tagged and dimmed after a refresh', async () => {
    const sessionData = makeSessionData({ me: HOST, cart: [] });
    guestService.fetchMyTable.mockResolvedValue(sessionData);
    cartService.getCart.mockResolvedValue(makeCart(sessionData));

    // Initially active
    const itemActive = makeFrozenHistoryItem({
      line: makeLine(1, ID.soup, 1, HOST.id),
      dish: SAMPLE_MENU[0],
      adder: HOST,
      orderItemId: '00000000-0000-4000-8000-000000000001',
      status: 'placed',
    });
    guestOrderService.fetchTableOrders.mockResolvedValueOnce(orderHistoryView([makeOrderDoc({ items: [itemActive] })]));

    render(<GuestTable />);
    await advanceAndFlush();

    expect(document.querySelector('.ordered-row--cancelled')).toBeNull();

    // Kitchen cancelled it -> cart:changed or session:changed ping triggers reload
    const itemCancelled = makeFrozenHistoryItem({
      line: makeLine(1, ID.soup, 1, HOST.id),
      dish: SAMPLE_MENU[0],
      adder: HOST,
      orderItemId: '00000000-0000-4000-8000-000000000001',
      status: 'cancelled',
    });
    guestOrderService.fetchTableOrders.mockResolvedValue(orderHistoryView([makeOrderDoc({ items: [itemCancelled] })]));

    await fakeSocket.trigger('cart:changed', { cartVersion: 2 });
    await advanceAndFlush();

    fireEvent.click(screen.getByRole('button', { name: /table order is empty/i }));
    await advanceAndFlush();

    const row = document.querySelector('.ordered-row--cancelled');
    expect(row).toBeTruthy();
    expect(within(row).getByText(MESSAGES.guest.cancelledTag)).toBeTruthy();
  });

  it('6. menu cards show "Ordered so far: N" counted across both guests and orders', async () => {
    const sessionData = makeSessionData({ me: HOST, cart: [] });
    guestService.fetchMyTable.mockResolvedValue(sessionData);
    cartService.getCart.mockResolvedValue(makeCart(sessionData));

    // Order 1: 2 soups ordered by Hema
    const order1 = makeOrderDoc({
      id: '111111111111111111111111',
      items: [
        makeFrozenHistoryItem({
          line: makeLine(1, ID.soup, 2, HOST.id),
          dish: SAMPLE_MENU[0],
          adder: HOST,
          orderItemId: '00000000-0000-4000-8000-000000000001',
        }),
      ],
    });
    // Order 2: 1 soup ordered by Ravi
    const order2 = makeOrderDoc({
      id: '222222222222222222222222',
      items: [
        makeFrozenHistoryItem({
          line: makeLine(2, ID.soup, 1, GUEST.id),
          dish: SAMPLE_MENU[0],
          adder: GUEST,
          orderItemId: '00000000-0000-4000-8000-000000000002',
        }),
      ],
    });

    guestOrderService.fetchTableOrders.mockResolvedValue(orderHistoryView([order1, order2]));

    render(<GuestTable />);
    await advanceAndFlush();

    const badges = document.querySelectorAll('.guest-dish-ordered');
    expect(badges.length).toBe(1);
    expect(badges[0].textContent).toBe(MESSAGES.guest.orderedSoFar(3));
  });

  it('7. a dish nobody ordered shows no "Ordered so far" on its card', async () => {
    const sessionData = makeSessionData({ me: HOST, cart: [] });
    guestService.fetchMyTable.mockResolvedValue(sessionData);
    cartService.getCart.mockResolvedValue(makeCart(sessionData));

    // Only soup is ordered
    const order1 = makeOrderDoc({
      items: [
        makeFrozenHistoryItem({
          line: makeLine(1, ID.soup, 2, HOST.id),
          dish: SAMPLE_MENU[0],
          adder: HOST,
          orderItemId: '00000000-0000-4000-8000-000000000001',
        }),
      ],
    });
    guestOrderService.fetchTableOrders.mockResolvedValue(orderHistoryView([order1]));

    render(<GuestTable />);
    await advanceAndFlush();

    // Check Peanut Salad card has no .guest-dish-ordered
    const saladHeading = screen.getByRole('heading', { name: /peanut salad/i });
    const saladCard = saladHeading.closest('.guest-dish');
    expect(saladCard.querySelector('.guest-dish-ordered')).toBeNull();
  });

  it('8. the bottom bar says nothing new in the cart and how many items have been ordered when the cart is empty and items have been ordered', async () => {
    const sessionData = makeSessionData({ me: HOST, cart: [] });
    guestService.fetchMyTable.mockResolvedValue(sessionData);
    cartService.getCart.mockResolvedValue(makeCart(sessionData));

    const order1 = makeOrderDoc({
      items: [
        makeFrozenHistoryItem({
          line: makeLine(1, ID.soup, 3, HOST.id),
          dish: SAMPLE_MENU[0],
          adder: HOST,
          orderItemId: '00000000-0000-4000-8000-000000000001',
        }),
      ],
    });
    guestOrderService.fetchTableOrders.mockResolvedValue(orderHistoryView([order1]));

    render(<GuestTable />);
    await advanceAndFlush();

    expect(screen.getByRole('button', { name: MESSAGES.guest.cartBarOrdered(3) })).toBeTruthy();
  });

  it('9. the bottom bar says "Table order is empty" when nothing has been ordered', async () => {
    const sessionData = makeSessionData({ me: HOST, cart: [] });
    guestService.fetchMyTable.mockResolvedValue(sessionData);
    cartService.getCart.mockResolvedValue(makeCart(sessionData));
    guestOrderService.fetchTableOrders.mockResolvedValue({ orders: [], totals: { dishes: 0, items: 0 } });

    render(<GuestTable />);
    await advanceAndFlush();

    expect(screen.getByRole('button', { name: /table order is empty/i })).toBeTruthy();
  });

  it('10. a cart:changed socket ping with a new version reloads the table history', async () => {
    const sessionData = makeSessionData({ me: HOST, cartVersion: 1 });
    guestService.fetchMyTable.mockResolvedValue(sessionData);
    cartService.getCart.mockResolvedValue(makeCart(sessionData));

    render(<GuestTable />);
    await advanceAndFlush();

    expect(guestOrderService.fetchTableOrders).toHaveBeenCalledTimes(1);

    await fakeSocket.trigger('cart:changed', { cartVersion: 2 });
    await advanceAndFlush();

    expect(guestOrderService.fetchTableOrders).toHaveBeenCalledTimes(2);
  });

  it('11. a session:changed socket ping reloads the table history', async () => {
    const sessionData = makeSessionData({ me: HOST });
    guestService.fetchMyTable.mockResolvedValue(sessionData);
    cartService.getCart.mockResolvedValue(makeCart(sessionData));

    render(<GuestTable />);
    await advanceAndFlush();

    expect(guestOrderService.fetchTableOrders).toHaveBeenCalledTimes(1);

    await fakeSocket.trigger('session:changed', { session: sessionData.session });
    await advanceAndFlush();

    expect(guestOrderService.fetchTableOrders).toHaveBeenCalledTimes(2);
  });

  it('12. opening the cart sheet reloads the table history (handleOpenCart)', async () => {
    const sessionData = makeSessionData({ me: HOST });
    guestService.fetchMyTable.mockResolvedValue(sessionData);
    cartService.getCart.mockResolvedValue(makeCart(sessionData));

    render(<GuestTable />);
    await advanceAndFlush();

    expect(guestOrderService.fetchTableOrders).toHaveBeenCalledTimes(1);

    const cartBar = screen.getByRole('button', { name: /table order is empty/i });
    fireEvent.click(cartBar);
    await advanceAndFlush();

    expect(guestOrderService.fetchTableOrders).toHaveBeenCalledTimes(2);
  });

  it('13. a failed history reload keeps the existing list', async () => {
    const sessionData = makeSessionData({ me: HOST });
    guestService.fetchMyTable.mockResolvedValue(sessionData);
    cartService.getCart.mockResolvedValue(makeCart(sessionData));

    const orderDoc = makeOrderDoc({
      items: [
        makeFrozenHistoryItem({
          line: makeLine(1, ID.soup, 2, HOST.id),
          dish: SAMPLE_MENU[0],
          adder: HOST,
          orderItemId: '00000000-0000-4000-8000-000000000001',
        }),
      ],
    });
    guestOrderService.fetchTableOrders.mockResolvedValue(orderHistoryView([orderDoc]));

    render(<GuestTable />);
    await advanceAndFlush();

    // Open sheet to verify Tomato Soup is shown
    fireEvent.click(screen.getByRole('button', { name: new RegExp(MESSAGES.guest.cartBarOrdered(2), 'i') }));
    await advanceAndFlush();
    const historySection = document.querySelector('.ordered-so-far');
    expect(historySection).toBeTruthy();
    expect(within(historySection).getByText(/Tomato Soup/)).toBeTruthy();

    // Now reload fails
    guestOrderService.fetchTableOrders.mockRejectedValueOnce(new Error('Network error'));
    await fakeSocket.trigger('cart:changed', { cartVersion: 2 });
    await advanceAndFlush();

    // Tomato Soup is still shown
    expect(within(historySection).getByText(/Tomato Soup/)).toBeTruthy();
  });

  it('14. no history request is made while the guest is not on the menu screen (waiting or allergy screens)', async () => {
    // 14a. Waiting screen (pending approval)
    const pendingGuest = { ...GUEST, status: 'pending' };
    const waitingSessionData = makeSessionData({
      me: pendingGuest,
      participants: [HOST],
      pending: [pendingGuest],
    });
    guestService.fetchMyTable.mockResolvedValue(waitingSessionData);

    const { unmount } = render(<GuestTable />);
    await advanceAndFlush();

    expect(guestOrderService.fetchTableOrders).not.toHaveBeenCalled();
    unmount();

    // 14b. Allergy screen (allergies not declared)
    const unDeclaredGuest = { ...GUEST, allergiesDeclared: false };
    const allergySessionData = makeSessionData({
      me: unDeclaredGuest,
      participants: [HOST, unDeclaredGuest],
    });
    guestService.fetchMyTable.mockResolvedValue(allergySessionData);

    render(<GuestTable />);
    await advanceAndFlush();

    expect(guestOrderService.fetchTableOrders).not.toHaveBeenCalled();
  });
});
