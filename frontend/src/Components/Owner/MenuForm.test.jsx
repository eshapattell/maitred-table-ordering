import React from 'react';
import { describe, test, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import MenuForm from './MenuForm.jsx';
import { MESSAGES } from '../../utils/messages.js';

describe('MenuForm', () => {
  const dummyItem = {
    id: 'item-1',
    name: 'Truffle Pasta',
    description: 'Fresh tagliatelle with black truffle',
    price: 850,
    category: 'Mains',
    isVeg: true,
    allergens: ['dairy', 'gluten'],
    allergensConfirmed: true,
    spiceLevel: 2,
    flavourTags: ['creamy', 'tangy'],
    cuisine: 'Italian',
    course: 'main',
    portionSize: 'regular',
    prepMinutes: 20,
    available: true,
  };

  test('1. renders all expected labelled fields', () => {
    render(<MenuForm mode="create" onSubmit={vi.fn()} onCancel={vi.fn()} />);

    expect(screen.getByLabelText(MESSAGES.owner.menu.fields.name)).toBeInTheDocument();
    expect(screen.getByLabelText(MESSAGES.owner.menu.fields.description)).toBeInTheDocument();
    expect(screen.getByLabelText(MESSAGES.owner.menu.fields.price)).toBeInTheDocument();
    expect(screen.getByLabelText(MESSAGES.owner.menu.fields.category)).toBeInTheDocument();
    expect(screen.getByLabelText(MESSAGES.owner.menu.fields.course)).toBeInTheDocument();
    expect(screen.getByLabelText(MESSAGES.owner.menu.fields.cuisine)).toBeInTheDocument();
    expect(screen.getByLabelText(MESSAGES.owner.menu.fields.portionSize)).toBeInTheDocument();
    expect(screen.getByLabelText(MESSAGES.owner.menu.fields.prepMinutes)).toBeInTheDocument();
    expect(screen.getByLabelText(MESSAGES.owner.menu.fields.spiceLevel)).toBeInTheDocument();
    expect(screen.getByLabelText(MESSAGES.owner.menu.vegetarian)).toBeInTheDocument();
    expect(screen.getByLabelText(MESSAGES.owner.menu.nonVegetarian)).toBeInTheDocument();
    expect(screen.getByText(MESSAGES.owner.menu.fields.allergensLegend)).toBeInTheDocument();
    expect(screen.getByLabelText(MESSAGES.owner.menu.noneCheckbox)).toBeInTheDocument();
  });

  test('2. blank submit shows validation errors and does not call onSubmit', () => {
    const handleSubmit = vi.fn();
    render(<MenuForm mode="create" onSubmit={handleSubmit} onCancel={vi.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: MESSAGES.owner.menu.addDishSubmit }));
    expect(handleSubmit).not.toHaveBeenCalled();
    expect(screen.getAllByRole('alert').length).toBeGreaterThan(0);
  });

  test('3. focus moves to the first invalid field on failed submit', () => {
    render(<MenuForm mode="create" onSubmit={vi.fn()} onCancel={vi.fn()} />);

    const nameInput = screen.getByLabelText(MESSAGES.owner.menu.fields.name);
    fireEvent.click(screen.getByRole('button', { name: MESSAGES.owner.menu.addDishSubmit }));
    expect(document.activeElement).toBe(nameInput);
  });

  test('4. unanswered allergen field shows allergen validation error', () => {
    render(<MenuForm mode="create" onSubmit={vi.fn()} onCancel={vi.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: MESSAGES.owner.menu.addDishSubmit }));
    expect(
      screen.getByText('Tick every allergen this dish contains, or confirm that it contains none')
    ).toBeInTheDocument();
  });

  test('5. the none checkbox and allergen checkboxes clear each other', () => {
    render(<MenuForm mode="create" onSubmit={vi.fn()} onCancel={vi.fn()} />);

    const noneCheckbox = screen.getByLabelText(MESSAGES.owner.menu.noneCheckbox);
    const dairyCheckbox = screen.getByLabelText('Dairy');
    const glutenCheckbox = screen.getByLabelText('Gluten');

    // Tick allergens
    fireEvent.click(dairyCheckbox);
    fireEvent.click(glutenCheckbox);
    expect(dairyCheckbox).toBeChecked();
    expect(glutenCheckbox).toBeChecked();
    expect(noneCheckbox).not.toBeChecked();

    // Ticking "contains none" clears allergens
    fireEvent.click(noneCheckbox);
    expect(noneCheckbox).toBeChecked();
    expect(dairyCheckbox).not.toBeChecked();
    expect(glutenCheckbox).not.toBeChecked();

    // Ticking an allergen clears "contains none"
    fireEvent.click(dairyCheckbox);
    expect(dairyCheckbox).toBeChecked();
    expect(noneCheckbox).not.toBeChecked();
  });

  test('6. a valid create form calls onSubmit with exact payload', () => {
    const handleSubmit = vi.fn();
    render(<MenuForm mode="create" onSubmit={handleSubmit} onCancel={vi.fn()} />);

    fireEvent.change(screen.getByLabelText(MESSAGES.owner.menu.fields.name), {
      target: { value: 'Paneer Tikka' },
    });
    fireEvent.change(screen.getByLabelText(MESSAGES.owner.menu.fields.description), {
      target: { value: 'Charred cottage cheese cubes' },
    });
    fireEvent.change(screen.getByLabelText(MESSAGES.owner.menu.fields.price), {
      target: { value: '350' },
    });
    fireEvent.change(screen.getByLabelText(MESSAGES.owner.menu.fields.category), {
      target: { value: 'Starters' },
    });
    fireEvent.change(screen.getByLabelText(MESSAGES.owner.menu.fields.course), {
      target: { value: 'starter' },
    });
    fireEvent.change(screen.getByLabelText(MESSAGES.owner.menu.fields.cuisine), {
      target: { value: 'North Indian' },
    });
    fireEvent.change(screen.getByLabelText(MESSAGES.owner.menu.fields.portionSize), {
      target: { value: 'regular' },
    });
    fireEvent.change(screen.getByLabelText(MESSAGES.owner.menu.fields.prepMinutes), {
      target: { value: '15' },
    });
    fireEvent.change(screen.getByLabelText(MESSAGES.owner.menu.fields.spiceLevel), {
      target: { value: '3' },
    });

    fireEvent.click(screen.getByLabelText(MESSAGES.owner.menu.vegetarian));
    fireEvent.click(screen.getByLabelText('Dairy'));
    fireEvent.click(screen.getByLabelText('Tangy'));

    fireEvent.click(screen.getByRole('button', { name: MESSAGES.owner.menu.addDishSubmit }));

    expect(handleSubmit).toHaveBeenCalledTimes(1);
    expect(handleSubmit).toHaveBeenCalledWith({
      name: 'Paneer Tikka',
      description: 'Charred cottage cheese cubes',
      price: 350,
      category: 'Starters',
      isVeg: true,
      allergens: ['dairy'],
      spiceLevel: 3,
      flavourTags: ['tangy'],
      cuisine: 'North Indian',
      course: 'starter',
      portionSize: 'regular',
      prepMinutes: 15,
    });
  });

  test('7. edit mode is prefilled including ticked allergens and tags', () => {
    render(<MenuForm mode="edit" item={dummyItem} onSubmit={vi.fn()} onCancel={vi.fn()} />);

    expect(screen.getByLabelText(MESSAGES.owner.menu.fields.name)).toHaveValue('Truffle Pasta');
    expect(screen.getByLabelText(MESSAGES.owner.menu.fields.price)).toHaveValue('850');
    expect(screen.getByLabelText(MESSAGES.owner.menu.fields.category)).toHaveValue('Mains');
    expect(screen.getByLabelText(MESSAGES.owner.menu.vegetarian)).toBeChecked();
    expect(screen.getByLabelText('Dairy')).toBeChecked();
    expect(screen.getByLabelText('Gluten')).toBeChecked();
    expect(screen.getByLabelText(MESSAGES.owner.menu.noneCheckbox)).not.toBeChecked();
  });

  test('8. edit mode with empty allergens pre-ticks the none checkbox', () => {
    const itemNoAllergens = {
      ...dummyItem,
      allergens: [],
    };
    render(<MenuForm mode="edit" item={itemNoAllergens} onSubmit={vi.fn()} onCancel={vi.fn()} />);

    expect(screen.getByLabelText(MESSAGES.owner.menu.noneCheckbox)).toBeChecked();
    expect(screen.getByLabelText('Dairy')).not.toBeChecked();
  });

  test('9. unrecognised or null allergen tags show warning alert at top of form', () => {
    const itemBadAllergens = {
      ...dummyItem,
      allergens: ['monosodium', 'peanuts-raw'],
    };
    render(<MenuForm mode="edit" item={itemBadAllergens} onSubmit={vi.fn()} onCancel={vi.fn()} />);

    expect(
      screen.getByText(MESSAGES.owner.menu.reviewUnknownTags)
    ).toBeInTheDocument();
  });

  test('10. submitting disables submit button with aria-busy', () => {
    render(<MenuForm mode="create" submitting={true} onSubmit={vi.fn()} onCancel={vi.fn()} />);

    const submitBtn = screen.getByRole('button', { name: MESSAGES.owner.menu.addDishSubmit });
    expect(submitBtn).toBeDisabled();
    expect(submitBtn).toHaveAttribute('aria-busy', 'true');
  });

  test('11. Cancel button triggers onCancel', () => {
    const handleCancel = vi.fn();
    render(<MenuForm mode="create" onSubmit={vi.fn()} onCancel={handleCancel} />);

    fireEvent.click(screen.getByRole('button', { name: MESSAGES.common.cancel }));
    expect(handleCancel).toHaveBeenCalledTimes(1);
  });

  test('12. nothing is preselected for vegetarian in create mode', () => {
    render(<MenuForm mode="create" onSubmit={vi.fn()} onCancel={vi.fn()} />);

    expect(screen.getByLabelText(MESSAGES.owner.menu.vegetarian)).not.toBeChecked();
    expect(screen.getByLabelText(MESSAGES.owner.menu.nonVegetarian)).not.toBeChecked();
  });

  test('13. edit mode submit button text is Save changes', () => {
    render(<MenuForm mode="edit" item={dummyItem} onSubmit={vi.fn()} onCancel={vi.fn()} />);

    expect(
      screen.getByRole('button', { name: MESSAGES.owner.menu.saveChangesSubmit })
    ).toBeInTheDocument();
  });

  test('14. datalist contains provided categories', () => {
    const { container } = render(
      <MenuForm
        mode="create"
        categories={['Starters', 'Desserts']}
        onSubmit={vi.fn()}
        onCancel={vi.fn()}
      />
    );

    const datalist = container.querySelector('datalist');
    expect(datalist).toBeInTheDocument();
    const options = datalist.querySelectorAll('option');
    expect(options.length).toBe(2);
    expect(options[0].value).toBe('Starters');
    expect(options[1].value).toBe('Desserts');
  });

  test('15. allergen fieldset links aria-describedby to error message on validation failure', () => {
    const { container } = render(
      <MenuForm mode="create" onSubmit={vi.fn()} onCancel={vi.fn()} />
    );

    fireEvent.click(
      screen.getByRole('button', { name: MESSAGES.owner.menu.addDishSubmit })
    );

    const allergenFieldset = container.querySelector('.allergens-fieldset');
    expect(allergenFieldset).toBeInTheDocument();
    const describedBy = allergenFieldset.getAttribute('aria-describedby');
    expect(describedBy).toBeTruthy();

    const errorEl = document.getElementById(describedBy);
    expect(errorEl).toBeInTheDocument();
    expect(errorEl).toHaveAttribute('role', 'alert');
  });

  test('16. typing in name clears only name error while price error stays', () => {
    render(<MenuForm mode="create" onSubmit={vi.fn()} onCancel={vi.fn()} />);

    fireEvent.click(
      screen.getByRole('button', { name: MESSAGES.owner.menu.addDishSubmit })
    );

    const nameInput = screen.getByLabelText(MESSAGES.owner.menu.fields.name);
    const priceInput = screen.getByLabelText(MESSAGES.owner.menu.fields.price);
    expect(nameInput).toHaveAttribute('aria-invalid', 'true');
    expect(priceInput).toHaveAttribute('aria-invalid', 'true');

    fireEvent.change(nameInput, { target: { value: 'Saffron Risotto' } });
    expect(nameInput).not.toHaveAttribute('aria-invalid');
    expect(priceInput).toHaveAttribute('aria-invalid', 'true');
  });

  test('17. choosing a course clears the course error', () => {
    render(<MenuForm mode="create" onSubmit={vi.fn()} onCancel={vi.fn()} />);

    fireEvent.click(
      screen.getByRole('button', { name: MESSAGES.owner.menu.addDishSubmit })
    );

    const courseSelect = screen.getByLabelText(MESSAGES.owner.menu.fields.course);
    expect(courseSelect).toHaveAttribute('aria-invalid', 'true');

    fireEvent.change(courseSelect, { target: { value: 'main' } });
    expect(courseSelect).not.toHaveAttribute('aria-invalid');
  });

  test('18. choosing vegetarian clears the isVeg error', () => {
    render(<MenuForm mode="create" onSubmit={vi.fn()} onCancel={vi.fn()} />);

    fireEvent.click(
      screen.getByRole('button', { name: MESSAGES.owner.menu.addDishSubmit })
    );

    const vegRadio = screen.getByLabelText(MESSAGES.owner.menu.vegetarian);
    expect(vegRadio).toHaveAttribute('aria-invalid', 'true');

    fireEvent.click(vegRadio);
    expect(vegRadio).not.toHaveAttribute('aria-invalid');
  });

  test('19. ticking an allergen clears the allergens error, and ticking contains none clears it', () => {
    const { container } = render(
      <MenuForm mode="create" onSubmit={vi.fn()} onCancel={vi.fn()} />
    );

    fireEvent.click(
      screen.getByRole('button', { name: MESSAGES.owner.menu.addDishSubmit })
    );

    const allergenFieldset = container.querySelector('.allergens-fieldset');
    expect(allergenFieldset).toHaveAttribute('aria-describedby');

    const dairyCheckbox = screen.getByLabelText('Dairy');
    fireEvent.click(dairyCheckbox);
    expect(allergenFieldset).not.toHaveAttribute('aria-describedby');

    // Untick dairy and trigger submit again to get allergen error back
    fireEvent.click(dairyCheckbox);
    fireEvent.click(
      screen.getByRole('button', { name: MESSAGES.owner.menu.addDishSubmit })
    );
    expect(allergenFieldset).toHaveAttribute('aria-describedby');

    // Ticking 'contains none' clears it
    const noneCheckbox = screen.getByLabelText(MESSAGES.owner.menu.noneCheckbox);
    fireEvent.click(noneCheckbox);
    expect(allergenFieldset).not.toHaveAttribute('aria-describedby');
  });

  test('20. a second blank submit shows the errors again', () => {
    render(<MenuForm mode="create" onSubmit={vi.fn()} onCancel={vi.fn()} />);

    // First blank submit
    fireEvent.click(
      screen.getByRole('button', { name: MESSAGES.owner.menu.addDishSubmit })
    );
    const nameInput = screen.getByLabelText(MESSAGES.owner.menu.fields.name);
    expect(nameInput).toHaveAttribute('aria-invalid', 'true');

    // Fix name
    fireEvent.change(nameInput, { target: { value: 'Risotto' } });
    expect(nameInput).not.toHaveAttribute('aria-invalid');

    // Clear name again
    fireEvent.change(nameInput, { target: { value: '' } });

    // Second submit shows errors again
    fireEvent.click(
      screen.getByRole('button', { name: MESSAGES.owner.menu.addDishSubmit })
    );
    expect(nameInput).toHaveAttribute('aria-invalid', 'true');
  });
});
