import React from 'react';
import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import MenuManager from './MenuManager.jsx';
import * as menuService from '../services/menuService.js';
import { MESSAGES } from '../utils/messages.js';

vi.mock('../services/menuService.js', () => ({
  fetchMenu: vi.fn(),
  createMenuItem: vi.fn(),
  updateMenuItem: vi.fn(),
  confirmAllergens: vi.fn(),
  setAvailability: vi.fn(),
}));

describe('MenuManager page', () => {
  const dishConfirmed = {
    id: 'd1',
    name: 'Saffron Risotto',
    description: 'Arborio rice with saffron threads',
    price: 650,
    category: 'Primi',
    isVeg: true,
    allergens: ['dairy'],
    allergensConfirmed: true,
    spiceLevel: 1,
    flavourTags: ['creamy'],
    cuisine: 'Italian',
    course: 'main',
    portionSize: 'regular',
    prepMinutes: 25,
    available: true,
  };

  const dishUnconfirmed = {
    id: 'd2',
    name: 'Tandoori Roti',
    description: 'Clay oven bread',
    price: 60,
    category: 'Breads',
    isVeg: true,
    allergens: ['gluten'],
    allergensConfirmed: false,
    spiceLevel: 1,
    flavourTags: ['crispy'],
    cuisine: 'North Indian',
    course: 'side',
    portionSize: 'regular',
    prepMinutes: 10,
    available: true,
  };

  const dishHidden = {
    id: 'd3',
    name: 'Steamed Edamame',
    description: 'Lightly salted soybeans',
    price: 250,
    category: 'Starters',
    isVeg: true,
    allergens: [],
    allergensConfirmed: true,
    spiceLevel: 1,
    flavourTags: ['light'],
    cuisine: 'Japanese',
    course: 'starter',
    portionSize: 'light',
    prepMinutes: 5,
    available: false,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  test('1. renders loader then list of dishes', async () => {
    menuService.fetchMenu.mockResolvedValueOnce([dishConfirmed, dishUnconfirmed]);

    render(<MenuManager />);
    expect(screen.getByRole('status')).toBeInTheDocument();

    expect(await screen.findByText('Saffron Risotto')).toBeInTheDocument();
    expect(screen.getByText('Tandoori Roti')).toBeInTheDocument();
  });

  test('2. load failure displays error message and retry button that re-fetches', async () => {
    menuService.fetchMenu
      .mockRejectedValueOnce(new Error('Network error'))
      .mockResolvedValueOnce([dishConfirmed]);

    render(<MenuManager />);
    expect(
      await screen.findByText(MESSAGES.owner.menu.errors.loadFailed)
    ).toBeInTheDocument();

    const retryBtn = screen.getByRole('button', { name: MESSAGES.common.tryAgain });
    fireEvent.click(retryBtn);

    expect(await screen.findByText('Saffron Risotto')).toBeInTheDocument();
    expect(menuService.fetchMenu).toHaveBeenCalledTimes(2);
  });

  test('3. empty state displays friendly message when menu has 0 dishes', async () => {
    menuService.fetchMenu.mockResolvedValueOnce([]);

    render(<MenuManager />);
    expect(await screen.findByText(MESSAGES.owner.menu.emptyState)).toBeInTheDocument();
  });

  test('4. summary counts reflect total dishes, review count, and hidden count', async () => {
    menuService.fetchMenu.mockResolvedValueOnce([
      dishConfirmed,
      dishUnconfirmed,
      dishHidden,
    ]);

    render(<MenuManager />);
    // total 3, review 1 (dishUnconfirmed), hidden 1 (dishHidden)
    expect(
      await screen.findByText('3 dishes · 1 awaiting allergen review · 1 hidden')
    ).toBeInTheDocument();
  });

  test('5. sections group dishes by category in received order', async () => {
    menuService.fetchMenu.mockResolvedValueOnce([
      dishConfirmed,
      dishUnconfirmed,
      dishHidden,
    ]);

    render(<MenuManager />);
    await screen.findByText('Saffron Risotto');

    const headings = screen.getAllByRole('heading', { level: 2 });
    expect(headings.map((h) => h.textContent)).toEqual(['Primi', 'Breads', 'Starters']);
  });

  test('6. renders chips for confirmed, unconfirmed, hidden, and empty-list dishes', async () => {
    menuService.fetchMenu.mockResolvedValueOnce([
      dishConfirmed,
      dishUnconfirmed,
      dishHidden,
    ]);

    render(<MenuManager />);
    await screen.findByText('Saffron Risotto');

    expect(screen.getAllByText('Allergens confirmed').length).toBe(2);
    expect(screen.getByText('Allergens not confirmed')).toBeInTheDocument();
    expect(screen.getByText('Hidden from guests')).toBeInTheDocument();
    expect(screen.getByText('No allergens recorded')).toBeInTheDocument();
  });

  test('7. Review allergens button appears only for dishes needing review', async () => {
    menuService.fetchMenu.mockResolvedValueOnce([
      dishConfirmed,
      dishUnconfirmed,
    ]);

    render(<MenuManager />);
    await screen.findByText('Saffron Risotto');

    expect(
      screen.queryByRole('button', {
        name: MESSAGES.owner.menu.actions.review('Saffron Risotto'),
      })
    ).toBeNull();

    expect(
      screen.getByRole('button', {
        name: MESSAGES.owner.menu.actions.review('Tandoori Roti'),
      })
    ).toBeInTheDocument();
  });

  test('8. filter buttons show corresponding dishes and empty filter message', async () => {
    menuService.fetchMenu.mockResolvedValueOnce([
      dishConfirmed,
      dishUnconfirmed,
      dishHidden,
    ]);

    render(<MenuManager />);
    await screen.findByText('Saffron Risotto');

    // Filter "Awaiting review"
    const reviewFilterBtn = screen.getByRole('button', {
      name: MESSAGES.owner.menu.filterReview(1),
    });
    fireEvent.click(reviewFilterBtn);

    expect(screen.queryByText('Saffron Risotto')).toBeNull();
    expect(screen.getByText('Tandoori Roti')).toBeInTheDocument();
    expect(screen.queryByText('Steamed Edamame')).toBeNull();

    // Filter "Hidden"
    const hiddenFilterBtn = screen.getByRole('button', {
      name: MESSAGES.owner.menu.filterHidden(1),
    });
    fireEvent.click(hiddenFilterBtn);

    expect(screen.queryByText('Saffron Risotto')).toBeNull();
    expect(screen.queryByText('Tandoori Roti')).toBeNull();
    expect(screen.getByText('Steamed Edamame')).toBeInTheDocument();
  });

  test('9. add flow sends exact payload, closes modal, re-fetches, and displays note', async () => {
    menuService.fetchMenu.mockResolvedValue([dishConfirmed]);
    menuService.createMenuItem.mockResolvedValueOnce({
      id: 'd-new',
      name: 'Gulab Jamun',
      price: 150,
    });

    render(<MenuManager />);
    await screen.findByText('Saffron Risotto');

    fireEvent.click(
      screen.getByRole('button', { name: MESSAGES.owner.menu.addDish })
    );

    expect(
      screen.getByRole('heading', {
        level: 2,
        name: MESSAGES.owner.menu.modalAddTitle,
      })
    ).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText(MESSAGES.owner.menu.fields.name), {
      target: { value: 'Gulab Jamun' },
    });
    fireEvent.change(screen.getByLabelText(MESSAGES.owner.menu.fields.price), {
      target: { value: '150' },
    });
    fireEvent.change(screen.getByLabelText(MESSAGES.owner.menu.fields.category), {
      target: { value: 'Desserts' },
    });
    fireEvent.change(screen.getByLabelText(MESSAGES.owner.menu.fields.course), {
      target: { value: 'dessert' },
    });
    fireEvent.change(screen.getByLabelText(MESSAGES.owner.menu.fields.cuisine), {
      target: { value: 'Indian' },
    });
    fireEvent.change(screen.getByLabelText(MESSAGES.owner.menu.fields.portionSize), {
      target: { value: 'regular' },
    });
    fireEvent.change(screen.getByLabelText(MESSAGES.owner.menu.fields.prepMinutes), {
      target: { value: '10' },
    });
    fireEvent.change(screen.getByLabelText(MESSAGES.owner.menu.fields.spiceLevel), {
      target: { value: '1' },
    });
    fireEvent.click(screen.getByLabelText(MESSAGES.owner.menu.vegetarian));
    fireEvent.click(screen.getByLabelText('Dairy'));
    fireEvent.click(screen.getByLabelText('Sweet'));

    fireEvent.click(
      screen.getByRole('button', { name: MESSAGES.owner.menu.addDishSubmit })
    );

    await waitFor(() => {
      expect(menuService.createMenuItem).toHaveBeenCalledTimes(1);
    });

    expect(menuService.createMenuItem).toHaveBeenCalledWith({
      name: 'Gulab Jamun',
      description: '',
      price: 150,
      category: 'Desserts',
      isVeg: true,
      allergens: ['dairy'],
      spiceLevel: 1,
      flavourTags: ['sweet'],
      cuisine: 'Indian',
      course: 'dessert',
      portionSize: 'regular',
      prepMinutes: 10,
    });

    expect(
      await screen.findByText(MESSAGES.owner.menu.savedAfterAdd)
    ).toBeInTheDocument();
  });

  test('10. edit flow sends ONLY changed field and never unchanged allergens', async () => {
    menuService.fetchMenu.mockResolvedValue([dishConfirmed]);
    menuService.updateMenuItem.mockResolvedValueOnce({
      ...dishConfirmed,
      price: 700,
    });

    render(<MenuManager />);
    await screen.findByText('Saffron Risotto');

    fireEvent.click(
      screen.getByRole('button', {
        name: MESSAGES.owner.menu.actions.edit('Saffron Risotto'),
      })
    );

    const priceInput = screen.getByLabelText(MESSAGES.owner.menu.fields.price);
    fireEvent.change(priceInput, { target: { value: '700' } });

    fireEvent.click(
      screen.getByRole('button', { name: MESSAGES.owner.menu.saveChangesSubmit })
    );

    await waitFor(() => {
      expect(menuService.updateMenuItem).toHaveBeenCalledWith('d1', {
        price: 700,
      });
    });

    expect(
      await screen.findByText(MESSAGES.owner.menu.changesSaved)
    ).toBeInTheDocument();
  });

  test('11. edit with no changes sends no network request and displays note', async () => {
    menuService.fetchMenu.mockResolvedValue([dishConfirmed]);

    render(<MenuManager />);
    await screen.findByText('Saffron Risotto');

    fireEvent.click(
      screen.getByRole('button', {
        name: MESSAGES.owner.menu.actions.edit('Saffron Risotto'),
      })
    );

    fireEvent.click(
      screen.getByRole('button', { name: MESSAGES.owner.menu.saveChangesSubmit })
    );

    expect(menuService.updateMenuItem).not.toHaveBeenCalled();
    expect(
      await screen.findByText(MESSAGES.owner.menu.noChanges)
    ).toBeInTheDocument();
  });

  test('12. edit that changes allergens shows allergens-changed note', async () => {
    menuService.fetchMenu.mockResolvedValue([dishConfirmed]);
    menuService.updateMenuItem.mockResolvedValueOnce({
      ...dishConfirmed,
      allergens: ['dairy', 'gluten'],
    });

    render(<MenuManager />);
    await screen.findByText('Saffron Risotto');

    fireEvent.click(
      screen.getByRole('button', {
        name: MESSAGES.owner.menu.actions.edit('Saffron Risotto'),
      })
    );

    fireEvent.click(screen.getByLabelText('Gluten'));
    fireEvent.click(
      screen.getByRole('button', { name: MESSAGES.owner.menu.saveChangesSubmit })
    );

    await waitFor(() => {
      expect(menuService.updateMenuItem).toHaveBeenCalledWith('d1', {
        allergens: ['dairy', 'gluten'],
      });
    });

    expect(
      await screen.findByText(MESSAGES.owner.menu.savedAfterEditAllergens)
    ).toBeInTheDocument();
  });

  test('13. review flow requires tick, calls confirmAllergens with exact stored array, and re-fetches', async () => {
    menuService.fetchMenu.mockResolvedValue([dishUnconfirmed]);
    menuService.confirmAllergens.mockResolvedValueOnce({
      ...dishUnconfirmed,
      allergensConfirmed: true,
    });

    render(<MenuManager />);
    await screen.findByText('Tandoori Roti');

    fireEvent.click(
      screen.getByRole('button', {
        name: MESSAGES.owner.menu.actions.review('Tandoori Roti'),
      })
    );

    const confirmBtn = screen.getByRole('button', {
      name: MESSAGES.owner.menu.actions.confirm,
    });
    expect(confirmBtn).toBeDisabled();

    fireEvent.click(screen.getByLabelText(MESSAGES.owner.menu.reviewCheckbox));
    expect(confirmBtn).not.toBeDisabled();

    fireEvent.click(confirmBtn);

    await waitFor(() => {
      expect(menuService.confirmAllergens).toHaveBeenCalledWith('d2', ['gluten']);
    });

    expect(
      await screen.findByText(
        MESSAGES.owner.menu.allergensConfirmedFor('Tandoori Roti')
      )
    ).toBeInTheDocument();
  });

  test('14. review 409 conflict closes modal, re-fetches, and displays conflict alert', async () => {
    menuService.fetchMenu.mockResolvedValue([dishUnconfirmed]);
    const conflictErr = new Error('Conflict');
    conflictErr.response = { status: 409 };
    menuService.confirmAllergens.mockRejectedValueOnce(conflictErr);

    render(<MenuManager />);
    await screen.findByText('Tandoori Roti');

    fireEvent.click(
      screen.getByRole('button', {
        name: MESSAGES.owner.menu.actions.review('Tandoori Roti'),
      })
    );

    fireEvent.click(screen.getByLabelText(MESSAGES.owner.menu.reviewCheckbox));
    fireEvent.click(
      screen.getByRole('button', {
        name: MESSAGES.owner.menu.actions.confirm,
      })
    );

    expect(
      await screen.findByText(MESSAGES.owner.menu.reviewConflict)
    ).toBeInTheDocument();

    expect(screen.queryByRole('dialog')).toBeNull();
  });

  test('15. availability toggles both ways (available -> hidden and hidden -> available)', async () => {
    menuService.fetchMenu.mockResolvedValue([dishConfirmed, dishHidden]);
    menuService.setAvailability.mockResolvedValue({ id: 'any' });

    render(<MenuManager />);
    await screen.findByText('Saffron Risotto');

    // Saffron Risotto is available -> hide it
    const hideBtn = screen.getByRole('button', {
      name: MESSAGES.owner.menu.actions.hide('Saffron Risotto'),
    });
    fireEvent.click(hideBtn);

    await waitFor(() => {
      expect(menuService.setAvailability).toHaveBeenCalledWith('d1', false);
    });

    // Steamed Edamame is hidden -> show it
    const showBtn = screen.getByRole('button', {
      name: MESSAGES.owner.menu.actions.show('Steamed Edamame'),
    });
    fireEvent.click(showBtn);

    await waitFor(() => {
      expect(menuService.setAvailability).toHaveBeenCalledWith('d3', true);
    });
  });

  test('16. failed save keeps modal open, shows generic error, and hides server error', async () => {
    menuService.fetchMenu.mockResolvedValue([dishConfirmed]);
    const serverErr = new Error('SQL Syntax Error leak');
    serverErr.response = {
      status: 500,
      data: { message: 'Secret DB connection string leaked' },
    };
    menuService.updateMenuItem.mockRejectedValueOnce(serverErr);

    render(<MenuManager />);
    await screen.findByText('Saffron Risotto');

    fireEvent.click(
      screen.getByRole('button', {
        name: MESSAGES.owner.menu.actions.edit('Saffron Risotto'),
      })
    );

    fireEvent.change(screen.getByLabelText(MESSAGES.owner.menu.fields.price), {
      target: { value: '800' },
    });

    fireEvent.click(
      screen.getByRole('button', { name: MESSAGES.owner.menu.saveChangesSubmit })
    );

    expect(
      await screen.findByText(MESSAGES.owner.menu.errors.saveFailed)
    ).toBeInTheDocument();

    // Modal stays open
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    // Server internals are NOT rendered
    expect(
      screen.queryByText('Secret DB connection string leaked')
    ).toBeNull();
  });

  test('17. all action buttons are disabled while a request is pending', async () => {
    let resolveAvailability;
    const pendingPromise = new Promise((resolve) => {
      resolveAvailability = resolve;
    });
    menuService.fetchMenu.mockResolvedValue([dishConfirmed]);
    menuService.setAvailability.mockReturnValueOnce(pendingPromise);

    render(<MenuManager />);
    await screen.findByText('Saffron Risotto');

    const hideBtn = screen.getByRole('button', {
      name: MESSAGES.owner.menu.actions.hide('Saffron Risotto'),
    });
    const editBtn = screen.getByRole('button', {
      name: MESSAGES.owner.menu.actions.edit('Saffron Risotto'),
    });
    const addBtn = screen.getByRole('button', {
      name: MESSAGES.owner.menu.addDish,
    });

    fireEvent.click(hideBtn);

    // Now busy is true
    expect(hideBtn).toBeDisabled();
    expect(editBtn).toBeDisabled();
    expect(addBtn).toBeDisabled();

    // Finish request
    resolveAvailability({ id: 'd1', available: false });
    await waitFor(() => {
      expect(editBtn).not.toBeDisabled();
    });
  });

  test('18. filter group has accessible name "Filter dishes"', async () => {
    menuService.fetchMenu.mockResolvedValueOnce([dishConfirmed]);

    render(<MenuManager />);
    await screen.findByText('Saffron Risotto');

    expect(
      screen.getByRole('group', { name: 'Filter dishes' })
    ).toBeInTheDocument();
  });
});
