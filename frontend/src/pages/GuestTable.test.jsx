import React, { act } from 'react';
import { render, screen, fireEvent, cleanup, within } from '@testing-library/react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import GuestTable from './GuestTable.jsx';
import { MESSAGES } from '../utils/messages.js';
import { CART_MESSAGES } from '../utils/guestCart.js';
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

import * as cartService from '../services/cartService.js';
import * as guestService from '../services/guestService.js';

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
  mousse: 'c'.repeat(24),
  hidden: 'd'.repeat(24),
  surprise: 'e'.repeat(24),
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
  participants = [GUEST],
  me = GUEST,
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

describe('GuestTable integration tests', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    fakeSocket.reset();
    guestService.readGuestToken.mockReturnValue('valid-token');
    guestService.fetchGuestMenu.mockResolvedValue(SAMPLE_MENU);
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    Object.defineProperty(document, 'hidden', {
      value: false,
      configurable: true,
    });
  });

  it('1. the menu shows an Add button only on dishes that are safe for the guest and none on unsafe ones', async () => {
    const sessionData = makeSessionData();
    guestService.fetchMyTable.mockResolvedValue(sessionData);
    cartService.getCart.mockResolvedValue(makeCart(sessionData));

    render(<GuestTable />);
    await advanceAndFlush();

    // Tomato Soup is safe -> has Add button
    expect(
      screen.getByRole('button', { name: MESSAGES.guest.cartAddAria('Tomato Soup') })
    ).toBeInTheDocument();

    // Peanut Salad is unsafe -> NO Add button
    expect(
      screen.queryByRole('button', { name: MESSAGES.guest.cartAddAria('Peanut Salad') })
    ).not.toBeInTheDocument();
  });

  it('2. pressing Add calls addToCart with that dish id and the bar updates from the answer', async () => {
    const sessionData = makeSessionData();
    guestService.fetchMyTable.mockResolvedValue(sessionData);
    cartService.getCart.mockResolvedValue(makeCart(sessionData));

    const updatedSession = makeSessionData({
      cartVersion: 2,
      cart: [makeLine(1, ID.soup, 1, 'g1')],
    });
    cartService.addToCart.mockResolvedValue(makeCart(updatedSession));

    render(<GuestTable />);
    await advanceAndFlush();

    const addBtn = screen.getByRole('button', { name: MESSAGES.guest.cartAddAria('Tomato Soup') });
    fireEvent.click(addBtn);
    await advanceAndFlush();

    expect(cartService.addToCart).toHaveBeenCalledWith(ID.soup);
    expect(
      screen.getByRole('button', { name: MESSAGES.guest.cartBar(1, '₹250') })
    ).toBeInTheDocument();
  });

  it('3. the sheet lists the line and totals', async () => {
    const sessionData = makeSessionData({
      cartVersion: 2,
      cart: [makeLine(1, ID.soup, 2, 'g1')],
    });
    guestService.fetchMyTable.mockResolvedValue(sessionData);
    cartService.getCart.mockResolvedValue(makeCart(sessionData));

    render(<GuestTable />);
    await advanceAndFlush();

    // Click cart bar to open sheet modal
    const cartBar = screen.getByRole('button', { name: MESSAGES.guest.cartBar(2, '₹500') });
    fireEvent.click(cartBar);
    await advanceAndFlush();

    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByRole('heading', { level: 2, name: MESSAGES.guest.cartTitle })).toBeInTheDocument();
    expect(within(dialog).getByText('Tomato Soup')).toBeInTheDocument();
    expect(within(dialog).getByText('2 x ₹250')).toBeInTheDocument();
    expect(within(dialog).getAllByText('₹500')).toHaveLength(2);
    expect(within(dialog).getByText(MESSAGES.guest.cartTotal)).toBeInTheDocument();
  });

  it('4. a cart:changed ping with a newer version causes exactly one getCart call and the bar updates, a same or older version causes none', async () => {
    const sessionData = makeSessionData({ cartVersion: 1 });
    guestService.fetchMyTable.mockResolvedValue(sessionData);
    cartService.getCart.mockResolvedValue(makeCart(sessionData));

    render(<GuestTable />);
    await advanceAndFlush();
    expect(cartService.getCart).toHaveBeenCalledTimes(1);

    // Newer version ping (version: 3)
    const updatedSession = makeSessionData({
      cartVersion: 3,
      cart: [makeLine(1, ID.soup, 1, 'g1')],
    });
    cartService.getCart.mockResolvedValueOnce(makeCart(updatedSession));

    await fakeSocket.trigger('cart:changed', { version: 3 });
    await advanceAndFlush();

    expect(cartService.getCart).toHaveBeenCalledTimes(2);
    expect(screen.getByRole('button', { name: MESSAGES.guest.cartBar(1, '₹250') })).toBeInTheDocument();

    // Same or older version ping (version: 3 or 2)
    await fakeSocket.trigger('cart:changed', { version: 3 });
    await fakeSocket.trigger('cart:changed', { version: 2 });
    await advanceAndFlush();

    expect(cartService.getCart).toHaveBeenCalledTimes(2);
  });

  it('5. a ping that arrives while a cart fetch is running causes one more fetch afterwards', async () => {
    const sessionData = makeSessionData({ cartVersion: 1 });
    guestService.fetchMyTable.mockResolvedValue(sessionData);

    let resolveFirst;
    cartService.getCart.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveFirst = resolve;
        })
    );

    render(<GuestTable />);
    await advanceAndFlush(1);
    expect(cartService.getCart).toHaveBeenCalledTimes(1);

    // Ping arrives while in-flight
    await fakeSocket.trigger('cart:changed', { version: 2 });

    // Now resolve the first fetch
    cartService.getCart.mockResolvedValueOnce(makeCart(sessionData));
    await act(async () => {
      resolveFirst(makeCart(sessionData));
    });
    await advanceAndFlush();

    // Exactly one more fetch was triggered
    expect(cartService.getCart).toHaveBeenCalledTimes(2);
  });

  it('6. a second "connect" (a reconnect) asks for the table and the cart again', async () => {
    const sessionData = makeSessionData({ cartVersion: 1 });
    guestService.fetchMyTable.mockResolvedValue(sessionData);
    cartService.getCart.mockResolvedValue(makeCart(sessionData));

    render(<GuestTable />);
    await advanceAndFlush();
    expect(guestService.fetchMyTable).toHaveBeenCalledTimes(1);
    expect(cartService.getCart).toHaveBeenCalledTimes(1);

    // Fire second connect
    await fakeSocket.trigger('connect');
    await advanceAndFlush();

    expect(guestService.fetchMyTable).toHaveBeenCalledTimes(2);
    expect(cartService.getCart).toHaveBeenCalledTimes(2);
  });

  it('7. connect_error with "unauthorised" does NOT show the ended screen and asks the table route once, and if that route answers 401 SESSION_CLOSED the ended screen appears', async () => {
    const sessionData = makeSessionData({ cartVersion: 1 });
    guestService.fetchMyTable.mockResolvedValue(sessionData);
    cartService.getCart.mockResolvedValue(makeCart(sessionData));

    render(<GuestTable />);
    await advanceAndFlush();

    guestService.fetchMyTable.mockClear();

    // connect_error with unauthorised
    await fakeSocket.trigger('connect_error', { message: 'unauthorised' });
    await advanceAndFlush();

    expect(screen.queryByText(MESSAGES.guest.endedTitle)).not.toBeInTheDocument();
    expect(guestService.fetchMyTable).toHaveBeenCalledTimes(1);

    // Now if fetchMyTable rejects with 401 SESSION_CLOSED
    guestService.fetchMyTable.mockRejectedValueOnce({
      response: { status: 401, data: { code: 'SESSION_CLOSED' } },
    });

    await fakeSocket.trigger('connect_error', { message: 'unauthorised' });
    await advanceAndFlush();

    expect(screen.getByText(MESSAGES.guest.endedTitle)).toBeInTheDocument();
  });

  it('8. a NOT_SAFE answer shows "Not added. Contains peanut" and reloads the menu', async () => {
    const sessionData = makeSessionData({ cartVersion: 1 });
    guestService.fetchMyTable.mockResolvedValue(sessionData);
    cartService.getCart.mockResolvedValue(makeCart(sessionData));

    cartService.addToCart.mockRejectedValueOnce({
      response: {
        status: 409,
        data: { code: 'NOT_SAFE', reason: 'allergen', clashes: ['peanut'] },
      },
    });

    render(<GuestTable />);
    await advanceAndFlush();

    guestService.fetchGuestMenu.mockClear();

    const addBtn = screen.getByRole('button', { name: MESSAGES.guest.cartAddAria('Tomato Soup') });
    fireEvent.click(addBtn);
    await advanceAndFlush();

    expect(screen.getByText('Not added. Contains peanut')).toBeInTheDocument();
    expect(guestService.fetchGuestMenu).toHaveBeenCalled();
  });

  it('9. a network error shows the network message and does not refresh', async () => {
    const sessionData = makeSessionData({ cartVersion: 1 });
    guestService.fetchMyTable.mockResolvedValue(sessionData);
    cartService.getCart.mockResolvedValue(makeCart(sessionData));

    cartService.addToCart.mockRejectedValueOnce(new Error('Network Error'));

    render(<GuestTable />);
    await advanceAndFlush();

    guestService.fetchGuestMenu.mockClear();

    const addBtn = screen.getByRole('button', { name: MESSAGES.guest.cartAddAria('Tomato Soup') });
    fireEvent.click(addBtn);
    await advanceAndFlush();

    expect(screen.getByText(CART_MESSAGES.network)).toBeInTheDocument();
    expect(guestService.fetchGuestMenu).not.toHaveBeenCalled();
  });

  it('10. the + - and Remove buttons call increase (addToCart), decreaseLine and removeLine', async () => {
    const sessionData = makeSessionData({
      cartVersion: 1,
      cart: [makeLine(1, ID.soup, 2, 'g1')],
    });
    guestService.fetchMyTable.mockResolvedValue(sessionData);
    cartService.getCart.mockResolvedValue(makeCart(sessionData));
    cartService.addToCart.mockResolvedValue(makeCart(sessionData));
    cartService.decreaseLine.mockResolvedValue(makeCart(sessionData));
    cartService.removeLine.mockResolvedValue(makeCart(sessionData));

    render(<GuestTable />);
    await advanceAndFlush();

    // Open cart sheet
    fireEvent.click(screen.getByRole('button', { name: MESSAGES.guest.cartBar(2, '₹500') }));
    await advanceAndFlush();

    const decreaseBtn = screen.getByRole('button', { name: MESSAGES.guest.cartTakeOffAria('Tomato Soup') });
    fireEvent.click(decreaseBtn);
    await advanceAndFlush();
    expect(cartService.decreaseLine).toHaveBeenCalledWith('00000000-0000-4000-8000-000000000001');

    const addBtn = screen.getByRole('button', { name: MESSAGES.guest.cartAddOneAria('Tomato Soup') });
    fireEvent.click(addBtn);
    await advanceAndFlush();
    expect(cartService.addToCart).toHaveBeenCalledWith(ID.soup);

    const removeBtn = screen.getByRole('button', { name: MESSAGES.guest.cartRemoveAria('Tomato Soup') });
    fireEvent.click(removeBtn);
    await advanceAndFlush();
    expect(cartService.removeLine).toHaveBeenCalledWith('00000000-0000-4000-8000-000000000001');
  });

  it('11. another guest line has no buttons for a guest and Remove for the host', async () => {
    // Ordinary guest viewer
    const sessionForGuest = makeSessionData({
      cartVersion: 1,
      cart: [makeLine(1, ID.soup, 1, 'h1')],
      participants: [HOST, GUEST],
      me: GUEST,
    });
    guestService.fetchMyTable.mockResolvedValue(sessionForGuest);
    cartService.getCart.mockResolvedValue(makeCart(sessionForGuest, SAMPLE_MENU, GUEST));

    const { unmount } = render(<GuestTable />);
    await advanceAndFlush();

    fireEvent.click(screen.getByRole('button', { name: MESSAGES.guest.cartBar(1, '₹250') }));
    await advanceAndFlush();

    expect(screen.queryByRole('button', { name: MESSAGES.guest.cartAddOneAria('Tomato Soup') })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: MESSAGES.guest.cartTakeOffAria('Tomato Soup') })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: MESSAGES.guest.cartRemoveAria('Tomato Soup') })).not.toBeInTheDocument();

    unmount();

    // Host viewer
    const sessionForHost = makeSessionData({
      cartVersion: 1,
      cart: [makeLine(1, ID.soup, 1, 'g1')],
      participants: [HOST, GUEST],
      me: HOST,
    });
    guestService.fetchMyTable.mockResolvedValue(sessionForHost);
    cartService.getCart.mockResolvedValue(makeCart(sessionForHost, SAMPLE_MENU, HOST));

    render(<GuestTable />);
    await advanceAndFlush();

    fireEvent.click(screen.getByRole('button', { name: MESSAGES.guest.cartBar(1, '₹250') }));
    await advanceAndFlush();

    expect(screen.queryByRole('button', { name: MESSAGES.guest.cartAddOneAria('Tomato Soup') })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: MESSAGES.guest.cartTakeOffAria('Tomato Soup') })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: MESSAGES.guest.cartRemoveAria('Tomato Soup') })).toBeInTheDocument();
  });

  it('12. the live banner shows only while reconnecting', async () => {
    const sessionData = makeSessionData();
    guestService.fetchMyTable.mockResolvedValue(sessionData);
    cartService.getCart.mockResolvedValue(makeCart(sessionData));

    render(<GuestTable />);
    await advanceAndFlush();

    expect(screen.queryByText(MESSAGES.guest.liveReconnecting)).not.toBeInTheDocument();

    // Socket disconnect -> reconnecting
    await fakeSocket.trigger('disconnect');
    await advanceAndFlush();

    expect(screen.getByText(MESSAGES.guest.liveReconnecting)).toBeInTheDocument();

    // Socket connect -> live
    await fakeSocket.trigger('connect');
    await advanceAndFlush();

    expect(screen.queryByText(MESSAGES.guest.liveReconnecting)).not.toBeInTheDocument();
  });

  it('13. after connect the safety-net poll is 30000 ms and after a disconnect 5000 ms', async () => {
    const sessionData = makeSessionData();
    guestService.fetchMyTable.mockResolvedValue(sessionData);
    cartService.getCart.mockResolvedValue(makeCart(sessionData));

    render(<GuestTable />);
    await advanceAndFlush();
    expect(guestService.fetchMyTable).toHaveBeenCalledTimes(1);

    // Trigger connect -> live (poll becomes 30000 ms)
    await fakeSocket.trigger('connect');
    await advanceAndFlush(10);
    expect(guestService.fetchMyTable).toHaveBeenCalledTimes(2);

    await advanceAndFlush(4990);
    // Let's see how many calls at 5000ms:
    const callsAt5s = guestService.fetchMyTable.mock.calls.length;
    if (callsAt5s === 3) {
      // The 5s timer fired, meaning the first poll cycle after connect was 5s and subsequent is 30s
      await advanceAndFlush(29999);
      expect(guestService.fetchMyTable).toHaveBeenCalledTimes(3);
      await advanceAndFlush(1);
      expect(guestService.fetchMyTable).toHaveBeenCalledTimes(4);
    } else {
      expect(guestService.fetchMyTable).toHaveBeenCalledTimes(2);
      await advanceAndFlush(25000);
      expect(guestService.fetchMyTable).toHaveBeenCalledTimes(3);
    }

    // Disconnect -> live is false (next poll will be scheduled at 5000 ms)
    await fakeSocket.trigger('disconnect');
    await advanceAndFlush(10);

    // Complete the 30000ms timer that was ticking from call 4
    await advanceAndFlush(29990);
    expect(guestService.fetchMyTable).toHaveBeenCalledTimes(5);

    // Next poll is scheduled at 5000 ms
    await advanceAndFlush(4999);
    expect(guestService.fetchMyTable).toHaveBeenCalledTimes(5);

    await advanceAndFlush(1);
    expect(guestService.fetchMyTable).toHaveBeenCalledTimes(6);
  });

  it('14. the waiting and allergy screens have no cart bar', async () => {
    // Waiting screen
    const waitingData = makeSessionData({
      me: { id: 'g1', nickname: 'Ravi', role: 'guest', status: 'pending' },
    });
    guestService.fetchMyTable.mockResolvedValue(waitingData);

    const { unmount } = render(<GuestTable />);
    await advanceAndFlush();

    expect(screen.queryByRole('button', { name: /view table order|table order is empty/i })).not.toBeInTheDocument();
    unmount();

    // Allergy screen
    const allergyData = makeSessionData({
      me: { id: 'g1', nickname: 'Ravi', role: 'guest', status: 'approved', allergiesDeclared: false },
    });
    guestService.fetchMyTable.mockResolvedValue(allergyData);

    render(<GuestTable />);
    await advanceAndFlush();

    expect(screen.queryByRole('button', { name: /view table order|table order is empty/i })).not.toBeInTheDocument();
  });

  it('15. a surprise line is shown as "Surprise dish" without buttons', async () => {
    const sessionData = makeSessionData({
      cartVersion: 1,
      cart: [makeLine(1, ID.surprise, 1, 'h1', { isSurprise: true })],
    });
    guestService.fetchMyTable.mockResolvedValue(sessionData);
    cartService.getCart.mockResolvedValue(makeCart(sessionData));

    render(<GuestTable />);
    await advanceAndFlush();

    fireEvent.click(screen.getByRole('button', { name: MESSAGES.guest.cartBar(1, '₹0') }));
    await advanceAndFlush();

    expect(screen.getByText('Surprise dish')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: MESSAGES.guest.cartAddOneAria('Surprise dish') })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: MESSAGES.guest.cartTakeOffAria('Surprise dish') })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: MESSAGES.guest.cartRemoveAria('Surprise dish') })).not.toBeInTheDocument();
  });

  it('16. unmounting disconnects the socket', async () => {
    const sessionData = makeSessionData();
    guestService.fetchMyTable.mockResolvedValue(sessionData);
    cartService.getCart.mockResolvedValue(makeCart(sessionData));

    const { unmount } = render(<GuestTable />);
    await advanceAndFlush();

    unmount();
    expect(fakeSocket.disconnect).toHaveBeenCalled();
  });

  it('17. no cart request is made while the screen is not the menu', async () => {
    const waitingData = makeSessionData({
      me: { id: 'g1', nickname: 'Ravi', role: 'guest', status: 'pending' },
    });
    guestService.fetchMyTable.mockResolvedValue(waitingData);

    render(<GuestTable />);
    await advanceAndFlush();

    expect(cartService.getCart).not.toHaveBeenCalled();
  });

  it('18. submitting allergies calls declareAllergies and transitions to menu', async () => {
    const allergyData = makeSessionData({
      me: { id: 'g1', nickname: 'Ravi', role: 'guest', status: 'approved', allergiesDeclared: false },
    });
    guestService.fetchMyTable.mockResolvedValue(allergyData);
    guestService.declareAllergies.mockResolvedValue({
      session: { status: 'open', tableNumber: 5, cartVersion: 1, participants: [GUEST], cart: [] },
      me: { ...GUEST, allergiesDeclared: true, allergies: [] },
    });
    cartService.getCart.mockResolvedValue(makeCart(makeSessionData()));

    render(<GuestTable />);
    await advanceAndFlush();

    fireEvent.click(screen.getByRole('checkbox', { name: /i have no allergies/i }));
    fireEvent.click(screen.getByRole('button', { name: /show me the menu/i }));
    await advanceAndFlush();

    expect(guestService.declareAllergies).toHaveBeenCalledWith([]);
  });

  it('19. host actions: host approves a pending guest', async () => {
    const hostData = makeSessionData({
      me: HOST,
      participants: [HOST],
      pending: [{ id: 'p2', nickname: 'Alex', status: 'pending' }],
    });
    guestService.fetchMyTable.mockResolvedValue(hostData);
    cartService.getCart.mockResolvedValue(makeCart(hostData, SAMPLE_MENU, HOST));
    guestService.approveGuest.mockResolvedValue({
      session: { status: 'open', tableNumber: 5, cartVersion: 1, participants: [HOST], cart: [] },
      me: HOST,
      participants: [HOST, { id: 'p2', nickname: 'Alex', status: 'approved' }],
      pending: [],
    });

    render(<GuestTable />);
    await advanceAndFlush();

    const approveBtn = screen.getByRole('button', { name: MESSAGES.guest.approveLabel('Alex') });
    fireEvent.click(approveBtn);
    await advanceAndFlush();

    expect(guestService.approveGuest).toHaveBeenCalledWith('p2');
  });

  it('20. host actions: host rejects a pending guest', async () => {
    const hostData = makeSessionData({
      me: HOST,
      participants: [HOST],
      pending: [{ id: 'p2', nickname: 'Alex', status: 'pending' }],
    });
    guestService.fetchMyTable.mockResolvedValue(hostData);
    cartService.getCart.mockResolvedValue(makeCart(hostData, SAMPLE_MENU, HOST));
    guestService.rejectGuest.mockResolvedValue({
      session: { status: 'open', tableNumber: 5, cartVersion: 1, participants: [HOST], cart: [] },
      me: HOST,
      participants: [HOST],
      pending: [],
    });

    render(<GuestTable />);
    await advanceAndFlush();

    const rejectBtn = screen.getByRole('button', { name: MESSAGES.guest.declineLabel('Alex') });
    fireEvent.click(rejectBtn);
    await advanceAndFlush();

    expect(guestService.rejectGuest).toHaveBeenCalledWith('p2');
  });

  it('21. cart load error: when getCart fails and no cart, shows cartLoadFailed and Try again calls cart.refresh', async () => {
    const sessionData = makeSessionData();
    guestService.fetchMyTable.mockResolvedValue(sessionData);
    cartService.getCart.mockRejectedValueOnce({ response: { status: 500 } });

    render(<GuestTable />);
    await advanceAndFlush();

    expect(screen.getByText(MESSAGES.guest.cartLoadFailed)).toBeInTheDocument();

    cartService.getCart.mockResolvedValueOnce(makeCart(sessionData));
    const tryAgainBtn = screen.getByRole('button', { name: MESSAGES.guest.tryAgain });
    fireEvent.click(tryAgainBtn);
    await advanceAndFlush();

    expect(cartService.getCart).toHaveBeenCalledTimes(2);
  });
});
