import React from 'react';
import { describe, test, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import AllergenTagReview from './AllergenTagReview.jsx';
import { MESSAGES } from '../../utils/messages.js';

describe('AllergenTagReview', () => {
  const dummyItem = {
    id: 'dish-1',
    name: 'Mushroom Risotto',
    description: 'Arborio rice cooked in rich broth',
    allergens: ['dairy', 'gluten'],
  };

  test('1. labels for stored allergens are displayed', () => {
    render(
      <AllergenTagReview
        item={dummyItem}
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />
    );

    expect(screen.getByText('Mushroom Risotto')).toBeInTheDocument();
    expect(screen.getByText('Arborio rice cooked in rich broth')).toBeInTheDocument();
    expect(screen.getByText('Dairy')).toBeInTheDocument();
    expect(screen.getByText('Gluten')).toBeInTheDocument();
  });

  test('2. empty list shows the safety warning', () => {
    const emptyItem = {
      id: 'dish-2',
      name: 'Steamed Rice',
      allergens: [],
    };
    render(
      <AllergenTagReview
        item={emptyItem}
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />
    );

    expect(
      screen.getByText(MESSAGES.owner.menu.reviewEmptyList)
    ).toBeInTheDocument();
  });

  test('3. Confirm button is disabled until the review checkbox is ticked', () => {
    render(
      <AllergenTagReview
        item={dummyItem}
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />
    );

    const confirmBtn = screen.getByRole('button', {
      name: MESSAGES.owner.menu.actions.confirm,
    });
    expect(confirmBtn).toBeDisabled();

    const checkbox = screen.getByLabelText(MESSAGES.owner.menu.reviewCheckbox);
    fireEvent.click(checkbox);
    expect(confirmBtn).not.toBeDisabled();
  });

  test('4. Confirm passes exactly the stored array in its stored order (e.g. unsorted ["soy", "dairy"])', () => {
    const handleConfirm = vi.fn();
    const unsortedItem = {
      id: 'dish-3',
      name: 'Tofu Soup',
      allergens: ['soy', 'dairy'],
    };

    render(
      <AllergenTagReview
        item={unsortedItem}
        onConfirm={handleConfirm}
        onCancel={vi.fn()}
      />
    );

    fireEvent.click(screen.getByLabelText(MESSAGES.owner.menu.reviewCheckbox));
    fireEvent.click(
      screen.getByRole('button', {
        name: MESSAGES.owner.menu.actions.confirm,
      })
    );

    expect(handleConfirm).toHaveBeenCalledTimes(1);
    expect(handleConfirm).toHaveBeenCalledWith(['soy', 'dairy']);
  });

  test('5. unrecognised tags disable Confirm and show alert', () => {
    const invalidItem = {
      id: 'dish-4',
      name: 'Mystery Dish',
      allergens: ['dairy', 'unknown-tag'],
    };

    render(
      <AllergenTagReview
        item={invalidItem}
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />
    );

    expect(
      screen.getByText(MESSAGES.owner.menu.reviewUnknownTags)
    ).toBeInTheDocument();

    const checkbox = screen.getByLabelText(MESSAGES.owner.menu.reviewCheckbox);
    expect(checkbox).toBeDisabled();

    const confirmBtn = screen.getByRole('button', {
      name: MESSAGES.owner.menu.actions.confirm,
    });
    expect(confirmBtn).toBeDisabled();
  });

  test('6. unreadable (null or non-array) tags disable Confirm and show alert', () => {
    const unreadableItem = {
      id: 'dish-5',
      name: 'Malformed Dish',
      allergens: 'dairy,gluten',
    };

    render(
      <AllergenTagReview
        item={unreadableItem}
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />
    );

    expect(
      screen.getByText(MESSAGES.owner.menu.reviewUnknownTags)
    ).toBeInTheDocument();

    expect(
      screen.getByRole('button', {
        name: MESSAGES.owner.menu.actions.confirm,
      })
    ).toBeDisabled();
  });

  test('7. submitting disables checkbox, Confirm button, and Cancel button', () => {
    render(
      <AllergenTagReview
        item={dummyItem}
        submitting={true}
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />
    );

    expect(
      screen.getByLabelText(MESSAGES.owner.menu.reviewCheckbox)
    ).toBeDisabled();

    const confirmBtn = screen.getByRole('button', {
      name: MESSAGES.owner.menu.actions.confirm,
    });
    expect(confirmBtn).toBeDisabled();
    expect(confirmBtn).toHaveAttribute('aria-busy', 'true');

    expect(
      screen.getByRole('button', { name: MESSAGES.common.cancel })
    ).toBeDisabled();
  });

  test('8. Cancel button triggers onCancel', () => {
    const handleCancel = vi.fn();
    render(
      <AllergenTagReview
        item={dummyItem}
        onConfirm={vi.fn()}
        onCancel={handleCancel}
      />
    );

    fireEvent.click(
      screen.getByRole('button', { name: MESSAGES.common.cancel })
    );
    expect(handleCancel).toHaveBeenCalledTimes(1);
  });
});
