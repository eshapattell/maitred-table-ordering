import { describe, test, expect } from 'vitest';
import { normalisePhone } from '../../../backend/utils/phone.js';
import { sanitiseNickname } from '../../../backend/utils/sessionRules.js';
import { normalisePhoneInput, cleanNickname, parseJoinLink, validateJoinForm, joinErrorMessage, JOIN_MESSAGES } from './guestJoin.js';

// A small seeded generator so the "random" inputs are the same on every run.
const makeRand = (seed) => () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; };
const pick = (rand, list) => list[Math.floor(rand() * list.length)];

describe('normalisePhoneInput gives exactly the same answer as the backend normalisePhone', () => {
  const curated = [
    '9824079988', '98240 79988', '+91 98240 79988', '09824079988', '91-9824079988', '(98240) 79988', '+919824079988', '919824079988',
    '', ' ', '   9824079988   ', '5824079988', '98240799', '982407998800', '+1 9824079988', '+91', '+', '++919824079988', '9824-07-9988',
    '9824079988a', 'abc', '98240 79988 ', '０９８２４０７９９８８', '+91 5824079988', '0 9824079988', '00919824079988', '91 98240 79988',
    '98240\t79988', '98240\n79988', null, undefined, 5, {}, [], '9'.repeat(21), '6000000000', '9999999999', '0000000000', '+91 (98240) 79-988',
  ];
  test.each(curated.map((v) => [JSON.stringify(v), v]))('curated input %s', (_label, value) => {
    expect(normalisePhoneInput(value)).toBe(normalisePhone(value));
  });
  test('3000 generated inputs built from phone-like pieces', () => {
    const rand = makeRand(20260101);
    const prefixes = ['', '+91', '91', '0', '+', '+1', '(', '00'];
    const glue = ['', ' ', '-', '  ', '(', ')'];
    for (let i = 0; i < 3000; i++) {
      let text = pick(rand, prefixes);
      const groups = 1 + Math.floor(rand() * 4);
      for (let g = 0; g < groups; g++) {
        const len = 1 + Math.floor(rand() * 6);
        let digits = '';
        for (let d = 0; d < len; d++) digits += String(Math.floor(rand() * 10));
        text += pick(rand, glue) + digits;
      }
      if (rand() < 0.1) text += pick(rand, ['x', '.', '#', '+']);
      expect(normalisePhoneInput(text), JSON.stringify(text)).toBe(normalisePhone(text));
    }
  });
  test('3000 generated inputs from a wild alphabet', () => {
    const rand = makeRand(777);
    const alphabet = [...'0123456789', '+', ' ', '-', '(', ')', 'a', '.', '\t', '٣', '९'];
    for (let i = 0; i < 3000; i++) {
      const length = Math.floor(rand() * 23);
      let text = '';
      for (let c = 0; c < length; c++) text += pick(rand, alphabet);
      expect(normalisePhoneInput(text), JSON.stringify(text)).toBe(normalisePhone(text));
    }
  });
  test('the well-known formats all normalise to +919824079988', () => {
    for (const text of ['9824079988', '98240 79988', '+91 98240 79988', '09824079988', '91-9824079988']) {
      expect(normalisePhoneInput(text)).toBe('+919824079988');
    }
  });
});

describe('cleanNickname gives exactly the same answer as the backend sanitiseNickname', () => {
  const curated = [
    'Ravi', '  Ravi   Kumar  ', "O'Connor-Smith Jr.", 'रवि', 'અમિત', 'Zoë', 'e\u0301', 'A'.repeat(30), 'A'.repeat(31), '', '   ', '<b>x</b>', 'a<b', '😀', 'Ravi😀',
    '1st', '-dash', '.dot', "'quote", ' .x', 'a_b', 'a/b', 'a\tb', 'a\nb', 'a\u200db', 'ñandú', 'नमस्ते', 'ગુજરાતી', 'A B C', 'x'.repeat(29) + 'é', '१२३', null, undefined, 5, {},
  ];
  test.each(curated.map((v) => [JSON.stringify(v), v]))('curated input %s', (_label, value) => {
    expect(cleanNickname(value)).toBe(sanitiseNickname(value));
  });
  test('4000 generated inputs', () => {
    const rand = makeRand(424242);
    const pieces = ['a', 'Z', 'ravi', ' ', '  ', '.', "'", '-', '1', 'é', 'र', 'ि', 'વ', 'ા', '😀', '<', '>', '_', '\t', '\n', '\u200d', 'e\u0301', '/', '(', '9', 'ñ', 'ク', 'ٱ'];
    for (let i = 0; i < 4000; i++) {
      const count = Math.floor(rand() * 36);
      let text = '';
      for (let c = 0; c < count; c++) text += pick(rand, pieces);
      expect(cleanNickname(text), JSON.stringify(text)).toBe(sanitiseNickname(text));
    }
  });
});

