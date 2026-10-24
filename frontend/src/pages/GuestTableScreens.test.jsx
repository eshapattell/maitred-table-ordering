import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import GuestTable from './GuestTable.jsx';
import { MESSAGES } from '../utils/messages.js';
import { endedMessage, ENDED_CODES } from '../utils/guestSession.js';
import { ALLERGY_MESSAGES } from '../utils/guestAllergies.js';

const { initialHookState, refreshMock } = vi.hoisted(() => ({
  initialHookState: {
    status: 'ready',
    data: null,
    offline: false,
    endedCode: null,
  },
  refreshMock: vi.fn(),
}));

vi.mock('../hooks/useGuestTable.js', async () => {
  const React = await import('react');
  return {
    useGuestTable: () => {
      const [data, setData] = React.useState(initialHookState.data);
      return {
        status: initialHookState.status,
        data,
        offline: initialHookState.offline,
        endedCode: initialHookState.endedCode,
        refresh: refreshMock,
        applyData: (d) => setData(d),
      };
    },
    default: () => {
      const React = require('react');
      const [data, setData] = React.useState(initialHookState.data);
      return {
        status: initialHookState.status,
        data,
        offline: initialHookState.offline,
        endedCode: initialHookState.endedCode,
        refresh: refreshMock,
        applyData: (d) => setData(d),
      };
    },
  };
});

vi.mock('../services/guestService.js', () => ({
  declareAllergies: vi.fn(),
  approveGuest: vi.fn(),
  rejectGuest: vi.fn(),
  fetchGuestMenu: vi.fn().mockResolvedValue([]),
  fetchMyTable: vi.fn(),
  saveGuestToken: vi.fn(),
  readGuestToken: vi.fn(),
  clearGuestToken: vi.fn(),
}));

vi.mock('../services/guestOrderService.js', () => ({
  fetchPlacedItems: vi.fn().mockResolvedValue([]),
  placeOrder: vi.fn(),
  cancelPlacedItem: vi.fn(),
  fetchTableOrders: vi.fn().mockResolvedValue({ orders: [], totals: { dishes: 0, items: 0 } }),
}));

vi.mock('../hooks/useCart.js', () => ({
  useCart: () => ({
    cart: null,
    status: 'idle',
    busy: false,
    error: null,
    refresh: () => {},
    add: () => {},
    decrease: () => {},
    remove: () => {},
    getVersion: () => undefined,
  }),
  default: () => ({
    cart: null,
    status: 'idle',
    busy: false,
    error: null,
    refresh: () => {},
    add: () => {},
    decrease: () => {},
    remove: () => {},
    getVersion: () => undefined,
  }),
}));

vi.mock('../hooks/useLiveConnection.js', () => ({
  useLiveConnection: () => ({ liveState: 'connecting' }),
  default: () => ({ liveState: 'connecting' }),
}));

import * as guestService from '../services/guestService.js';

