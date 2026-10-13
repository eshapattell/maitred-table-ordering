import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { vi } from 'vitest';
import GuestMenuList from './GuestMenuList.jsx';
import * as guestService from '../../services/guestService.js';

vi.mock('../../services/guestService.js', () => ({
  fetchGuestMenu: vi.fn(),
}));

describe('GuestMenuList', () => {
  const sampleDishes = [
    {
      _id: 'dish-1',
      name: 'Paneer Tikka',
      price: 320,
      course: 'starter',
      cuisine: 'North Indian',
      isVegetarian: true,
      description: 'Charred spiced cottage cheese',
      category: 'Starters',
      safe: true,
    },
    {
      _id: 'dish-2',
      name: 'Prawn Balchao',
      price: 550,
      course: 'main',
      cuisine: 'Goan',
      isVegetarian: false,
      description: 'Fiery prawn curry',
      category: 'Mains',
      safe: false,
      reason: 'allergen',
      clashes: ['shellfish'],
    },
    {
      _id: 'dish-3',
      name: 'Gulab Jamun',
      price: 180,
      course: 'dessert',
      cuisine: 'Indian',
      isVegetarian: true,
      category: 'Desserts',
      safe: false,
      reason: 'unconfirmed',
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders loading state initially', () => {
    guestService.fetchGuestMenu.mockReturnValue(new Promise(() => {}));
    render(<GuestMenuList />);
    expect(screen.getByRole('status')).toBeInTheDocument();
  });

  it('renders ErrorMessage and Try again button on load failure', async () => {
    guestService.fetchGuestMenu.mockRejectedValue(new Error('Network error'));
    render(<GuestMenuList />);

    expect(await screen.findByText(/we could not load the menu/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /try again/i })).toBeInTheDocument();
  });

  it('retries fetch when Try again button is clicked', async () => {
    guestService.fetchGuestMenu
      .mockRejectedValueOnce(new Error('Network failure'))
      .mockResolvedValueOnce(sampleDishes);

    render(<GuestMenuList />);
    const retryBtn = await screen.findByRole('button', { name: /try again/i });
    fireEvent.click(retryBtn);

    expect(await screen.findByText('Paneer Tikka')).toBeInTheDocument();
    expect(guestService.fetchGuestMenu).toHaveBeenCalledTimes(2);
  });

  it('triggers onNeedRefresh on 403 ALLERGIES_REQUIRED and shows nothing else', async () => {
    const onNeedRefresh = vi.fn();
    const error = {
      response: {
        status: 403,
        data: { code: 'ALLERGIES_REQUIRED', message: 'Allergies required' },
      },
    };
    guestService.fetchGuestMenu.mockRejectedValue(error);

    const { container } = render(<GuestMenuList onNeedRefresh={onNeedRefresh} />);

    await waitFor(() => {
      expect(onNeedRefresh).toHaveBeenCalledTimes(1);
    });
    expect(container.firstChild).toBeNull();
  });

  it('triggers onNeedRefresh on 403 APPROVAL_PENDING', async () => {
    const onNeedRefresh = vi.fn();
    const error = {
      response: {
        status: 403,
        data: { code: 'APPROVAL_PENDING', message: 'Pending' },
      },
    };
    guestService.fetchGuestMenu.mockRejectedValue(error);

    render(<GuestMenuList onNeedRefresh={onNeedRefresh} />);

    await waitFor(() => {
      expect(onNeedRefresh).toHaveBeenCalledTimes(1);
    });
  });

  it('displays summary text with correct counts', async () => {
    guestService.fetchGuestMenu.mockResolvedValue(sampleDishes);
    render(<GuestMenuList />);

    expect(await screen.findByText('You can have 1 of 3 dishes.')).toBeInTheDocument();
  });

  it('toggles hideUnsafe checkbox to filter unsafe dishes', async () => {
    guestService.fetchGuestMenu.mockResolvedValue(sampleDishes);
    render(<GuestMenuList />);

    expect(await screen.findByText('Paneer Tikka')).toBeInTheDocument();
    expect(screen.getByText('Prawn Balchao')).toBeInTheDocument();

    const checkbox = screen.getByLabelText(/hide dishes i cannot have/i);
    fireEvent.click(checkbox);

    expect(screen.getByText('Paneer Tikka')).toBeInTheDocument();
    expect(screen.queryByText('Prawn Balchao')).not.toBeInTheDocument();
    expect(screen.queryByText('Gulab Jamun')).not.toBeInTheDocument();
  });

  it('calls onChangeAllergies when "Change my allergies" button is clicked', async () => {
    const onChangeAllergies = vi.fn();
    guestService.fetchGuestMenu.mockResolvedValue(sampleDishes);
    render(<GuestMenuList onChangeAllergies={onChangeAllergies} />);

    const changeBtn = await screen.findByRole('button', { name: /change my allergies/i });
    fireEvent.click(changeBtn);

    expect(onChangeAllergies).toHaveBeenCalledTimes(1);
  });

  it('calls fetch on "Refresh menu" click', async () => {
    guestService.fetchGuestMenu.mockResolvedValue(sampleDishes);
    render(<GuestMenuList />);

    const refreshBtn = await screen.findByRole('button', { name: /refresh menu/i });
    fireEvent.click(refreshBtn);

    expect(guestService.fetchGuestMenu).toHaveBeenCalledTimes(2);
  });

  it('renders categories and dishes', async () => {
    guestService.fetchGuestMenu.mockResolvedValue(sampleDishes);
    render(<GuestMenuList />);

    expect(await screen.findByRole('heading', { name: 'Starters' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Mains' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Desserts' })).toBeInTheDocument();
    expect(screen.getByText('Paneer Tikka')).toBeInTheDocument();
    expect(screen.getByText('Charred spiced cottage cheese')).toBeInTheDocument();
  });

  it('formats price correctly', async () => {
    guestService.fetchGuestMenu.mockResolvedValue(sampleDishes);
    render(<GuestMenuList />);

    expect(await screen.findByText('₹320')).toBeInTheDocument();
    expect(screen.getByText('₹550')).toBeInTheDocument();
  });

  it('renders unsafe badge with warning label on unsafe dish', async () => {
    guestService.fetchGuestMenu.mockResolvedValue(sampleDishes);
    render(<GuestMenuList />);

    expect(await screen.findByText(/contains shellfish/i)).toBeInTheDocument();
    expect(screen.getByText(/allergens not yet confirmed/i)).toBeInTheDocument();
  });

  it('safe dish has no unsafe badge', async () => {
    guestService.fetchGuestMenu.mockResolvedValue([sampleDishes[0]]);
    render(<GuestMenuList />);

    await screen.findByText('Paneer Tikka');
    expect(screen.queryByRole('note')).not.toBeInTheDocument();
  });

  it('renders calm empty state when items is empty', async () => {
    guestService.fetchGuestMenu.mockResolvedValue([]);
    render(<GuestMenuList />);

    expect(await screen.findByText(/the menu is not available right now/i)).toBeInTheDocument();
  });

  it('renders mandatory advisory note at the bottom', async () => {
    guestService.fetchGuestMenu.mockResolvedValue(sampleDishes);
    render(<GuestMenuList />);

    expect(
      await screen.findByText(/dish information is entered by the restaurant/i)
    ).toBeInTheDocument();
  });
});
