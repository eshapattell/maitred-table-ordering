import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { vi } from 'vitest';
import GuestTable from './GuestTable.jsx';
import * as useGuestTableModule from '../hooks/useGuestTable.js';
import * as guestService from '../services/guestService.js';

vi.mock('../hooks/useGuestTable.js', () => ({
  useGuestTable: vi.fn(),
}));

vi.mock('../services/guestService.js', () => ({
  approveGuest: vi.fn(),
  rejectGuest: vi.fn(),
}));

vi.mock('../Components/Guest/AllergyForm.jsx', () => ({
  default: ({ current, onSaved, onCancel }) => (
    <div data-testid="allergy-form">
      <span>Allergy Form</span>
      <button onClick={() => onSaved && onSaved({ allergies: ['peanut'] })}>
        Save and view menu
      </button>
      {onCancel && <button onClick={onCancel}>Cancel</button>}
    </div>
  ),
}));

vi.mock('../Components/Guest/GuestMenuList.jsx', () => ({
  default: ({ onChangeAllergies, onNeedRefresh }) => (
    <div data-testid="guest-menu-list">
      <span>Guest Menu</span>
      <button onClick={onChangeAllergies}>Change my allergies</button>
      <button onClick={onNeedRefresh}>Refresh</button>
    </div>
  ),
}));