describe('GuestTable page', () => {
  const sampleMenu = [
    {
      id: 'dish-1',
      name: 'Garden Salad',
      price: 850,
      course: 'starter',
      category: 'veg',
      isVeg: true,
      allergens: [],
      safe: true,
    },
    {
      id: 'dish-2',
      name: 'Satay Skewers',
      price: 1200,
      course: 'main',
      category: 'non-veg',
      isVeg: false,
      allergens: ['peanut'],
      safe: false,
      causes: ['peanut'],
      reason: 'allergen',
      clashes: ['peanut'],
    },
  ];

  const baseDinerData = {
    session: { status: 'open', tableNumber: 5 },
    me: {
      id: 'me-1',
      nickname: 'Sam',
      role: 'guest',
      status: 'approved',
      allergiesDeclared: false,
      allergies: [],
    },
    participants: [
      { id: 'me-1', nickname: 'Sam', status: 'approved', role: 'guest' },
    ],
    pending: [],
  };

  beforeEach(() => {
    vi.clearAllMocks();
    refreshMock.mockReset();
    initialHookState.status = 'ready';
    initialHookState.data = JSON.parse(JSON.stringify(baseDinerData));
    initialHookState.offline = false;
    initialHookState.endedCode = null;
    guestService.fetchGuestMenu.mockResolvedValue(sampleMenu);
  });

  // 1. Ticking Peanut and pressing "Show me the menu" calls declareAllergies exactly once with exactly ["peanut"].
  it('1. Ticking Peanut and pressing "Show me the menu" calls declareAllergies exactly once with exactly ["peanut"]', async () => {
    guestService.declareAllergies.mockResolvedValueOnce({
      session: { status: 'open', tableNumber: 5 },
      me: {
        ...baseDinerData.me,
        allergiesDeclared: true,
        allergies: ['peanut'],
      },
    });

    render(<GuestTable />);
    const peanutCb = screen.getByRole('checkbox', { name: /peanut/i });
    fireEvent.click(peanutCb);
    const submitBtn = screen.getByRole('button', {
      name: /show me the menu/i,
    });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(guestService.declareAllergies).toHaveBeenCalledTimes(1);
    });
    expect(guestService.declareAllergies).toHaveBeenCalledWith(['peanut']);
    await waitFor(() => {
      expect(refreshMock).toHaveBeenCalled();
    });
  });

  // 2. "I have no allergies" then the button calls declareAllergies with [].
  it('2. "I have no allergies" then the button calls declareAllergies with []', async () => {
    guestService.declareAllergies.mockResolvedValueOnce({
      session: { status: 'open', tableNumber: 5 },
      me: { ...baseDinerData.me, allergiesDeclared: true, allergies: [] },
    });

    render(<GuestTable />);
    const noneCb = screen.getByRole('checkbox', {
      name: /i have no allergies/i,
    });
    fireEvent.click(noneCb);
    const submitBtn = screen.getByRole('button', {
      name: /show me the menu/i,
    });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(guestService.declareAllergies).toHaveBeenCalledTimes(1);
    });
    expect(guestService.declareAllergies).toHaveBeenCalledWith([]);
    await waitFor(() => {
      expect(refreshMock).toHaveBeenCalled();
    });
  });

  // 3. A blank submit shows the "Tick your allergies, or tell us you have none" message and calls nothing.
  it('3. A blank submit shows the "Tick your allergies, or tell us you have none" message and calls nothing', () => {
    render(<GuestTable />);
    const submitBtn = screen.getByRole('button', {
      name: /show me the menu/i,
    });
    fireEvent.click(submitBtn);

    expect(
      screen.getByText(ALLERGY_MESSAGES.unanswered)
    ).toBeInTheDocument();
    expect(guestService.declareAllergies).not.toHaveBeenCalled();
  });

  // 4. After a successful save the menu screen appears (fetchGuestMenu is called and the "You can have" summary is visible) and the allergy form is gone.
  it('4. After a successful save the menu screen appears and the allergy form is gone', async () => {
    guestService.declareAllergies.mockResolvedValueOnce({
      session: { status: 'open', tableNumber: 5 },
      me: {
        ...baseDinerData.me,
        allergiesDeclared: true,
        allergies: ['peanut'],
      },
    });

    render(<GuestTable />);
    fireEvent.click(screen.getByRole('checkbox', { name: /peanut/i }));
    fireEvent.click(
      screen.getByRole('button', { name: /show me the menu/i })
    );

    await waitFor(() => {
      expect(guestService.fetchGuestMenu).toHaveBeenCalled();
    });
    expect(
      await screen.findByText(MESSAGES.guest.summary(1, 2))
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /show me the menu/i })
    ).not.toBeInTheDocument();
  });

  // 5. A 403 APPROVAL_PENDING calls refresh and shows no error.
  it('5. A 403 APPROVAL_PENDING calls refresh and shows no error', async () => {
    guestService.declareAllergies.mockRejectedValueOnce({
      response: {
        status: 403,
        data: {
          code: 'APPROVAL_PENDING',
          message: 'SERVER TEXT: approval pending',
        },
      },
    });

    render(<GuestTable />);
    fireEvent.click(screen.getByRole('checkbox', { name: /peanut/i }));
    fireEvent.click(
      screen.getByRole('button', { name: /show me the menu/i })
    );

    await waitFor(() => {
      expect(refreshMock).toHaveBeenCalledTimes(1);
    });
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.queryByText(/server text/i)).not.toBeInTheDocument();
  });

  // 6. Any other failure shows allergySaveFailed, keeps the form with Peanut still ticked, and never shows the server's text.
  it('6. Any other failure shows allergySaveFailed, keeps the form with Peanut still ticked, and never shows the server text', async () => {
    guestService.declareAllergies.mockRejectedValueOnce({
      response: {
        status: 500,
        data: { message: 'SERVER TEXT: database down' },
      },
    });

    render(<GuestTable />);
    const peanutCb = screen.getByRole('checkbox', { name: /peanut/i });
    fireEvent.click(peanutCb);
    fireEvent.click(
      screen.getByRole('button', { name: /show me the menu/i })
    );

    expect(
      await screen.findByText(MESSAGES.guest.allergySaveFailed)
    ).toBeInTheDocument();
    expect(peanutCb).toBeChecked();
    expect(screen.queryByText(/server text/i)).not.toBeInTheDocument();
  });

  // 7. Pressing the button twice quickly sends one request.
  it('7. Pressing the button twice quickly sends one request', async () => {
    let resolveFn;
    guestService.declareAllergies.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveFn = resolve;
        })
    );

    render(<GuestTable />);
    fireEvent.click(screen.getByRole('checkbox', { name: /peanut/i }));
    const submitBtn = screen.getByRole('button', {
      name: /show me the menu/i,
    });
    fireEvent.click(submitBtn);
    fireEvent.click(submitBtn);

    expect(guestService.declareAllergies).toHaveBeenCalledTimes(1);

    resolveFn({
      session: { status: 'open', tableNumber: 5 },
      me: {
        ...baseDinerData.me,
        allergiesDeclared: true,
        allergies: ['peanut'],
      },
    });
    await waitFor(() => {
      expect(refreshMock).toHaveBeenCalled();
    });
  });

  // 8. The heading reads "Table 5" from data.session.tableNumber, and "Your table" when it is null.
  it('8. The heading reads "Table 5" from data.session.tableNumber, and "Your table" when it is null', () => {
    const { unmount } = render(<GuestTable />);
    expect(
      screen.getByRole('heading', { level: 1, name: 'Table 5' })
    ).toBeInTheDocument();
    unmount();

    initialHookState.data.session.tableNumber = null;
    render(<GuestTable />);
    expect(
      screen.getByRole('heading', { level: 1, name: MESSAGES.guest.yourTable })
    ).toBeInTheDocument();
  });

  // 9. The line reads "1 person at this table" and "3 people at this table".
  it('9. The line reads "1 person at this table" and "3 people at this table"', () => {
    const { unmount } = render(<GuestTable />);
    expect(screen.getByText('1 person at this table')).toBeInTheDocument();
    unmount();

    initialHookState.data.participants = [
      { id: 'me-1', nickname: 'Sam', status: 'approved' },
      { id: 'p-2', nickname: 'Alex', status: 'approved' },
      { id: 'p-3', nickname: 'Jordan', status: 'approved' },
    ];
    render(<GuestTable />);
    expect(screen.getByText('3 people at this table')).toBeInTheDocument();
  });

  // 10. A guest who is not the host never sees the word "waiting" in the header or any "Join requests" section.
  it('10. A guest who is not the host never sees the word "waiting" in the header or any "Join requests" section', () => {
    initialHookState.data.me.role = 'guest';
    initialHookState.data.pending = [
      { id: 'pend-1', nickname: 'PendingGuest', status: 'pending' },
    ];

    render(<GuestTable />);
    const header = document.querySelector('.guest-table-header');
    expect(header).toBeInTheDocument();
    expect(header.textContent).not.toMatch(/waiting/i);
    expect(screen.queryByText(/join requests/i)).not.toBeInTheDocument();
  });

  // 11. The host sees "Join requests" with the waiting guests; Approve calls approveGuest with the id and then applyData with the returned answer (not refresh).
  it('11. The host sees "Join requests" with the waiting guests; Approve calls approveGuest with id and applies data without refresh', async () => {
    initialHookState.data.me = {
      id: 'host-1',
      nickname: 'HostUser',
      role: 'host',
      status: 'approved',
      allergiesDeclared: true,
      allergies: [],
    };
    initialHookState.data.pending = [
      { id: 'req-1', nickname: 'Bob', status: 'pending' },
    ];

    const updatedSession = {
      session: { status: 'open', tableNumber: 5 },
      me: initialHookState.data.me,
      participants: [
        { id: 'host-1', nickname: 'HostUser', status: 'approved', role: 'host' },
        { id: 'req-1', nickname: 'Bob', status: 'approved' },
      ],
      pending: [],
    };

    guestService.approveGuest.mockResolvedValueOnce(updatedSession);

    render(<GuestTable />);
    expect(screen.getByText('Join requests')).toBeInTheDocument();
    expect(screen.getByText('Bob')).toBeInTheDocument();

    const approveBtn = screen.getByRole('button', { name: /approve bob/i });
    fireEvent.click(approveBtn);

    await waitFor(() => {
      expect(guestService.approveGuest).toHaveBeenCalledWith('req-1');
    });
    expect(refreshMock).not.toHaveBeenCalled();
    await waitFor(() => {
      expect(screen.queryByText('Bob')).not.toBeInTheDocument();
    });
    expect(screen.getByText('2 people at this table')).toBeInTheDocument();
  });

  // 12. Approve failing with 404 shows requestChanged and calls refresh; failing with 500 shows actionFailed; the server text never appears.
  it('12. Approve failing with 404 shows requestChanged and calls refresh; failing with 500 shows actionFailed; server text never appears', async () => {
    refreshMock.mockClear();
    initialHookState.data.me = {
      id: 'host-1',
      nickname: 'HostUser',
      role: 'host',
      status: 'approved',
      allergiesDeclared: true,
      allergies: [],
    };
    initialHookState.data.pending = [
      { id: 'req-1', nickname: 'Bob', status: 'pending' },
    ];

    // 404 case
    guestService.approveGuest.mockRejectedValueOnce({
      response: {
        status: 404,
        data: { message: 'SERVER TEXT: already expired' },
      },
    });

    const { unmount } = render(<GuestTable />);
    fireEvent.click(screen.getByRole('button', { name: /approve bob/i }));

    expect(
      await screen.findByText(MESSAGES.guest.requestChanged)
    ).toBeInTheDocument();
    expect(refreshMock).toHaveBeenCalledTimes(1);
    expect(screen.queryByText(/server text/i)).not.toBeInTheDocument();
    unmount();

    // 500 case
    refreshMock.mockClear();
    guestService.approveGuest.mockRejectedValueOnce({
      response: {
        status: 500,
        data: { message: 'SERVER TEXT: server failure' },
      },
    });

    render(<GuestTable />);
    fireEvent.click(screen.getByRole('button', { name: /approve bob/i }));

    expect(
      await screen.findByText(MESSAGES.guest.actionFailed)
    ).toBeInTheDocument();
    expect(refreshMock).not.toHaveBeenCalled();
    expect(screen.queryByText(/server text/i)).not.toBeInTheDocument();
  });

  // 13. "Change my allergies" shows the form WITH a "Back to the menu" button; that button returns to the menu without calling declareAllergies; saving again returns to the menu.
  it('13. "Change my allergies" shows form with "Back to the menu" button which returns without calling declareAllergies; saving again returns to menu', async () => {
    initialHookState.data.me.allergiesDeclared = true;
    initialHookState.data.me.allergies = ['peanut'];

    render(<GuestTable />);
    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: MESSAGES.guest.changeAllergies })
      ).toBeInTheDocument();
    });

    fireEvent.click(
      screen.getByRole('button', { name: MESSAGES.guest.changeAllergies })
    );

    const backBtn = screen.getByRole('button', {
      name: MESSAGES.guest.backToMenu,
    });
    expect(backBtn).toBeInTheDocument();

    fireEvent.click(backBtn);
    expect(guestService.declareAllergies).not.toHaveBeenCalled();
    expect(
      await screen.findByText(MESSAGES.guest.summary(1, 2))
    ).toBeInTheDocument();

    // Change allergies again and submit
    fireEvent.click(
      screen.getByRole('button', { name: MESSAGES.guest.changeAllergies })
    );
    guestService.declareAllergies.mockResolvedValueOnce({
      session: { status: 'open', tableNumber: 5 },
      me: { ...initialHookState.data.me, allergiesDeclared: true },
    });
    fireEvent.click(
      screen.getByRole('checkbox', {
        name: /i have no allergies/i,
      })
    );
    fireEvent.click(
      screen.getByRole('button', { name: /show me the menu/i })
    );

    await waitFor(() => {
      expect(guestService.declareAllergies).toHaveBeenCalled();
    });
    expect(
      await screen.findByText(MESSAGES.guest.summary(1, 2))
    ).toBeInTheDocument();
  });

  // 14. The first-time allergy screen has no "Back to the menu" button.
  it('14. The first-time allergy screen has no "Back to the menu" button', () => {
    initialHookState.data.me.allergiesDeclared = false;
    render(<GuestTable />);

    expect(
      screen.getByRole('button', { name: /show me the menu/i })
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: MESSAGES.guest.backToMenu })
    ).not.toBeInTheDocument();
  });

  // 15. The error status shows loadFailed and Try again calls refresh.
  it('15. The error status shows loadFailed and Try again calls refresh', () => {
    initialHookState.status = 'error';
    initialHookState.data = null;

    render(<GuestTable />);
    expect(screen.getByText(MESSAGES.guest.loadFailed)).toBeInTheDocument();

    const tryAgainBtn = screen.getByRole('button', {
      name: MESSAGES.common.tryAgain,
    });
    fireEvent.click(tryAgainBtn);
    expect(refreshMock).toHaveBeenCalledTimes(1);
  });

  // 16. The ended status shows the h1 "Your table session" and the right message for each of the three codes.
  it('16. The ended status shows the h1 "Your table session" and the right message for each of the three codes', () => {
    for (const code of ENDED_CODES) {
      initialHookState.status = 'ended';
      initialHookState.endedCode = code;

      const { unmount } = render(<GuestTable />);
      expect(
        screen.getByRole('heading', {
          level: 1,
          name: MESSAGES.guest.endedTitle,
        })
      ).toBeInTheDocument();
      expect(screen.getByText(endedMessage(code))).toBeInTheDocument();
      unmount();
    }
  });

  // 17. A ready session whose screen is "unknown" or "ended" shows the unknownScreen text and no menu request; the waiting screen shows its three texts and makes no menu request; noToken shows the noToken text.
  it('17. A ready session whose screen is "unknown" or "ended" shows unknownScreen text and no menu request; waiting shows its three texts; noToken shows noToken text', () => {
    // 17a: screen "unknown"
    guestService.fetchGuestMenu.mockClear();
    initialHookState.status = 'ready';
    initialHookState.data = {
      session: { status: 'open', tableNumber: 5 },
      me: { id: 'p1', nickname: 'Sam', status: 'unknown_status' },
    };
    const { unmount: unmount1 } = render(<GuestTable />);
    expect(screen.getByText(MESSAGES.guest.unknownScreen)).toBeInTheDocument();
    expect(guestService.fetchGuestMenu).not.toHaveBeenCalled();
    unmount1();

    // 17b: screen "ended"
    guestService.fetchGuestMenu.mockClear();
    initialHookState.status = 'ready';
    initialHookState.data = {
      session: { status: 'closed', tableNumber: 5 },
      me: { id: 'p1', nickname: 'Sam', status: 'approved', allergiesDeclared: true },
    };
    const { unmount: unmount2 } = render(<GuestTable />);
    expect(screen.getByText(MESSAGES.guest.unknownScreen)).toBeInTheDocument();
    expect(guestService.fetchGuestMenu).not.toHaveBeenCalled();
    unmount2();

    // 17c: waiting screen
    guestService.fetchGuestMenu.mockClear();
    initialHookState.status = 'ready';
    initialHookState.data = {
      session: { status: 'open', tableNumber: 5 },
      me: { id: 'p1', nickname: 'Sam', status: 'pending' },
    };
    const { unmount: unmount3 } = render(<GuestTable />);
    expect(screen.getByText(MESSAGES.guest.waitingTitle)).toBeInTheDocument();
    expect(screen.getByText(MESSAGES.guest.waitingBody)).toBeInTheDocument();
    expect(screen.getByText(MESSAGES.guest.waitingNote)).toBeInTheDocument();
    expect(guestService.fetchGuestMenu).not.toHaveBeenCalled();
    unmount3();

    // 17d: noToken
    initialHookState.status = 'noToken';
    initialHookState.data = null;
    render(<GuestTable />);
    expect(screen.getByText(MESSAGES.guest.noToken)).toBeInTheDocument();
  });

  // 18. Waiting screen shows no people line, while allergy and menu screens still do
  it('18. waiting screen shows no people line, while allergy and menu screens still do', async () => {
    // waiting screen
    initialHookState.status = 'ready';
    initialHookState.data = {
      session: { status: 'open', tableNumber: 5 },
      me: { id: 'p1', nickname: 'Sam', status: 'pending' },
      participants: [{ id: 'p1', nickname: 'Sam', status: 'pending' }],
    };
    const { unmount: u1 } = render(<GuestTable />);
    expect(
      screen.queryByText(/person at this table|people at this table/)
    ).not.toBeInTheDocument();
    u1();

    // allergy screen
    initialHookState.data = {
      session: { status: 'open', tableNumber: 5 },
      me: { id: 'p1', nickname: 'Sam', status: 'approved', allergiesDeclared: false },
      participants: [{ id: 'p1', nickname: 'Sam', status: 'approved' }],
    };
    const { unmount: u2 } = render(<GuestTable />);
    expect(screen.getByText('1 person at this table')).toBeInTheDocument();
    u2();

    // menu screen
    initialHookState.data = {
      session: { status: 'open', tableNumber: 5 },
      me: { id: 'p1', nickname: 'Sam', status: 'approved', allergiesDeclared: true },
      participants: [{ id: 'p1', nickname: 'Sam', status: 'approved' }],
    };
    render(<GuestTable />);
    expect(await screen.findByText('1 person at this table')).toBeInTheDocument();
    await waitFor(() => {
      expect(guestService.fetchGuestMenu).toHaveBeenCalled();
    });
  });

  // Additional sanity tests for offline banner
  it('renders offline banner when offline is true', () => {
    initialHookState.offline = true;
    render(<GuestTable />);
    expect(screen.getByText(MESSAGES.guest.offlineBanner)).toBeInTheDocument();
  });

  it('does not render offline banner when offline is false', () => {
    initialHookState.offline = false;
    render(<GuestTable />);
    expect(
      screen.queryByText(MESSAGES.guest.offlineBanner)
    ).not.toBeInTheDocument();
  });
});
