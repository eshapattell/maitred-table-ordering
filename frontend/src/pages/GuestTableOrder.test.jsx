import React, { act } from 'react';
import { render, screen, fireEvent, cleanup, within } from '@testing-library/react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import GuestTable from './GuestTable.jsx';
import { MESSAGES } from '../utils/messages.js';
import { ORDER_MESSAGES } from '../utils/guestOrder.js';
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
};

const SAMPLE_MENU = [
  makeDish(ID.soup, 'Tomato Soup', 250),
  makeDish(ID.peanutSalad, 'Peanut Salad', 400, {
    allergens: ['peanut'],
    safe: false,
    clashes: ['peanut'],
    reason: 'allergen',
  }),
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

const MOCK_PLACED_ITEM = {
  orderId: '111111111111111111111111',
  orderItemId: '00000000-0000-4000-8000-000000000001',
  name: 'Tomato Soup',
  qty: 2,
  orderedBy: 'Hema',
};

describe('GuestTableOrder integration tests', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    fakeSocket.reset();
    guestService.readGuestToken.mockReturnValue('valid-token');
    guestService.fetchGuestMenu.mockResolvedValue(SAMPLE_MENU);
    guestOrderService.fetchPlacedItems.mockResolvedValue([]);
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    Object.defineProperty(document, 'hidden', {
      value: false,
      configurable: true,
    });
  });

  it('1. the host opens the order sheet and sees Place order, a guest sees the host note', async () => {
    const sessionData = makeSessionData({
      me: HOST,
      cart: [makeLine(1, ID.soup, 1, HOST.id)],
    });
    guestService.fetchMyTable.mockResolvedValue(sessionData);
    cartService.getCart.mockResolvedValue(makeCart(sessionData));

    render(<GuestTable />);
    await advanceAndFlush();

    // Open cart modal
    const cartBar = screen.getByRole('button', { name: /view table order/i });
    fireEvent.click(cartBar);
    await advanceAndFlush();

    // Host sees Place order button and no host note
    expect(screen.getByRole('button', { name: MESSAGES.guest.placeOrder })).toBeInTheDocument();
    expect(screen.queryByText(MESSAGES.guest.hostNote)).not.toBeInTheDocument();

    cleanup();

    // Now as guest
    const guestSessionData = makeSessionData({
      me: GUEST,
      cart: [makeLine(1, ID.soup, 1, HOST.id)],
    });
    guestService.fetchMyTable.mockResolvedValue(guestSessionData);
    cartService.getCart.mockResolvedValue(makeCart(guestSessionData, SAMPLE_MENU, GUEST));

    render(<GuestTable />);
    await advanceAndFlush();

    const guestCartBar = screen.getByRole('button', { name: /view table order/i });
    fireEvent.click(guestCartBar);
    await advanceAndFlush();

    // Guest sees host note and no Place order button
    expect(screen.queryByRole('button', { name: MESSAGES.guest.placeOrder })).not.toBeInTheDocument();
    expect(screen.getByText(MESSAGES.guest.hostNote)).toBeInTheDocument();
  });

  it('2. pressing Place order calls placeOrder with exactly the cart version on screen', async () => {
    const sessionData = makeSessionData({
      me: HOST,
      cartVersion: 4,
      cart: [makeLine(1, ID.soup, 2, HOST.id)],
    });
    guestService.fetchMyTable.mockResolvedValue(sessionData);
    cartService.getCart.mockResolvedValue(makeCart(sessionData));

    let resolvePlaceOrder;
    guestOrderService.placeOrder.mockReturnValue(
      new Promise((resolve) => {
        resolvePlaceOrder = resolve;
      })
    );

    render(<GuestTable />);
    await advanceAndFlush();

    fireEvent.click(screen.getByRole('button', { name: /view table order/i }));
    await advanceAndFlush();

    const placeBtn = screen.getByRole('button', { name: MESSAGES.guest.placeOrder });
    fireEvent.click(placeBtn);
    await advanceAndFlush();

    expect(guestOrderService.placeOrder).toHaveBeenCalledTimes(1);
    expect(guestOrderService.placeOrder).toHaveBeenCalledWith(4);

    // Button shows placing text and is disabled
    expect(screen.getByRole('button', { name: MESSAGES.guest.placingOrder })).toBeDisabled();

    // Clean up promise
    const emptySession = makeSessionData({ me: HOST, cartVersion: 5, cart: [] });
    resolvePlaceOrder({
      placed: 2,
      left: [],
      summary: { total: 0, byReason: {} },
      cart: makeCart(emptySession),
    });
    await advanceAndFlush();
  });

  it('3. on success the cart empties, placement message without left lines appears, and placed list loads', async () => {
    const sessionData = makeSessionData({
      me: HOST,
      cartVersion: 1,
      cart: [makeLine(1, ID.soup, 2, HOST.id)],
    });
    guestService.fetchMyTable.mockResolvedValue(sessionData);
    cartService.getCart.mockResolvedValue(makeCart(sessionData));

    const emptySession = makeSessionData({ me: HOST, cartVersion: 2, cart: [] });
    const emptyCartView = makeCart(emptySession);

    guestOrderService.placeOrder.mockResolvedValue({
      placed: 2,
      left: [],
      summary: { total: 0, byReason: {} },
      cart: emptyCartView,
    });
    guestOrderService.fetchPlacedItems.mockResolvedValue([MOCK_PLACED_ITEM]);

    render(<GuestTable />);
    await advanceAndFlush();

    fireEvent.click(screen.getByRole('button', { name: /view table order/i }));
    await advanceAndFlush();

    fireEvent.click(screen.getByRole('button', { name: MESSAGES.guest.placeOrder }));
    await advanceAndFlush();

    // Placed message appears
    expect(
      screen.getByText('Order placed: 2 dishes sent to the kitchen.')
    ).toBeInTheDocument();

    // Cart is empty
    expect(screen.getByText(MESSAGES.guest.cartEmpty)).toBeInTheDocument();
    expect(screen.getByText(/Table order is empty/i)).toBeInTheDocument();

    // Placed list loaded
    expect(screen.getByText(MESSAGES.guest.placedHeading)).toBeInTheDocument();
    expect(screen.getByText(MESSAGES.guest.placedHint)).toBeInTheDocument();
    expect(screen.getByText('2 x Tomato Soup')).toBeInTheDocument();
    expect(screen.getByText('Ordered by Hema')).toBeInTheDocument();
  });

  it('4. on success with left lines, placement message with reasons appears and placed list loads', async () => {
    const sessionData = makeSessionData({
      me: HOST,
      cartVersion: 2,
      cart: [
        makeLine(1, ID.soup, 1, HOST.id),
        makeLine(2, ID.peanutSalad, 1, GUEST.id),
      ],
    });
    guestService.fetchMyTable.mockResolvedValue(sessionData);
    cartService.getCart.mockResolvedValue(makeCart(sessionData));

    const leftSession = makeSessionData({
      me: HOST,
      cartVersion: 3,
      cart: [makeLine(2, ID.peanutSalad, 1, GUEST.id)],
    });
    const leftCartView = makeCart(leftSession);

    guestOrderService.placeOrder.mockResolvedValue({
      placed: 1,
      left: [{ cartItemId: makeLine(2, ID.peanutSalad, 1, GUEST.id).cartItemId, reason: 'unavailable' }],
      summary: { total: 1, byReason: { unavailable: 1 } },
      cart: leftCartView,
    });
    guestOrderService.fetchPlacedItems.mockResolvedValue([MOCK_PLACED_ITEM]);

    render(<GuestTable />);
    await advanceAndFlush();

    fireEvent.click(screen.getByRole('button', { name: /view table order/i }));
    await advanceAndFlush();

    fireEvent.click(screen.getByRole('button', { name: MESSAGES.guest.placeOrder }));
    await advanceAndFlush();

    // Placed message with left detail appears
    expect(
      screen.getByText('Order placed: 1 dish sent to the kitchen. 1 item was left in the cart (unavailable: 1).')
    ).toBeInTheDocument();

    // Placed list loaded
    expect(screen.getByText(MESSAGES.guest.placedHeading)).toBeInTheDocument();
    expect(screen.getByText('2 x Tomato Soup')).toBeInTheDocument();
  });

  it('5. a double click sends one request', async () => {
    const sessionData = makeSessionData({
      me: HOST,
      cartVersion: 1,
      cart: [makeLine(1, ID.soup, 1, HOST.id)],
    });
    guestService.fetchMyTable.mockResolvedValue(sessionData);
    cartService.getCart.mockResolvedValue(makeCart(sessionData));

    let resolvePlace;
    guestOrderService.placeOrder.mockReturnValue(
      new Promise((res) => {
        resolvePlace = res;
      })
    );

    render(<GuestTable />);
    await advanceAndFlush();

    fireEvent.click(screen.getByRole('button', { name: /view table order/i }));
    await advanceAndFlush();

    const btn = screen.getByRole('button', { name: MESSAGES.guest.placeOrder });
    fireEvent.click(btn);
    fireEvent.click(btn);
    await advanceAndFlush();

    expect(guestOrderService.placeOrder).toHaveBeenCalledTimes(1);

    const emptySession = makeSessionData({ me: HOST, cartVersion: 2, cart: [] });
    resolvePlace({
      placed: 1,
      left: [],
      summary: { total: 0, byReason: {} },
      cart: makeCart(emptySession),
    });
    await advanceAndFlush();
  });

  it('6. CART_CHANGED shows its message and refetches the cart', async () => {
    const sessionData = makeSessionData({
      me: HOST,
      cartVersion: 1,
      cart: [makeLine(1, ID.soup, 1, HOST.id)],
    });
    guestService.fetchMyTable.mockResolvedValue(sessionData);
    cartService.getCart.mockResolvedValue(makeCart(sessionData));

    const err = new Error('Cart changed');
    err.response = { status: 409, data: { code: 'CART_CHANGED' } };
    guestOrderService.placeOrder.mockRejectedValue(err);

    render(<GuestTable />);
    await advanceAndFlush();

    fireEvent.click(screen.getByRole('button', { name: /view table order/i }));
    await advanceAndFlush();

    const getCartCallCount = cartService.getCart.mock.calls.length;

    fireEvent.click(screen.getByRole('button', { name: MESSAGES.guest.placeOrder }));
    await advanceAndFlush();

    // Shows CART_CHANGED message
    expect(screen.getByText(ORDER_MESSAGES.cartChanged)).toBeInTheDocument();

    // Refetches cart
    expect(cartService.getCart.mock.calls.length).toBeGreaterThan(getCartCallCount);
  });

  it('7. NOTHING_TO_ORDER shows why and refetches the cart', async () => {
    const sessionData = makeSessionData({
      me: HOST,
      cartVersion: 1,
      cart: [makeLine(1, ID.soup, 1, HOST.id)],
    });
    guestService.fetchMyTable.mockResolvedValue(sessionData);
    cartService.getCart.mockResolvedValue(makeCart(sessionData));

    const err = new Error('Nothing to order');
    err.response = {
      status: 400,
      data: {
        code: 'NOTHING_TO_ORDER',
        left: [{ reason: 'unavailable' }, { reason: 'unavailable' }],
      },
    };
    guestOrderService.placeOrder.mockRejectedValue(err);

    render(<GuestTable />);
    await advanceAndFlush();

    fireEvent.click(screen.getByRole('button', { name: /view table order/i }));
    await advanceAndFlush();

    const getCartCallCount = cartService.getCart.mock.calls.length;

    fireEvent.click(screen.getByRole('button', { name: MESSAGES.guest.placeOrder }));
    await advanceAndFlush();

    // Shows NOTHING_TO_ORDER with reason detail
    expect(
      screen.getByText('Nothing in the cart can be ordered right now (unavailable: 2)')
    ).toBeInTheDocument();

    // Refetches cart
    expect(cartService.getCart.mock.calls.length).toBeGreaterThan(getCartCallCount);
  });

  it('8. a 403 error shows the right message', async () => {
    const sessionData = makeSessionData({
      me: HOST,
      cartVersion: 1,
      cart: [makeLine(1, ID.soup, 1, HOST.id)],
    });
    guestService.fetchMyTable.mockResolvedValue(sessionData);
    cartService.getCart.mockResolvedValue(makeCart(sessionData));

    const err = new Error('Host only');
    err.response = { status: 403, data: { code: 'HOST_ONLY' } };
    guestOrderService.placeOrder.mockRejectedValue(err);

    render(<GuestTable />);
    await advanceAndFlush();

    fireEvent.click(screen.getByRole('button', { name: /view table order/i }));
    await advanceAndFlush();

    fireEvent.click(screen.getByRole('button', { name: MESSAGES.guest.placeOrder }));
    await advanceAndFlush();

    expect(screen.getByText(ORDER_MESSAGES.generic)).toBeInTheDocument();
  });

  it('9. a network error shows the network message', async () => {
    const sessionData = makeSessionData({
      me: HOST,
      cartVersion: 1,
      cart: [makeLine(1, ID.soup, 1, HOST.id)],
    });
    guestService.fetchMyTable.mockResolvedValue(sessionData);
    cartService.getCart.mockResolvedValue(makeCart(sessionData));

    const err = new Error('Network error');
    guestOrderService.placeOrder.mockRejectedValue(err);

    render(<GuestTable />);
    await advanceAndFlush();

    fireEvent.click(screen.getByRole('button', { name: /view table order/i }));
    await advanceAndFlush();

    fireEvent.click(screen.getByRole('button', { name: MESSAGES.guest.placeOrder }));
    await advanceAndFlush();

    expect(screen.getByText(ORDER_MESSAGES.network)).toBeInTheDocument();
  });

  it('10. the placed list shows only for the host', async () => {
    const sessionData = makeSessionData({
      me: GUEST,
      cart: [makeLine(1, ID.soup, 1, HOST.id)],
    });
    guestService.fetchMyTable.mockResolvedValue(sessionData);
    cartService.getCart.mockResolvedValue(makeCart(sessionData, SAMPLE_MENU, GUEST));
    guestOrderService.fetchPlacedItems.mockResolvedValue([MOCK_PLACED_ITEM]);

    render(<GuestTable />);
    await advanceAndFlush();

    fireEvent.click(screen.getByRole('button', { name: /view table order/i }));
    await advanceAndFlush();

    // Guest does not see placed section
    expect(screen.queryByText(MESSAGES.guest.placedHeading)).not.toBeInTheDocument();
  });

  it('11. cancelling asks first, keeping does nothing', async () => {
    const sessionData = makeSessionData({
      me: HOST,
      cart: [makeLine(1, ID.soup, 1, HOST.id)],
    });
    guestService.fetchMyTable.mockResolvedValue(sessionData);
    cartService.getCart.mockResolvedValue(makeCart(sessionData));
    guestOrderService.fetchPlacedItems.mockResolvedValue([MOCK_PLACED_ITEM]);

    render(<GuestTable />);
    await advanceAndFlush();

    fireEvent.click(screen.getByRole('button', { name: /view table order/i }));
    await advanceAndFlush();

    expect(screen.getByText(MESSAGES.guest.placedHeading)).toBeInTheDocument();

    const cancelBtn = screen.getByRole('button', {
      name: MESSAGES.guest.cancelPlacedAria('Tomato Soup'),
    });
    fireEvent.click(cancelBtn);
    await advanceAndFlush();

    // Shows confirmation
    expect(screen.getByText(MESSAGES.guest.cancelAsk('Tomato Soup'))).toBeInTheDocument();
    expect(screen.getByRole('button', { name: MESSAGES.guest.cancelYes })).toBeInTheDocument();

    const keepBtn = screen.getByRole('button', { name: MESSAGES.guest.cancelNo });
    expect(keepBtn).toBeInTheDocument();

    // Click keep
    fireEvent.click(keepBtn);
    await advanceAndFlush();

    // Did not cancel
    expect(guestOrderService.cancelPlacedItem).not.toHaveBeenCalled();
    expect(screen.queryByText(MESSAGES.guest.cancelAsk('Tomato Soup'))).not.toBeInTheDocument();
    expect(screen.getByRole('button', {
      name: MESSAGES.guest.cancelPlacedAria('Tomato Soup'),
    })).toBeInTheDocument();
  });

  it('12. confirming calls cancelPlacedItem with the right ids and reloads the list', async () => {
    const sessionData = makeSessionData({
      me: HOST,
      cart: [makeLine(1, ID.soup, 1, HOST.id)],
    });
    guestService.fetchMyTable.mockResolvedValue(sessionData);
    cartService.getCart.mockResolvedValue(makeCart(sessionData));
    guestOrderService.fetchPlacedItems.mockResolvedValue([MOCK_PLACED_ITEM]);
    guestOrderService.cancelPlacedItem.mockResolvedValue({ ok: true });

    render(<GuestTable />);
    await advanceAndFlush();

    fireEvent.click(screen.getByRole('button', { name: /view table order/i }));
    await advanceAndFlush();

    const cancelBtn = screen.getByRole('button', {
      name: MESSAGES.guest.cancelPlacedAria('Tomato Soup'),
    });
    fireEvent.click(cancelBtn);
    await advanceAndFlush();

    const fetchCallsBefore = guestOrderService.fetchPlacedItems.mock.calls.length;

    const confirmBtn = screen.getByRole('button', { name: MESSAGES.guest.cancelYes });
    fireEvent.click(confirmBtn);
    await advanceAndFlush();

    expect(guestOrderService.cancelPlacedItem).toHaveBeenCalledWith(
      MOCK_PLACED_ITEM.orderId,
      MOCK_PLACED_ITEM.orderItemId
    );
    expect(guestOrderService.fetchPlacedItems.mock.calls.length).toBeGreaterThan(fetchCallsBefore);
  });

  it('13. ALREADY_STARTED shows its message and reloads the list', async () => {
    const sessionData = makeSessionData({
      me: HOST,
      cart: [makeLine(1, ID.soup, 1, HOST.id)],
    });
    guestService.fetchMyTable.mockResolvedValue(sessionData);
    cartService.getCart.mockResolvedValue(makeCart(sessionData));
    guestOrderService.fetchPlacedItems.mockResolvedValue([MOCK_PLACED_ITEM]);

    const err = new Error('Already started');
    err.response = { status: 409, data: { code: 'ALREADY_STARTED' } };
    guestOrderService.cancelPlacedItem.mockRejectedValue(err);

    render(<GuestTable />);
    await advanceAndFlush();

    fireEvent.click(screen.getByRole('button', { name: /view table order/i }));
    await advanceAndFlush();

    fireEvent.click(
      screen.getByRole('button', { name: MESSAGES.guest.cancelPlacedAria('Tomato Soup') })
    );
    await advanceAndFlush();

    const fetchCallsBefore = guestOrderService.fetchPlacedItems.mock.calls.length;

    fireEvent.click(screen.getByRole('button', { name: MESSAGES.guest.cancelYes }));
    await advanceAndFlush();

    expect(screen.getByText(ORDER_MESSAGES.alreadyStarted)).toBeInTheDocument();
    expect(guestOrderService.fetchPlacedItems.mock.calls.length).toBeGreaterThan(fetchCallsBefore);
  });

  it('14. a guest who is not the host never triggers an order request', async () => {
    const sessionData = makeSessionData({
      me: GUEST,
      cart: [makeLine(1, ID.soup, 1, GUEST.id)],
    });
    guestService.fetchMyTable.mockResolvedValue(sessionData);
    cartService.getCart.mockResolvedValue(makeCart(sessionData, SAMPLE_MENU, GUEST));

    render(<GuestTable />);
    await advanceAndFlush();

    fireEvent.click(screen.getByRole('button', { name: /view table order/i }));
    await advanceAndFlush();

    expect(screen.queryByRole('button', { name: MESSAGES.guest.placeOrder })).not.toBeInTheDocument();
    expect(guestOrderService.placeOrder).not.toHaveBeenCalled();
  });

  it('15. no order request is made while the sheet is closed except list load rules', async () => {
    const sessionData = makeSessionData({
      me: HOST,
      cart: [makeLine(1, ID.soup, 1, HOST.id)],
    });
    guestService.fetchMyTable.mockResolvedValue(sessionData);
    cartService.getCart.mockResolvedValue(makeCart(sessionData));

    render(<GuestTable />);
    await advanceAndFlush();

    // Sheet is closed
    expect(screen.queryByRole('button', { name: MESSAGES.guest.placeOrder })).not.toBeInTheDocument();
    expect(guestOrderService.placeOrder).not.toHaveBeenCalled();
  });

  it('16. a "cart:changed" ping with a new version while the sheet is open reloads the placed list', async () => {
    const sessionData = makeSessionData({
      me: HOST,
      cartVersion: 1,
      cart: [makeLine(1, ID.soup, 1, HOST.id)],
    });
    guestService.fetchMyTable.mockResolvedValue(sessionData);
    cartService.getCart.mockResolvedValue(makeCart(sessionData));
    guestOrderService.fetchPlacedItems.mockResolvedValue([MOCK_PLACED_ITEM]);

    render(<GuestTable />);
    await advanceAndFlush();

    // Open sheet
    fireEvent.click(screen.getByRole('button', { name: /view table order/i }));
    await advanceAndFlush();

    const fetchCallsBefore = guestOrderService.fetchPlacedItems.mock.calls.length;

    // Simulate cart update on server
    const updatedSession = makeSessionData({
      me: HOST,
      cartVersion: 2,
      cart: [makeLine(1, ID.soup, 2, HOST.id)],
    });
    cartService.getCart.mockResolvedValue(makeCart(updatedSession));

    // Ping socket
    await fakeSocket.trigger('cart:changed');
    await advanceAndFlush();

    expect(guestOrderService.fetchPlacedItems.mock.calls.length).toBeGreaterThan(fetchCallsBefore);
  });

  it('17. closing the cart sheet dismisses any order message or error', async () => {
    const sessionData = makeSessionData({
      me: HOST,
      cartVersion: 1,
      cart: [makeLine(1, ID.soup, 1, HOST.id)],
    });
    guestService.fetchMyTable.mockResolvedValue(sessionData);
    cartService.getCart.mockResolvedValue(makeCart(sessionData));

    const err = new Error('Host only');
    err.response = { status: 403, data: { code: 'HOST_ONLY' } };
    guestOrderService.placeOrder.mockRejectedValue(err);

    render(<GuestTable />);
    await advanceAndFlush();

    // Open sheet
    fireEvent.click(screen.getByRole('button', { name: /view table order/i }));
    await advanceAndFlush();

    // Click place order to get error
    fireEvent.click(screen.getByRole('button', { name: MESSAGES.guest.placeOrder }));
    await advanceAndFlush();

    expect(screen.getByText(ORDER_MESSAGES.generic)).toBeInTheDocument();

    // Close sheet via Modal close button
    const closeBtn = screen.getByRole('button', { name: MESSAGES.common.close });
    fireEvent.click(closeBtn);
    await advanceAndFlush();

    // Reopen sheet
    fireEvent.click(screen.getByRole('button', { name: /view table order/i }));
    await advanceAndFlush();

    // Error is dismissed
    expect(screen.queryByText(ORDER_MESSAGES.generic)).not.toBeInTheDocument();
  });
});
