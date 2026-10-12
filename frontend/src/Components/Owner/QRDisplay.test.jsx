import React from 'react';
import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import QRDisplay from './QRDisplay.jsx';
import { MESSAGES } from '../../utils/messages.js';

describe('QRDisplay component', () => {
  const validPngDataUrl =
    'data:image/png;base64,' + 'A'.repeat(120) + '==';
  const validHttpUrl = 'https://example.com/join/table-5?token=4f8a3c2e1b0d9e8a7c6b5a4d3e2f1a0b';

  beforeEach(() => {
    window.print = vi.fn();
  });

  test('1. renders img only for a valid PNG data URL', () => {
    render(
      <QRDisplay
        number={5}
        url={validHttpUrl}
        qrDataUrl={validPngDataUrl}
      />
    );

    const img = screen.getByRole('img', {
      name: MESSAGES.owner.tables.qrAlt(5),
    });
    expect(img).toBeInTheDocument();
    expect(img.getAttribute('src')).toBe(validPngDataUrl);
    expect(screen.queryByText(MESSAGES.owner.tables.qrUnavailable)).toBeNull();
  });

  test('2. invalid PNG data URLs (javascript: or svg) show message and NO img', () => {
    const { rerender } = render(
      <QRDisplay
        number={5}
        url={validHttpUrl}
        qrDataUrl="javascript:alert(1)"
      />
    );

    expect(screen.queryByRole('img')).toBeNull();
    expect(
      screen.getByText(MESSAGES.owner.tables.qrUnavailable)
    ).toBeInTheDocument();

    rerender(
      <QRDisplay
        number={5}
        url={validHttpUrl}
        qrDataUrl="data:image/svg+xml;utf8,<svg></svg>"
      />
    );

    expect(screen.queryByRole('img')).toBeNull();
    expect(
      screen.getByText(MESSAGES.owner.tables.qrUnavailable)
    ).toBeInTheDocument();
  });

  test('3. guest link rendered only for http(s) URLs', () => {
    const { rerender } = render(
      <QRDisplay
        number={5}
        url={validHttpUrl}
        qrDataUrl={validPngDataUrl}
      />
    );

    const link = screen.getByRole('link', {
      name: MESSAGES.owner.tables.openGuestLink,
    });
    expect(link).toHaveAttribute('href', validHttpUrl);
    expect(link).toHaveAttribute('target', '_blank');

    rerender(
      <QRDisplay
        number={5}
        url="javascript:alert('evil')"
        qrDataUrl={validPngDataUrl}
      />
    );
    expect(
      screen.queryByRole('link', {
        name: MESSAGES.owner.tables.openGuestLink,
      })
    ).toBeNull();
  });

  test('4. download anchor has correct filename and href for table', () => {
    render(
      <QRDisplay
        number={5}
        url={validHttpUrl}
        qrDataUrl={validPngDataUrl}
      />
    );

    const downloadLink = screen.getByRole('link', {
      name: MESSAGES.owner.tables.downloadImage,
    });
    expect(downloadLink).toHaveAttribute('download', 'maitred-table-5.png');
    expect(downloadLink).toHaveAttribute('href', validPngDataUrl);
  });

  test('5. Print button calls window.print once', () => {
    render(
      <QRDisplay
        number={5}
        url={validHttpUrl}
        qrDataUrl={validPngDataUrl}
      />
    );

    const printBtn = screen.getByRole('button', {
      name: MESSAGES.owner.tables.print,
    });
    fireEvent.click(printBtn);
    expect(window.print).toHaveBeenCalledTimes(1);
  });

  test('6. visible text never contains a 32-hex string or token value', () => {
    const hex32 = '4f8a3c2e1b0d9e8a7c6b5a4d3e2f1a0b';
    const { container } = render(
      <QRDisplay
        number={5}
        url={`https://example.com/join/${hex32}`}
        qrDataUrl={validPngDataUrl}
      />
    );

    const allText = container.textContent || '';
    expect(allText).not.toContain(hex32);
    expect(/^[a-f0-9]{32}$/i.test(allText)).toBe(false);
  });
});
