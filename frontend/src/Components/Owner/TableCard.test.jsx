import React from 'react';
import { describe, test, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import TableCard from './TableCard.jsx';
import { MESSAGES } from '../../utils/messages.js';

describe('TableCard component', () => {
  const table = { id: 'tbl-5', number: 5 };

  test('1. renders heading and all three buttons with table-specific names', () => {
    render(
      <TableCard
        table={table}
        onShowQr={vi.fn()}
        onRotate={vi.fn()}
        onDelete={vi.fn()}
      />
    );

    expect(
      screen.getByRole('heading', {
        level: 3,
        name: MESSAGES.owner.tables.tableHeading(5),
      })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', {
        name: MESSAGES.owner.tables.showQr(5),
      })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', {
        name: MESSAGES.owner.tables.replaceQr(5),
      })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', {
        name: MESSAGES.owner.tables.deleteTable(5),
      })
    ).toBeInTheDocument();
  });

  test('2. button clicks call their respective handlers with table prop', () => {
    const handleShowQr = vi.fn();
    const handleRotate = vi.fn();
    const handleDelete = vi.fn();

    render(
      <TableCard
        table={table}
        onShowQr={handleShowQr}
        onRotate={handleRotate}
        onDelete={handleDelete}
      />
    );

    fireEvent.click(
      screen.getByRole('button', {
        name: MESSAGES.owner.tables.showQr(5),
      })
    );
    expect(handleShowQr).toHaveBeenCalledWith(table);

    fireEvent.click(
      screen.getByRole('button', {
        name: MESSAGES.owner.tables.replaceQr(5),
      })
    );
    expect(handleRotate).toHaveBeenCalledWith(table);

    fireEvent.click(
      screen.getByRole('button', {
        name: MESSAGES.owner.tables.deleteTable(5),
      })
    );
    expect(handleDelete).toHaveBeenCalledWith(table);
  });

  test('3. all buttons are disabled when busy is true', () => {
    render(
      <TableCard
        table={table}
        busy={true}
        onShowQr={vi.fn()}
        onRotate={vi.fn()}
        onDelete={vi.fn()}
      />
    );

    const buttons = screen.getAllByRole('button');
    expect(buttons.length).toBe(3);
    buttons.forEach((btn) => {
      expect(btn).toBeDisabled();
    });
  });

  test('4. handlers are not invoked when busy', () => {
    const handleShowQr = vi.fn();
    render(
      <TableCard
        table={table}
        busy={true}
        onShowQr={handleShowQr}
        onRotate={vi.fn()}
        onDelete={vi.fn()}
      />
    );

    fireEvent.click(
      screen.getByRole('button', {
        name: MESSAGES.owner.tables.showQr(5),
      })
    );
    expect(handleShowQr).not.toHaveBeenCalled();
  });
});