describe('GuestTable', () => {
  const defaultHookData = {
    status: 'ready',
    data: {
      tableNumber: 4,
      session: { status: 'open' },
      me: {
        id: 'me-1',
        nickname: 'Dev',
        role: 'guest',
        status: 'approved',
        allergiesDeclared: true,
        allergies: ['peanut'],
      },
      participants: [
        { id: 'me-1', nickname: 'Dev', status: 'approved' },
      ],
      pending: [],
    },
    offline: false,
    error: null,
    endedCode: null,
    refresh: vi.fn(),
    applyData: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders calm prompt on noToken state', () => {
    useGuestTableModule.useGuestTable.mockReturnValue({
      status: 'noToken',
    });
    render(<GuestTable />);
    expect(screen.getByText(/scan the qr code at your table to join/i)).toBeInTheDocument();
  });

  it('renders loader on loading state', () => {
    useGuestTableModule.useGuestTable.mockReturnValue({
      status: 'loading',
    });
    render(<GuestTable />);
    expect(screen.getByRole('status')).toBeInTheDocument();
  });

  it('renders ErrorMessage and Try again button on error state', () => {
    const refresh = vi.fn();
    useGuestTableModule.useGuestTable.mockReturnValue({
      status: 'error',
      error: 'Failed to connect to table',
      refresh,
    });
    render(<GuestTable />);
    expect(screen.getByText('Failed to connect to table')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /try again/i })).toBeInTheDocument();
  });

  it('calls refresh when Try again button is clicked in error state', () => {
    const refresh = vi.fn();
    useGuestTableModule.useGuestTable.mockReturnValue({
      status: 'error',
      error: 'Failed to connect to table',
      refresh,
    });
    render(<GuestTable />);
    fireEvent.click(screen.getByRole('button', { name: /try again/i }));
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it('renders ended message on ended state with SESSION_CLOSED', () => {
    useGuestTableModule.useGuestTable.mockReturnValue({
      status: 'ended',
      endedCode: 'SESSION_CLOSED',
    });
    render(<GuestTable />);
    expect(
      screen.getByText(/this table session has ended/i)
    ).toBeInTheDocument();
  });

  it('renders ended message on ended state with PARTICIPANT_REMOVED', () => {
    useGuestTableModule.useGuestTable.mockReturnValue({
      status: 'ended',
      endedCode: 'PARTICIPANT_REMOVED',
    });
    render(<GuestTable />);
    expect(
      screen.getByText(/you are no longer part of this table/i)
    ).toBeInTheDocument();
  });

  it('renders table number heading in ready state', () => {
    useGuestTableModule.useGuestTable.mockReturnValue(defaultHookData);
    render(<GuestTable />);
    expect(screen.getByRole('heading', { name: 'Table 4' })).toBeInTheDocument();
  });

  it('renders welcome nickname in ready state', () => {
    useGuestTableModule.useGuestTable.mockReturnValue(defaultHookData);
    render(<GuestTable />);
    expect(screen.getByText('Welcome, Dev')).toBeInTheDocument();
  });

  it('renders diner counts in ready state', () => {
    useGuestTableModule.useGuestTable.mockReturnValue({
      ...defaultHookData,
      data: {
        ...defaultHookData.data,
        participants: [
          { id: '1', status: 'approved' },
          { id: '2', status: 'approved' },
        ],
        pending: [{ id: '3', status: 'pending' }],
      },
    });
    render(<GuestTable />);
    expect(screen.getByText('2 seated · 1 waiting')).toBeInTheDocument();
  });

  it('renders offline banner when offline is true', () => {
    useGuestTableModule.useGuestTable.mockReturnValue({
      ...defaultHookData,
      offline: true,
    });
    render(<GuestTable />);
    expect(screen.getByText(/trying to reconnect/i)).toBeInTheDocument();
  });

  it('does not render offline banner when offline is false', () => {
    useGuestTableModule.useGuestTable.mockReturnValue({
      ...defaultHookData,
      offline: false,
    });
    render(<GuestTable />);
    expect(screen.queryByText(/trying to reconnect/i)).not.toBeInTheDocument();
  });

  it('renders PendingRequests when diner is host', () => {
    useGuestTableModule.useGuestTable.mockReturnValue({
      ...defaultHookData,
      data: {
        ...defaultHookData.data,
        me: { ...defaultHookData.data.me, role: 'host' },
        pending: [{ id: 'p-1', nickname: 'Asha' }],
      },
    });
    render(<GuestTable />);
    expect(screen.getByRole('heading', { name: /join requests/i })).toBeInTheDocument();
    expect(screen.getByText('Asha')).toBeInTheDocument();
  });

  it('does not render PendingRequests when diner is not host', () => {
    useGuestTableModule.useGuestTable.mockReturnValue({
      ...defaultHookData,
      data: {
        ...defaultHookData.data,
        me: { ...defaultHookData.data.me, role: 'guest' },
        pending: [{ id: 'p-1', nickname: 'Asha' }],
      },
    });
    render(<GuestTable />);
    expect(screen.queryByRole('heading', { name: /join requests/i })).not.toBeInTheDocument();
  });

  it('calls approveGuest and refresh when host approves a guest', async () => {
    const refresh = vi.fn().mockResolvedValue();
    guestService.approveGuest.mockResolvedValue();

    useGuestTableModule.useGuestTable.mockReturnValue({
      ...defaultHookData,
      data: {
        ...defaultHookData.data,
        me: { ...defaultHookData.data.me, role: 'host' },
        pending: [{ id: 'p-1', nickname: 'Asha' }],
      },
      refresh,
    });
    render(<GuestTable />);

    fireEvent.click(screen.getByRole('button', { name: 'Approve Asha' }));
    await waitFor(() => {
      expect(guestService.approveGuest).toHaveBeenCalledWith('p-1');
      expect(refresh).toHaveBeenCalledTimes(1);
    });
  });

  it('surfaces host approve error calmly', async () => {
    guestService.approveGuest.mockRejectedValue({
      response: { data: { message: 'Cannot approve at this time' } },
    });

    useGuestTableModule.useGuestTable.mockReturnValue({
      ...defaultHookData,
      data: {
        ...defaultHookData.data,
        me: { ...defaultHookData.data.me, role: 'host' },
        pending: [{ id: 'p-1', nickname: 'Asha' }],
      },
    });
    render(<GuestTable />);

    fireEvent.click(screen.getByRole('button', { name: 'Approve Asha' }));
    expect(await screen.findByText('Cannot approve at this time')).toBeInTheDocument();
  });

  it('calls rejectGuest and refresh when host declines a guest', async () => {
    const refresh = vi.fn().mockResolvedValue();
    guestService.rejectGuest.mockResolvedValue();

    useGuestTableModule.useGuestTable.mockReturnValue({
      ...defaultHookData,
      data: {
        ...defaultHookData.data,
        me: { ...defaultHookData.data.me, role: 'host' },
        pending: [{ id: 'p-1', nickname: 'Asha' }],
      },
      refresh,
    });
    render(<GuestTable />);

    fireEvent.click(screen.getByRole('button', { name: 'Decline Asha' }));
    await waitFor(() => {
      expect(guestService.rejectGuest).toHaveBeenCalledWith('p-1');
      expect(refresh).toHaveBeenCalledTimes(1);
    });
  });

  it('surfaces host reject error calmly', async () => {
    guestService.rejectGuest.mockRejectedValue({
      response: { data: { message: 'Cannot decline at this time' } },
    });

    useGuestTableModule.useGuestTable.mockReturnValue({
      ...defaultHookData,
      data: {
        ...defaultHookData.data,
        me: { ...defaultHookData.data.me, role: 'host' },
        pending: [{ id: 'p-1', nickname: 'Asha' }],
      },
    });
    render(<GuestTable />);

    fireEvent.click(screen.getByRole('button', { name: 'Decline Asha' }));
    expect(await screen.findByText('Cannot decline at this time')).toBeInTheDocument();
  });

  it('renders waiting screen when guest is pending', () => {
    useGuestTableModule.useGuestTable.mockReturnValue({
      ...defaultHookData,
      data: {
        ...defaultHookData.data,
        me: { ...defaultHookData.data.me, status: 'pending' },
      },
    });
    render(<GuestTable />);
    expect(screen.getByRole('heading', { name: /waiting for your host/i })).toBeInTheDocument();
    expect(
      screen.getByText(/your request has been sent\. you will be seated once the host approves\./i)
    ).toBeInTheDocument();
  });

  it('renders allergies screen when guest is approved but unanswered', () => {
    useGuestTableModule.useGuestTable.mockReturnValue({
      ...defaultHookData,
      data: {
        ...defaultHookData.data,
        me: {
          ...defaultHookData.data.me,
          status: 'approved',
          allergiesDeclared: false,
          allergies: null,
        },
      },
    });
    render(<GuestTable />);
    expect(screen.getByTestId('allergy-form')).toBeInTheDocument();
    expect(screen.queryByTestId('guest-menu-list')).not.toBeInTheDocument();
  });

  it('cannot cancel AllergyForm when allergies not yet answered', () => {
    useGuestTableModule.useGuestTable.mockReturnValue({
      ...defaultHookData,
      data: {
        ...defaultHookData.data,
        me: {
          ...defaultHookData.data.me,
          status: 'approved',
          allergiesDeclared: false,
          allergies: null,
        },
      },
    });
    render(<GuestTable />);
    expect(screen.queryByRole('button', { name: /cancel/i })).not.toBeInTheDocument();
  });

  it('renders menu screen when guest is approved and allergies answered', () => {
    useGuestTableModule.useGuestTable.mockReturnValue(defaultHookData);
    render(<GuestTable />);
    expect(screen.getByTestId('guest-menu-list')).toBeInTheDocument();
  });

  it('switches to AllergyForm when Change my allergies is clicked on menu', () => {
    useGuestTableModule.useGuestTable.mockReturnValue(defaultHookData);
    render(<GuestTable />);

    expect(screen.getByTestId('guest-menu-list')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /change my allergies/i }));

    expect(screen.getByTestId('allergy-form')).toBeInTheDocument();
    expect(screen.queryByTestId('guest-menu-list')).not.toBeInTheDocument();
  });

  it('returns to menu when AllergyForm is saved', () => {
    const applyData = vi.fn();
    useGuestTableModule.useGuestTable.mockReturnValue({
      ...defaultHookData,
      applyData,
    });
    render(<GuestTable />);

    // Switch to allergies
    fireEvent.click(screen.getByRole('button', { name: /change my allergies/i }));
    expect(screen.getByTestId('allergy-form')).toBeInTheDocument();

    // Save allergies
    fireEvent.click(screen.getByRole('button', { name: /save and view menu/i }));
    expect(screen.getByTestId('guest-menu-list')).toBeInTheDocument();
    expect(applyData).toHaveBeenCalledTimes(1);
  });

  it('returns to menu when canceling AllergyForm for previously answered guest', () => {
    useGuestTableModule.useGuestTable.mockReturnValue(defaultHookData);
    render(<GuestTable />);

    // Switch to allergies
    fireEvent.click(screen.getByRole('button', { name: /change my allergies/i }));
    expect(screen.getByTestId('allergy-form')).toBeInTheDocument();

    // Cancel
    fireEvent.click(screen.getByRole('button', { name: /cancel/i }));
    expect(screen.getByTestId('guest-menu-list')).toBeInTheDocument();
  });

  it('renders calm error for unknown screenFor state', () => {
    useGuestTableModule.useGuestTable.mockReturnValue({
      ...defaultHookData,
      data: {
        ...defaultHookData.data,
        me: { ...defaultHookData.data.me, status: 'unknown_status' },
      },
    });
    render(<GuestTable />);
    expect(
      screen.getByText(/we could not open this screen\. please ask a member of staff\./i)
    ).toBeInTheDocument();
  });
});
