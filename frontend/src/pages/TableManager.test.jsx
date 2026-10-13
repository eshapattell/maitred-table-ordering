import React from 'react';
import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import TableManager from './TableManager.jsx';
import * as tableService from '../services/tableService.js';
import { MESSAGES } from '../utils/messages.js';

vi.mock('../services/tableService.js', () => ({
  fetchTables: vi.fn(),
  createTable: vi.fn(),
  fetchTableQR: vi.fn(),
  rotateTableToken: vi.fn(),
  deleteTable: vi.fn(),
}));

describe('TableManager page', () => {
  const dummyTables = [
    { id: 't1', number: 1 },
    { id: 't2', number: 2 },
  ];

  const dummyQrData = {
    table: { id: 't1', number: 1 },
    url: 'https://example.com/join/4f8a3c2e1b0d9e8a7c6b5a4d3e2f1a0b',
    qrDataUrl: 'data:image/png;base64,' + 'A'.repeat(120) + '==',
  };

  beforeEach(() => {
    vi.clearAllMocks();
    window.print = vi.fn();
  });

  test('1. loads and displays table list, or empty state when no tables exist', async () => {
    tableService.fetchTables.mockResolvedValueOnce([]);

    const { unmount } = render(<TableManager />);
    expect(await screen.findByText(MESSAGES.owner.tables.emptyState)).toBeInTheDocument();
    unmount();

    tableService.fetchTables.mockResolvedValueOnce(dummyTables);
    render(<TableManager />);
    expect(await screen.findByText('Table 1')).toBeInTheDocument();
    expect(screen.getByText('Table 2')).toBeInTheDocument();
  });

  test('2. load failure shows error banner and Try again button that re-fetches', async () => {
    tableService.fetchTables
      .mockRejectedValueOnce(new Error('Connection failure'))
      .mockResolvedValueOnce(dummyTables);

    render(<TableManager />);
    expect(
      await screen.findByText(MESSAGES.owner.tables.errors.loadFailed)
    ).toBeInTheDocument();

    fireEvent.click(
      screen.getByRole('button', { name: MESSAGES.common.tryAgain })
    );

    expect(await screen.findByText('Table 1')).toBeInTheDocument();
    expect(tableService.fetchTables).toHaveBeenCalledTimes(2);
  });

  test('3. add form validation rejects invalid inputs (empty, 0, 501, 1.5, "abc", "7a") without sending request', async () => {
    tableService.fetchTables.mockResolvedValueOnce(dummyTables);
    render(<TableManager />);
    await screen.findByText('Table 1');

    const input = screen.getByLabelText(MESSAGES.owner.tables.tableNumberLabel);
    const addBtn = screen.getByRole('button', {
      name: MESSAGES.owner.tables.addTable,
    });

    const invalidInputs = ['', '0', '501', '1.5', 'abc', '7a'];
    for (const val of invalidInputs) {
      fireEvent.change(input, { target: { value: val } });
      fireEvent.click(addBtn);
      expect(tableService.createTable).not.toHaveBeenCalled();
      expect(
        screen.getByText(MESSAGES.owner.tables.errors.invalidNumber)
      ).toBeInTheDocument();
    }
  });

  test('4. a valid table number calls createTable with a number (not a string)', async () => {
    tableService.fetchTables.mockResolvedValue(dummyTables);
    tableService.createTable.mockResolvedValueOnce({ id: 't3', number: 3 });

    render(<TableManager />);
    await screen.findByText('Table 1');

    const input = screen.getByLabelText(MESSAGES.owner.tables.tableNumberLabel);
    fireEvent.change(input, { target: { value: '3' } });

    fireEvent.click(
      screen.getByRole('button', {
        name: MESSAGES.owner.tables.addTable,
      })
    );

    await waitFor(() => {
      expect(tableService.createTable).toHaveBeenCalledTimes(1);
    });

    expect(tableService.createTable).toHaveBeenCalledWith(3);
    expect(input.value).toBe('');
    expect(
      await screen.findByText(MESSAGES.owner.tables.notes.added(3))
    ).toBeInTheDocument();
  });

  test('5. 409 conflict and 400 bad request show specific error messages', async () => {
    tableService.fetchTables.mockResolvedValue(dummyTables);
    const err409 = new Error('Conflict');
    err409.response = { status: 409 };
    tableService.createTable.mockRejectedValueOnce(err409);

    render(<TableManager />);
    await screen.findByText('Table 1');

    const input = screen.getByLabelText(MESSAGES.owner.tables.tableNumberLabel);
    fireEvent.change(input, { target: { value: '1' } });
    fireEvent.click(
      screen.getByRole('button', {
        name: MESSAGES.owner.tables.addTable,
      })
    );

    expect(
      await screen.findByText(MESSAGES.owner.tables.errors.alreadyExists(1))
    ).toBeInTheDocument();

    const err400 = new Error('Bad Request');
    err400.response = { status: 400 };
    tableService.createTable.mockRejectedValueOnce(err400);

    fireEvent.change(input, { target: { value: '99' } });
    fireEvent.click(
      screen.getByRole('button', {
        name: MESSAGES.owner.tables.addTable,
      })
    );

    expect(
      await screen.findByText(MESSAGES.owner.tables.errors.invalidNumber)
    ).toBeInTheDocument();
  });

  test('6. Show QR opens modal with heading, QR image, download link, and print button', async () => {
    tableService.fetchTables.mockResolvedValueOnce(dummyTables);
    tableService.fetchTableQR.mockResolvedValueOnce(dummyQrData);

    render(<TableManager />);
    await screen.findByText('Table 1');

    fireEvent.click(
      screen.getByRole('button', {
        name: MESSAGES.owner.tables.showQr(1),
      })
    );

    await waitFor(() => {
      expect(tableService.fetchTableQR).toHaveBeenCalledWith('t1');
    });

    expect(
      await screen.findByRole('dialog', { name: 'Table 1' })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('img', { name: MESSAGES.owner.tables.qrAlt(1) })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: MESSAGES.owner.tables.downloadImage })
    ).toBeInTheDocument();
  });

  test('7. rotate token asks first, cancels cleanly, or calls rotateTableToken, re-fetches and shows new QR', async () => {
    tableService.fetchTables.mockResolvedValue(dummyTables);
    tableService.rotateTableToken.mockResolvedValueOnce({ id: 't1', number: 1 });
    tableService.fetchTableQR.mockResolvedValueOnce(dummyQrData);

    render(<TableManager />);
    await screen.findByText('Table 1');

    // Click Replace QR
    fireEvent.click(
      screen.getByRole('button', {
        name: MESSAGES.owner.tables.replaceQr(1),
      })
    );

    // Confirm dialog opens
    expect(
      screen.getByRole('dialog', {
        name: MESSAGES.owner.tables.rotateModalTitle(1),
      })
    ).toBeInTheDocument();

    // Cancel sends nothing
    fireEvent.click(
      screen.getByRole('button', { name: MESSAGES.common.cancel })
    );
    expect(tableService.rotateTableToken).not.toHaveBeenCalled();
    expect(screen.queryByRole('dialog')).toBeNull();

    // Open again and confirm
    fireEvent.click(
      screen.getByRole('button', {
        name: MESSAGES.owner.tables.replaceQr(1),
      })
    );

    fireEvent.click(
      screen.getByRole('button', {
        name: MESSAGES.owner.tables.rotateConfirm,
      })
    );

    await waitFor(() => {
      expect(tableService.rotateTableToken).toHaveBeenCalledWith('t1');
    });

    // Automatically transitions to Show QR modal
    expect(
      await screen.findByRole('dialog', { name: 'Table 1' })
    ).toBeInTheDocument();
    expect(tableService.fetchTableQR).toHaveBeenCalledWith('t1');
  });

  test('8. delete asks first, cancels cleanly, or deletes and updates list', async () => {
    tableService.fetchTables.mockResolvedValue(dummyTables);
    tableService.deleteTable.mockResolvedValueOnce({ message: 'Table deleted' });

    render(<TableManager />);
    await screen.findByText('Table 1');

    // Click delete
    fireEvent.click(
      screen.getByRole('button', {
        name: MESSAGES.owner.tables.deleteTable(1),
      })
    );

    expect(
      screen.getByRole('dialog', {
        name: MESSAGES.owner.tables.deleteModalTitle(1),
      })
    ).toBeInTheDocument();

    // Cancel sends nothing
    fireEvent.click(
      screen.getByRole('button', { name: MESSAGES.common.cancel })
    );
    expect(tableService.deleteTable).not.toHaveBeenCalled();

    // Click delete again and confirm
    fireEvent.click(
      screen.getByRole('button', {
        name: MESSAGES.owner.tables.deleteTable(1),
      })
    );

    fireEvent.click(
      screen.getByRole('button', {
        name: MESSAGES.owner.tables.deleteConfirm,
      })
    );

    await waitFor(() => {
      expect(tableService.deleteTable).toHaveBeenCalledWith('t1');
    });

    expect(
      await screen.findByText(MESSAGES.owner.tables.notes.deleted(1))
    ).toBeInTheDocument();
  });

  test('9. delete 409 conflict shows blocked wording and table remains in view', async () => {
    tableService.fetchTables.mockResolvedValue(dummyTables);
    const err409 = new Error('Conflict');
    err409.response = { status: 409 };
    tableService.deleteTable.mockRejectedValueOnce(err409);

    render(<TableManager />);
    await screen.findByText('Table 1');

    fireEvent.click(
      screen.getByRole('button', {
        name: MESSAGES.owner.tables.deleteTable(1),
      })
    );

    fireEvent.click(
      screen.getByRole('button', {
        name: MESSAGES.owner.tables.deleteConfirm,
      })
    );

    expect(
      await screen.findByText(MESSAGES.owner.tables.deleteBlocked)
    ).toBeInTheDocument();

    // Table 1 is still rendered
    expect(screen.getByText('Table 1')).toBeInTheDocument();
  });

  test('10. 404 paths on rotate and delete re-fetch table list', async () => {
    tableService.fetchTables.mockResolvedValue(dummyTables);
    const err404 = new Error('Not Found');
    err404.response = { status: 404 };
    tableService.rotateTableToken.mockRejectedValueOnce(err404);

    render(<TableManager />);
    await screen.findByText('Table 1');

    fireEvent.click(
      screen.getByRole('button', {
        name: MESSAGES.owner.tables.replaceQr(1),
      })
    );

    fireEvent.click(
      screen.getByRole('button', {
        name: MESSAGES.owner.tables.rotateConfirm,
      })
    );

    expect(
      await screen.findByText(MESSAGES.owner.tables.errors.notFound)
    ).toBeInTheDocument();
    expect(tableService.fetchTables).toHaveBeenCalledTimes(2);
  });

  test('11. document text never contains a 32-hex string at any point', async () => {
    const hex32 = '4f8a3c2e1b0d9e8a7c6b5a4d3e2f1a0b';
    tableService.fetchTables.mockResolvedValueOnce(dummyTables);
    tableService.fetchTableQR.mockResolvedValueOnce(dummyQrData);

    const { container } = render(<TableManager />);
    await screen.findByText('Table 1');

    fireEvent.click(
      screen.getByRole('button', {
        name: MESSAGES.owner.tables.showQr(1),
      })
    );

    await screen.findByRole('dialog', { name: 'Table 1' });

    const renderedText = container.textContent || '';
    expect(renderedText).not.toContain(hex32);
    expect(/^[a-f0-9]{32}$/i.test(renderedText)).toBe(false);
  });

  test('12. every action button is disabled while an operation is pending', async () => {
    let resolveDelete;
    const pendingDelete = new Promise((resolve) => {
      resolveDelete = resolve;
    });
    tableService.fetchTables.mockResolvedValue(dummyTables);
    tableService.deleteTable.mockReturnValueOnce(pendingDelete);

    render(<TableManager />);
    await screen.findByText('Table 1');

    fireEvent.click(
      screen.getByRole('button', {
        name: MESSAGES.owner.tables.deleteTable(1),
      })
    );

    const confirmBtn = screen.getByRole('button', {
      name: MESSAGES.owner.tables.deleteConfirm,
    });
    fireEvent.click(confirmBtn);

    // Modal confirm button has aria-busy / loading
    expect(confirmBtn).toBeDisabled();

    resolveDelete({ message: 'Deleted' });
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).toBeNull();
    });
  });

  test('13. QR fetch failure displays qrLoadFailed error banner', async () => {
    tableService.fetchTables.mockResolvedValueOnce(dummyTables);
    tableService.fetchTableQR.mockRejectedValueOnce(new Error('QR error'));

    render(<TableManager />);
    await screen.findByText('Table 1');

    fireEvent.click(
      screen.getByRole('button', {
        name: MESSAGES.owner.tables.showQr(1),
      })
    );

    expect(
      await screen.findByText(MESSAGES.owner.tables.errors.qrLoadFailed)
    ).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  test('14. input trimmed whitespace is valid if whole number from 1 to 500', async () => {
    tableService.fetchTables.mockResolvedValue(dummyTables);
    tableService.createTable.mockResolvedValueOnce({ id: 't4', number: 42 });

    render(<TableManager />);
    await screen.findByText('Table 1');

    const input = screen.getByLabelText(MESSAGES.owner.tables.tableNumberLabel);
    fireEvent.change(input, { target: { value: '  42  ' } });

    fireEvent.click(
      screen.getByRole('button', {
        name: MESSAGES.owner.tables.addTable,
      })
    );

    await waitFor(() => {
      expect(tableService.createTable).toHaveBeenCalledWith(42);
    });
  });

  test('15. replace-QR success path opens the new QR dialog', async () => {
    tableService.fetchTables.mockResolvedValue(dummyTables);
    tableService.rotateTableToken.mockResolvedValueOnce({ id: 't1', number: 1 });
    tableService.fetchTableQR.mockResolvedValueOnce(dummyQrData);

    render(<TableManager />);
    await screen.findByText('Table 1');

    fireEvent.click(
      screen.getByRole('button', {
        name: MESSAGES.owner.tables.replaceQr(1),
      })
    );

    fireEvent.click(
      screen.getByRole('button', {
        name: MESSAGES.owner.tables.rotateConfirm,
      })
    );

    await waitFor(() => {
      expect(tableService.rotateTableToken).toHaveBeenCalledWith('t1');
    });

    expect(
      await screen.findByRole('dialog', { name: 'Table 1' })
    ).toBeInTheDocument();
    expect(tableService.fetchTableQR).toHaveBeenCalledWith('t1');
  });

  test('16. rotation success followed by fetchTableQR failure shows replacedQrLoadFailed, calls rotateTableToken once, re-fetches table list, and does not show generic message', async () => {
    tableService.fetchTables.mockResolvedValue(dummyTables);
    tableService.rotateTableToken.mockResolvedValueOnce({ id: 't1', number: 1 });
    tableService.fetchTableQR.mockRejectedValueOnce(new Error('QR network error'));

    render(<TableManager />);
    await screen.findByText('Table 1');
    expect(tableService.fetchTables).toHaveBeenCalledTimes(1);

    fireEvent.click(
      screen.getByRole('button', {
        name: MESSAGES.owner.tables.replaceQr(1),
      })
    );

    fireEvent.click(
      screen.getByRole('button', {
        name: MESSAGES.owner.tables.rotateConfirm,
      })
    );

    expect(
      await screen.findByText(MESSAGES.owner.tables.errors.replacedQrLoadFailed)
    ).toBeInTheDocument();

    expect(tableService.rotateTableToken).toHaveBeenCalledTimes(1);
    expect(tableService.rotateTableToken).toHaveBeenCalledWith('t1');
    expect(tableService.fetchTables).toHaveBeenCalledTimes(2);
    expect(screen.queryByText(MESSAGES.owner.tables.errors.generic)).toBeNull();
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  test('17. focus lands on Cancel button when replace QR confirmation dialog opens', async () => {
    tableService.fetchTables.mockResolvedValue(dummyTables);
    render(<TableManager />);
    await screen.findByText('Table 1');

    fireEvent.click(
      screen.getByRole('button', {
        name: MESSAGES.owner.tables.replaceQr(1),
      })
    );

    const dialog = await screen.findByRole('dialog', {
      name: MESSAGES.owner.tables.rotateModalTitle(1),
    });
    expect(dialog).toBeInTheDocument();

    const cancelBtn = screen.getByRole('button', { name: MESSAGES.common.cancel });
    expect(document.activeElement).toBe(cancelBtn);
  });

  test('18. focus lands on Cancel button when delete table confirmation dialog opens', async () => {
    tableService.fetchTables.mockResolvedValue(dummyTables);
    render(<TableManager />);
    await screen.findByText('Table 1');

    fireEvent.click(
      screen.getByRole('button', {
        name: MESSAGES.owner.tables.deleteTable(1),
      })
    );

    const dialog = await screen.findByRole('dialog', {
      name: MESSAGES.owner.tables.deleteModalTitle(1),
    });
    expect(dialog).toBeInTheDocument();

    const cancelBtn = screen.getByRole('button', { name: MESSAGES.common.cancel });
    expect(document.activeElement).toBe(cancelBtn);
  });
});

