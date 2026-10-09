// testDb.test.js: Unit tests for test database isolation guard
import { getDbName, assertSafeTestUri } from './testDb.js';

describe('testDb Guard: getDbName', () => {
  test('returns the correct database name for valid URIs', () => {
    expect(
      getDbName('mongodb+srv://user:pass@cluster0.mongodb.net/maitred_test?retryWrites=true&w=majority')
    ).toBe('maitred_test');

    expect(getDbName('mongodb://127.0.0.1:27017/maitred_test')).toBe('maitred_test');

    expect(
      getDbName('mongodb://h1:27017,h2:27017,h3:27017/maitred_test?replicaSet=rs0')
    ).toBe('maitred_test');

    expect(
      getDbName('mongodb://user:p%40ssword@localhost:27017/maitred_test')
    ).toBe('maitred_test');

    expect(
      getDbName('mongodb://localhost:27017/my%20test_app_test')
    ).toBe('my test_app_test');
  });

  test('returns empty string for non-strings or missing database names', () => {
    expect(getDbName(null)).toBe('');
    expect(getDbName(undefined)).toBe('');
    expect(getDbName(12345)).toBe('');
    expect(getDbName({})).toBe('');
    expect(getDbName('mongodb://localhost:27017/')).toBe('');
    expect(getDbName('mongodb://localhost:27017/?appName=testApp')).toBe('');
    expect(getDbName('postgres://localhost:5432/maitred_test')).toBe('');
  });
});

describe('testDb Guard: assertSafeTestUri', () => {
  const mainUri = 'mongodb://127.0.0.1:27017/maitred_prod';

  test('accepts safe test URIs ending with _test', () => {
    // Atlas mongodb+srv URI
    expect(
      assertSafeTestUri(
        'mongodb+srv://user:pass@cluster0.mongodb.net/maitred_test?retryWrites=true&w=majority',
        mainUri
      )
    ).toBe('maitred_test');

    // Local standard URI
    expect(
      assertSafeTestUri('mongodb://127.0.0.1:27017/maitred_test', mainUri)
    ).toBe('maitred_test');

    // Multi-host replica set URI
    expect(
      assertSafeTestUri(
        'mongodb://h1:27017,h2:27017,h3:27017/maitred_test?replicaSet=rs0',
        mainUri
      )
    ).toBe('maitred_test');

    // URI with percent-encoded credentials
    expect(
      assertSafeTestUri(
        'mongodb://user:p%40ssword@localhost:27017/maitred_test',
        mainUri
      )
    ).toBe('maitred_test');
  });

  test('refuses dangerous, invalid, or improperly named database URIs', () => {
    // Missing _test suffix (/maitred)
    expect(() =>
      assertSafeTestUri('mongodb://localhost:27017/maitred', mainUri)
    ).toThrow();

    // No database name (/?appName=x)
    expect(() =>
      assertSafeTestUri('mongodb://localhost:27017/?appName=x', mainUri)
    ).toThrow();

    // Database name is only "test" (/test)
    expect(() =>
      assertSafeTestUri('mongodb://localhost:27017/test', mainUri)
    ).toThrow();

    // Uppercase _TEST suffix (/MAITRED_TEST)
    expect(() =>
      assertSafeTestUri('mongodb://localhost:27017/MAITRED_TEST', mainUri)
    ).toThrow();

    // Database name is exactly "_test" (not longer than _test)
    expect(() =>
      assertSafeTestUri('mongodb://localhost:27017/_test', mainUri)
    ).toThrow();

    // Suffix extends past _test (/maitred_test_backup)
    expect(() =>
      assertSafeTestUri('mongodb://localhost:27017/maitred_test_backup', mainUri)
    ).toThrow();

    // Empty string
    expect(() => assertSafeTestUri('', mainUri)).toThrow();

    // Undefined
    expect(() => assertSafeTestUri(undefined, mainUri)).toThrow();

    // Blank string with whitespace
    expect(() => assertSafeTestUri('   ', mainUri)).toThrow();

    // Equal to main URI
    expect(() => assertSafeTestUri(mainUri, mainUri)).toThrow();

    // Different host that uses the same database name as main URI
    expect(() =>
      assertSafeTestUri('mongodb://remotehost:27017/maitred_prod', mainUri)
    ).toThrow();
  });
});
