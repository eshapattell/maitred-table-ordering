import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import GuestMenuList from './GuestMenuList.jsx';
import * as guestService from '../../services/guestService.js';
import { MESSAGES } from '../../utils/messages.js';
import { buildCartView } from '../../../../backend/utils/cartView.js';

vi.mock('../../services/guestService.js', () => ({
  fetchGuestMenu: vi.fn(),
}));

const makeDish = (overrides = {}) => ({
  id: 'dish-default',
  name: 'Default Dish',
  description: 'A delicious dish',
  price: 250,
  category: 'Mains',
  isVeg: true,
  allergens: [],
  allergensConfirmed: true,
  spiceLevel: 'mild',
  flavourTags: ['savoury'],
  cuisine: 'Indian',
  course: 'main',
  portionSize: '1 serving',
  prepMinutes: 15,
  safe: true,
  clashes: [],
  reason: null,
  ...overrides,
});

describe('GuestMenuList', () => {
  const sampleDishes = [
    makeDish({
      id: 'dish-1',
      name: 'Paneer Tikka',
      price: 320,
      course: 'starter',
      cuisine: 'North Indian',
      isVeg: true,
      description: 'Charred spiced cottage cheese',
      category: 'Starters',
      safe: true,
    }),
    makeDish({
      id: 'dish-2',
      name: 'Prawn Balchao',
      price: 550,
      course: 'main',
      cuisine: 'Goan',
      isVeg: false,
      description: 'Fiery prawn curry',
      category: 'Mains',
      safe: false,
      reason: 'allergen',
      clashes: ['shellfish'],
    }),
    makeDish({
      id: 'dish-3',
      name: 'Gulab Jamun',
      price: 180,
      course: 'dessert',
      cuisine: 'Indian',
      isVeg: true,
      description: 'Sweet milk solids in syrup',
      category: 'Desserts',
      safe: false,
      reason: 'unconfirmed',
    }),
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

    expect(await screen.findByText(MESSAGES.guest.loadMenuFailed)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: MESSAGES.guest.tryAgain })).toBeInTheDocument();
  });

  it('retries fetch when Try again button is clicked', async () => {
    guestService.fetchGuestMenu
      .mockRejectedValueOnce(new Error('Network failure'))
      .mockResolvedValueOnce(sampleDishes);

    render(<GuestMenuList />);
    const retryBtn = await screen.findByRole('button', { name: MESSAGES.guest.tryAgain });
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

    const checkbox = screen.getByLabelText(MESSAGES.guest.hideUnsafeLabel);
    fireEvent.click(checkbox);

    expect(screen.getByText('Paneer Tikka')).toBeInTheDocument();
    expect(screen.queryByText('Prawn Balchao')).not.toBeInTheDocument();
    expect(screen.queryByText('Gulab Jamun')).not.toBeInTheDocument();
  });

  it('calls onChangeAllergies when "Change my allergies" button is clicked', async () => {
    const onChangeAllergies = vi.fn();
    guestService.fetchGuestMenu.mockResolvedValue(sampleDishes);
    render(<GuestMenuList onChangeAllergies={onChangeAllergies} />);

    const changeBtn = await screen.findByRole('button', { name: MESSAGES.guest.changeAllergies });
    fireEvent.click(changeBtn);

    expect(onChangeAllergies).toHaveBeenCalledTimes(1);
  });

  it('calls fetch on "Refresh menu" click', async () => {
    guestService.fetchGuestMenu.mockResolvedValue(sampleDishes);
    render(<GuestMenuList />);

    const refreshBtn = await screen.findByRole('button', { name: MESSAGES.guest.refreshMenu });
    fireEvent.click(refreshBtn);

    await waitFor(() => {
      expect(guestService.fetchGuestMenu).toHaveBeenCalledTimes(2);
    });
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

    expect(await screen.findByText(MESSAGES.guest.emptyMenu)).toBeInTheDocument();
  });

  it('renders mandatory advisory note at the bottom', async () => {
    guestService.fetchGuestMenu.mockResolvedValue(sampleDishes);
    render(<GuestMenuList />);

    expect(
      await screen.findByText(MESSAGES.guest.advisoryNote)
    ).toBeInTheDocument();
  });

  // Task 10a-fix2 additions:
  // a dish with isVeg true shows "Vegetarian" and not "Non-vegetarian"
  it('a dish with isVeg true shows "Vegetarian" and not "Non-vegetarian"', async () => {
    guestService.fetchGuestMenu.mockResolvedValue([
      makeDish({ id: 'd-veg', name: 'Palak Paneer', isVeg: true, safe: true }),
    ]);
    render(<GuestMenuList />);

    expect(await screen.findByText('Palak Paneer')).toBeInTheDocument();
    expect(screen.getByText('Vegetarian')).toBeInTheDocument();
    expect(screen.queryByText('Non-vegetarian')).not.toBeInTheDocument();
  });

  // isVeg false and a dish with no isVeg show "Non-vegetarian"
  it('isVeg false and a dish with no isVeg show "Non-vegetarian"', async () => {
    const dishNoVeg = makeDish({ id: 'd-unknown', name: 'Mystery Item', safe: true });
    delete dishNoVeg.isVeg;

    guestService.fetchGuestMenu.mockResolvedValue([
      makeDish({ id: 'd-nonveg', name: 'Butter Chicken', isVeg: false, safe: true }),
      dishNoVeg,
    ]);
    render(<GuestMenuList />);

    expect(await screen.findByText('Butter Chicken')).toBeInTheDocument();
    expect(screen.getByText('Mystery Item')).toBeInTheDocument();
    const nonVegLabels = screen.getAllByText('Non-vegetarian');
    expect(nonVegLabels).toHaveLength(2);
    expect(screen.queryByText('Vegetarian')).not.toBeInTheDocument();
  });

  // rendering five dishes causes no React key warning (spy on console.error and assert it was never called)
  it('rendering five dishes causes no React key warning', async () => {
    const errorSpy = vi.spyOn(console, 'error');
    const fiveDishes = [1, 2, 3, 4, 5].map((n) =>
      makeDish({ id: `dish-${n}`, name: `Dish ${n}`, safe: true })
    );
    guestService.fetchGuestMenu.mockResolvedValue(fiveDishes);

    render(<GuestMenuList />);

    expect(await screen.findByText('Dish 5')).toBeInTheDocument();
    expect(errorSpy).not.toHaveBeenCalled();
    errorSpy.mockRestore();
  });

  // a failed load shows loadMenuFailed and never the server's text (the mocked error carries the words SERVER TEXT)
  it('a failed load shows loadMenuFailed and never the server text', async () => {
    guestService.fetchGuestMenu.mockRejectedValue({
      response: {
        status: 500,
        data: { message: 'SERVER TEXT: database down' },
      },
    });

    render(<GuestMenuList />);

    expect(await screen.findByText(MESSAGES.guest.loadMenuFailed)).toBeInTheDocument();
    expect(screen.queryByText(/server text/i)).not.toBeInTheDocument();
  });

  // a safe dish whose raw allergens hold "sesame" never shows that word anywhere
  it('a safe dish whose raw allergens hold "sesame" never shows that word anywhere', async () => {
    guestService.fetchGuestMenu.mockResolvedValue([
      makeDish({
        id: 'd-tahini',
        name: 'Tahini Noodle Bowl',
        safe: true,
        allergens: ['sesame'],
      }),
    ]);

    render(<GuestMenuList />);

    expect(await screen.findByText('Tahini Noodle Bowl')).toBeInTheDocument();
    expect(screen.queryByRole('note')).not.toBeInTheDocument();
    expect(screen.queryByText(/sesame/i)).not.toBeInTheDocument();
  });

  // Task 10c additions:
  it('shows ghost Add button for safe dishes and NO add button for unsafe dishes', async () => {
    const onAdd = vi.fn();
    guestService.fetchGuestMenu.mockResolvedValue(sampleDishes);

    render(<GuestMenuList onAdd={onAdd} />);

    // Safe dish (Paneer Tikka) has Add button
    const addBtn = await screen.findByRole('button', {
      name: MESSAGES.guest.cartAddAria('Paneer Tikka'),
    });
    expect(addBtn).toBeInTheDocument();
    expect(addBtn).toHaveTextContent(MESSAGES.guest.cartAdd);

    // Unsafe dishes (Prawn Balchao, Gulab Jamun) have NO add button
    expect(
      screen.queryByRole('button', { name: MESSAGES.guest.cartAddAria('Prawn Balchao') })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: MESSAGES.guest.cartAddAria('Gulab Jamun') })
    ).not.toBeInTheDocument();
  });

  it('calls onAdd when Add button is clicked', async () => {
    const onAdd = vi.fn();
    guestService.fetchGuestMenu.mockResolvedValue([sampleDishes[0]]);

    render(<GuestMenuList onAdd={onAdd} />);

    const addBtn = await screen.findByRole('button', {
      name: MESSAGES.guest.cartAddAria('Paneer Tikka'),
    });
    fireEvent.click(addBtn);

    expect(onAdd).toHaveBeenCalledTimes(1);
    expect(onAdd).toHaveBeenCalledWith(sampleDishes[0]);
  });

  it('disables Add button when busy is true', async () => {
    const onAdd = vi.fn();
    guestService.fetchGuestMenu.mockResolvedValue([sampleDishes[0]]);

    render(<GuestMenuList onAdd={onAdd} busy={true} />);

    const addBtn = await screen.findByRole('button', {
      name: MESSAGES.guest.cartAddAria('Paneer Tikka'),
    });
    expect(addBtn).toBeDisabled();
  });

  it('shows cartInYourOrder(n) when myQuantityFor is above 0', async () => {
    guestService.fetchGuestMenu.mockResolvedValue([sampleDishes[0]]);

    // Build real cart using buildCartView
    const viewer = { id: 'p1', role: 'guest', status: 'approved', allergiesDeclared: true, allergies: [] };
    const session = {
      cartVersion: 1,
      participants: [viewer],
      cart: [
        {
          cartItemId: '00000000-0000-4000-8000-000000000001',
          itemId: 'dish-1',
          qty: 3,
          addedBy: 'p1',
          isSurprise: false,
        },
      ],
    };
    const backendItem = { ...sampleDishes[0], _id: sampleDishes[0].id, available: true };
    const cart = buildCartView({ session, items: [backendItem], viewer });

    render(<GuestMenuList cart={cart} viewerId="p1" />);

    expect(await screen.findByText(MESSAGES.guest.cartInYourOrder(3))).toBeInTheDocument();
  });

  it('refetches menu when reloadToken changes', async () => {
    guestService.fetchGuestMenu.mockResolvedValue([sampleDishes[0]]);

    const { rerender } = render(<GuestMenuList reloadToken={1} />);

    await screen.findByText('Paneer Tikka');
    expect(guestService.fetchGuestMenu).toHaveBeenCalledTimes(1);

    // Change reloadToken
    rerender(<GuestMenuList reloadToken={2} />);

    await waitFor(() => {
      expect(guestService.fetchGuestMenu).toHaveBeenCalledTimes(2);
    });
  });
});
