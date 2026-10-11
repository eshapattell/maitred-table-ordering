import { describe, test, expect } from 'vitest';
import { isPngDataUrl, isHttpUrl, qrFileName } from './qr.js';

const PREFIX = 'data:image/png;base64,';
const body = (n) => 'A'.repeat(n);

describe('isPngDataUrl', () => {
  test('accepts a base64 PNG data URL of sensible size', () => {
    expect(isPngDataUrl(PREFIX + body(2000))).toBe(true);
    expect(isPngDataUrl(PREFIX + body(198) + '==')).toBe(true);
    expect(isPngDataUrl(PREFIX + 'iVBORw0KGgo' + body(300) + '+/9a=')).toBe(true);
  });
  test.each([
    ['empty', ''], ['undefined', undefined], ['null', null], ['a number', 5], ['an object', {}],
    ['a javascript: URL', 'javascript:alert(1)'], ['a jpeg data URL', 'data:image/jpeg;base64,' + body(500)],
    ['an svg data URL', 'data:image/svg+xml;base64,' + body(500)], ['an http URL', 'https://example.com/qr.png'],
    ['not base64', PREFIX + '<script>' + body(300)], ['spaces inside', PREFIX + body(150) + ' ' + body(150)],
    ['too short', PREFIX + body(50)], ['empty body', PREFIX], ['too long', PREFIX + body(300001)],
    ['padding in the middle', PREFIX + body(150) + '=' + body(150)], ['wrong prefix case', 'DATA:image/png;base64,' + body(500)],
  ])('rejects %s', (_label, value) => expect(isPngDataUrl(value)).toBe(false));
});

describe('isHttpUrl', () => {
  test.each([['http://localhost:5174/r/1/table/5?token=abc'], ['https://example.com/x']])('accepts %s', (v) => expect(isHttpUrl(v)).toBe(true));
  test.each([['javascript:alert(1)'], ['data:text/html,<b>x</b>'], ['file:///etc/passwd'], ['ftp://example.com'], ['not a url'], [''], [null], [undefined], [5]])('rejects %p', (v) => expect(isHttpUrl(v)).toBe(false));
});

describe('qrFileName', () => {
  test('builds a file name from a valid table number', () => {
    expect(qrFileName(1)).toBe('maitred-table-1.png');
    expect(qrFileName(500)).toBe('maitred-table-500.png');
  });
  test.each([[0], [501], [1.5], ['3'], [null], [undefined], [-1], [Number.NaN]])('falls back for %p', (v) => expect(qrFileName(v)).toBe('maitred-table.png'));
  test('never contains the accented name', () => expect(qrFileName(7)).not.toMatch(/î/));
});
