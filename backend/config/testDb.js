// testDb.js: Test database connection and isolation guard for maitred
import dotenv from 'dotenv';
import mongoose from 'mongoose';

// Load environment variables so MONGO_URI_TEST is available
dotenv.config();

/**
 * Extracts and URL-decodes the database name from a MongoDB connection URI.
 * Uses regex instead of new URL() to handle multi-host replica set URIs.
 *
 * @param {string} uri - MongoDB connection string
 * @returns {string} Extracted database name or empty string if invalid/missing
 */
export const getDbName = (uri) => {
  if (typeof uri !== 'string') {
    return '';
  }
  const match = uri.match(/^mongodb(?:\+srv)?:\/\/[^/]+\/([^/?]*)/);
  if (!match || !match[1]) {
    return '';
  }
  try {
    return decodeURIComponent(match[1]);
  } catch {
    return match[1];
  }
};

/**
 * Validates that the test URI is completely isolated from production and development databases.
 *
 * Viva note: An Atlas URI with no database name (e.g. mongodb+srv://.../?) silently defaults
 * to the "test" database. Because test cleanup deletes all data, we strictly mandate that the
 * test database name ends with "_test" (and is longer than just "_test") and differs from the
 * main database name.
 *
 * @param {string} testUri - process.env.MONGO_URI_TEST
 * @param {string} mainUri - process.env.MONGO_URI
 * @returns {string} Validated test database name
 */
export const assertSafeTestUri = (testUri, mainUri) => {
  if (typeof testUri !== 'string' || testUri.trim().length === 0) {
    throw new Error('MONGO_URI_TEST must be a non-blank string');
  }

  if (testUri === mainUri) {
    throw new Error('MONGO_URI_TEST cannot be identical to MONGO_URI');
  }

  const testDbName = getDbName(testUri);
  if (!testDbName || !testDbName.endsWith('_test') || testDbName.length <= 5) {
    throw new Error(
      `MONGO_URI_TEST database name ("${testDbName}") must end with "_test" and be longer than "_test"`
    );
  }

  if (mainUri && typeof mainUri === 'string') {
    const mainDbName = getDbName(mainUri);
    if (mainDbName && testDbName === mainDbName) {
      throw new Error(
        `MONGO_URI_TEST database name ("${testDbName}") must differ from MONGO_URI database name ("${mainDbName}")`
      );
    }
  }

  return testDbName;
};

/**
 * Connects to the isolated test database after strict safety validation.
 */
export const connectTestDb = async () => {
  const testUri = process.env.MONGO_URI_TEST;
  const mainUri = process.env.MONGO_URI;

  assertSafeTestUri(testUri, mainUri);

  await mongoose.connect(testUri);

  const connectionName = mongoose.connection.name;
  if (!connectionName || !connectionName.endsWith('_test') || connectionName.length <= 5) {
    await mongoose.disconnect();
    throw new Error(
      `Connected to unsafe database "${connectionName}". Aborting connection because database name must end with "_test".`
    );
  }
};

/**
 * Clears all data from the test database between test runs.
 * Deletes documents collection by collection to preserve database indexes.
 */
export const clearTestDb = async () => {
  const connectionName = mongoose.connection.name;
  if (!connectionName || !connectionName.endsWith('_test') || connectionName.length <= 5) {
    throw new Error(
      `Refusing to clear database "${connectionName}": database name must end with "_test".`
    );
  }

  const collections = mongoose.connection.collections;
  await Promise.all(
    Object.values(collections).map((collection) => collection.deleteMany({}))
  );
};

/**
 * Disconnects Mongoose from the test database.
 */
export const disconnectTestDb = async () => {
  await mongoose.disconnect();
};