describe('parseJoinLink', () => {
  const good = { restaurantId: '65f0c0ffee65f0c0ffee65f0', tableNo: '5', token: 'a'.repeat(32) };
  test('a good link gives the join fields, with the table number as a NUMBER', () => {
    expect(parseJoinLink(good)).toEqual({ ok: true, restaurantId: good.restaurantId, tableNumber: 5, qrToken: good.token });
  });
  test('upper-case hex is fine in the restaurant id, as the server allows', () => {
    expect(parseJoinLink({ ...good, restaurantId: '65F0C0FFEE65F0C0FFEE65F0' }).ok).toBe(true);
  });
  test.each([['short', '65f0c0ff'], ['25 characters', '65f0c0ffee65f0c0ffee65f0a'], ['not hex', 'zzf0c0ffee65f0c0ffee65f0'], ['empty', ''], ['number', 5], ['undefined', undefined]])(
    'restaurant id %s is rejected', (_l, restaurantId) => expect(parseJoinLink({ ...good, restaurantId }).ok).toBe(false));
  test.each([['0'], ['501'], ['05'], ['1.5'], ['abc'], [''], ['-1'], ['1e2'], [' 5'], ['5 '], [5], [undefined], ['1000']])(
    'table number %p is rejected', (tableNo) => expect(parseJoinLink({ ...good, tableNo }).ok).toBe(false));
  test.each([['1'], ['500'], ['99']])('table number %s is accepted', (tableNo) => expect(parseJoinLink({ ...good, tableNo }).ok).toBe(true));
  test.each([['31 characters', 'a'.repeat(31)], ['33 characters', 'a'.repeat(33)], ['upper case', 'A'.repeat(32)], ['not hex', 'g'.repeat(32)], ['empty', ''], ['missing', undefined], ['array', ['a'.repeat(32)]]])(
    'token %s is rejected', (_l, token) => expect(parseJoinLink({ ...good, token }).ok).toBe(false));
  test('a missing argument never throws', () => {
    expect(parseJoinLink().ok).toBe(false);
    expect(parseJoinLink({}).ok).toBe(false);
    expect(parseJoinLink(null)).toEqual({ ok: false });
  });
});

describe('validateJoinForm', () => {
  test('a good form gives the normalised phone and the cleaned name', () => {
    expect(validateJoinForm({ phone: '98240 79988', nickname: '  Ravi   Kumar ' })).toEqual({
      valid: true, errors: {}, values: { phone: '+919824079988', nickname: 'Ravi Kumar' },
    });
  });
  test('an empty form reports both fields at once', () => {
    const r = validateJoinForm({ phone: '', nickname: '' });
    expect(r.valid).toBe(false);
    expect(r.errors).toEqual({ phone: JOIN_MESSAGES.phoneMissing, nickname: JOIN_MESSAGES.nicknameMissing });
    expect(r.values).toBeNull();
  });
  test('wrong values give the "invalid" wording, not the "missing" wording', () => {
    const r = validateJoinForm({ phone: '12345', nickname: '<b>x</b>' });
    expect(r.errors).toEqual({ phone: JOIN_MESSAGES.phoneInvalid, nickname: JOIN_MESSAGES.nicknameInvalid });
  });
  test('only one field wrong reports only that field', () => {
    expect(Object.keys(validateJoinForm({ phone: '9824079988', nickname: '' }).errors)).toEqual(['nickname']);
    expect(Object.keys(validateJoinForm({ phone: 'abc', nickname: 'Ravi' }).errors)).toEqual(['phone']);
  });
  test('non-string input never throws and is invalid', () => {
    for (const bad of [null, undefined, 5, {}, []]) {
      expect(validateJoinForm({ phone: bad, nickname: bad }).valid).toBe(false);
    }
    expect(validateJoinForm().valid).toBe(false);
    expect(validateJoinForm(null).valid).toBe(false);
  });
});

describe('joinErrorMessage', () => {
  const fail = (status, code) => ({ response: { status, data: { code, message: 'SERVER TEXT MUST NOT APPEAR' } } });
  test.each([
    ['TABLE_NOT_FOUND', 404, JOIN_MESSAGES.tableNotFound], ['PHONE_ACTIVE_ELSEWHERE', 409, JOIN_MESSAGES.phoneElsewhere],
    ['ALREADY_JOINED', 409, JOIN_MESSAGES.alreadyJoined], ['TABLE_FULL', 409, JOIN_MESSAGES.tableFull],
    ['TRY_AGAIN', 503, JOIN_MESSAGES.tryAgain], ['INVALID_INPUT', 400, JOIN_MESSAGES.invalidInput],
  ])('code %s', (code, status, expected) => expect(joinErrorMessage(fail(status, code))).toBe(expected));
  test('no response at all (network, timeout) says so', () => {
    expect(joinErrorMessage(new Error('Network Error'))).toBe(JOIN_MESSAGES.network);
    expect(joinErrorMessage({})).toBe(JOIN_MESSAGES.network);
  });
  test('a 503 or 429 without a code still gets sensible wording', () => {
    expect(joinErrorMessage({ response: { status: 503, data: {} } })).toBe(JOIN_MESSAGES.tryAgain);
    expect(joinErrorMessage({ response: { status: 429, data: {} } })).toBe(JOIN_MESSAGES.tooMany);
  });
  test('anything else is the generic message, and the server text is never shown', () => {
    expect(joinErrorMessage({ response: { status: 500 } })).toBe(JOIN_MESSAGES.generic);
    expect(joinErrorMessage(fail(418, 'SOMETHING_NEW'))).toBe(JOIN_MESSAGES.generic);
    for (const code of ['TABLE_NOT_FOUND', 'TABLE_FULL', 'X']) expect(joinErrorMessage(fail(400, code))).not.toMatch(/SERVER TEXT/);
  });
  test('every message is a non-empty string and the messages are frozen', () => {
    expect(Object.isFrozen(JOIN_MESSAGES)).toBe(true);
    for (const value of Object.values(JOIN_MESSAGES)) expect(typeof value === 'string' && value.length > 5).toBe(true);
  });
});
