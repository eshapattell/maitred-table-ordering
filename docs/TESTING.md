# Testing Checklist & Status

All automated tests adhere to project testing rules:
- Tested using Jest and Supertest.
- Isolated from real production/development database using `MONGO_URI_TEST` (must end with `_test`).
- Data cleared before each run.
- Coverage includes happy path, bad input, missing/invalid token, and wrong role.

## Route & Socket Event Test Checklist

| Route or Event | Expected Result | Test File | Status |
| :--- | :--- | :--- | :--- |
| `GET /api/health` | 200 OK, `{ status: "ok", app: "maitred" }` | `backend/server.test.js` | Passed |
| Unhandled route (`/api/unknown`) | 404 Not Found, JSON error message | `backend/server.test.js` | Passed |
| `notFound` middleware | Sets HTTP 404, forwards Error to `next()` | `backend/middleware/errorMiddleware.test.js` | Passed |
| `errorHandler` (development) | Returns JSON with `message` and `stack` | `backend/middleware/errorMiddleware.test.js` | Passed |
| `errorHandler` (production / other) | Returns JSON with only `message` (omits `stack`) | `backend/middleware/errorMiddleware.test.js` | Passed |

## Model Schema Validation Test Checklist

| Model / Feature | Expected Result | Test File | Status |
| :--- | :--- | :--- | :--- |
| `User` | Valid doc passes, missing required fields fail | `backend/models/models.test.js` | Passed |
| `Restaurant` | Valid doc passes, name required, ownerId optional | `backend/models/models.test.js` | Passed |
| `Table` | Valid doc passes, qrToken & restaurantId required | `backend/models/models.test.js` | Passed |
| `MenuItem` | Valid doc passes, name & price required | `backend/models/models.test.js` | Passed |
| `TableSession` | Valid doc passes, tableId required | `backend/models/models.test.js` | Passed |
| `Order` | Valid doc passes, sessionId required | `backend/models/models.test.js` | Passed |
| `Bill` | Valid doc passes, total required | `backend/models/models.test.js` | Passed |
| `Feedback` | Valid doc passes, rating required | `backend/models/models.test.js` | Passed |
| Enum Validation | Rejects invalid role, status, splitMode | `backend/models/models.test.js` | Passed |
| Range & Numerical Constraints | Rejects spiceLevel/rating not 1-5, negative price, cart qty 0 | `backend/models/models.test.js` | Passed |
| Bill Schema Purity | No paths contain "razorpay" or "payment" | `backend/models/models.test.js` | Passed |
| TableSession Partial Index | Unique on `tableId` with `status: "open"` | `backend/models/models.test.js` | Passed |

## Allergy Safety & Pool Builder Test Checklist

| Feature / Scenario | Expected Result | Test File | Status |
| :--- | :--- | :--- | :--- |
| `KNOWN_ALLERGENS` Constants | Frozen array containing exactly 10 recognized allergens | `backend/utils/allergyFilter.test.js` | Passed |
| `normaliseAllergen` & `normaliseAllergies` | Normalises casing/spacing, de-duplicates, drops invalid types | `backend/utils/allergyFilter.test.js` | Passed |
| `checkItemSafety` Clashes & Matches | Detects exact clashes, flags unrecognized guest allergens | `backend/utils/allergyFilter.test.js` | Passed |
| `checkItemSafety` Fail-Closed Rules | Rejects non-objects, non-arrays, non-strings, unconfirmed dishes | `backend/utils/allergyFilter.test.js` | Passed |
| `checkItemSafety` Zero-Allergy Exemption | Non-allergic guests can safely order unconfirmed dishes | `backend/utils/allergyFilter.test.js` | Passed |
| Single Allergen Isolation (`test.each`) | 10 individual allergen isolation tests pass | `backend/utils/allergyFilter.test.js` | Passed |
| `buildEligiblePool` Core Filters | Enforces availability, allergy safety, diet, dislikes, and budget | `backend/utils/buildEligiblePool.test.js` | Passed |
| `buildEligiblePool` Excluded IDs | Correctly excludes items by string `_id` / `id` | `backend/utils/buildEligiblePool.test.js` | Passed |
| Immutability & References | Preserves input objects without mutation, returns new array | `backend/utils/buildEligiblePool.test.js` | Passed |
| Monte-Carlo Safety Sweep | 200 random profiles over 40 dishes: 0 safety violations, completeness verified | `backend/utils/buildEligiblePool.test.js` | Passed |

## Test Database Guard & Token Utility Test Checklist

| Feature / Scenario | Expected Result | Test File | Status |
| :--- | :--- | :--- | :--- |
| `getDbName` extraction | Correctly extracts database names from Atlas, local, and multi-host URIs | `backend/config/testDb.test.js` | Passed |
| `assertSafeTestUri` safety guard | Enforces non-blank, distinct from main URI, ends with `_test` longer than 5 chars | `backend/config/testDb.test.js` | Passed |
| `generateToken` & `verifyToken` | Round-trip signing, correct claims (sub, role, restaurantId) | `backend/utils/generateToken.test.js` | Passed |
| Token tampering & algorithms | Rejects wrong secret, expired, tampered payload, alg "none", and HS512 | `backend/utils/generateToken.test.js` | Passed |
| Secret validation | Missing or <16 char JWT_SECRET throws clear error without leaking secret value | `backend/utils/generateToken.test.js` | Passed |

## Staff Authentication Routes (`/api/auth`) Test Checklist

| Route or Event | Expected Result | Test File | Status |
| :--- | :--- | :--- | :--- |
| `POST /api/auth/login` (Owner) | 200 OK, returns JWT token and safe public user with role "owner" | `backend/routes/authRoutes.test.js` | Passed |
| `POST /api/auth/login` (Kitchen) | 200 OK, returns JWT token and safe public user with role "kitchen" | `backend/routes/authRoutes.test.js` | Passed |
| `POST /api/auth/login` (Case insensitivity) | 200 OK with trimmed/cased email inputs | `backend/routes/authRoutes.test.js` | Passed |
| `POST /api/auth/login` (Credential failures) | 401 for wrong password or unknown email with identical message | `backend/routes/authRoutes.test.js` | Passed |
| `POST /api/auth/login` (Bad input / NoSQL injection) | 400 for missing credentials, non-string passwords, or `{ "$ne": null }` | `backend/routes/authRoutes.test.js` | Passed |
| `GET /api/auth/me` (Valid token) | 200 OK, returns authenticated database user profile | `backend/routes/authRoutes.test.js` | Passed |
| `GET /api/auth/me` (Token failures) | 401 for missing header, malformed Bearer, expired, wrong secret, deleted user | `backend/routes/authRoutes.test.js` | Passed |
| `POST /api/auth/staff` (Owner creates kitchen) | 201 Created, sets role "kitchen", owner restaurantId, new user can log in | `backend/routes/authRoutes.test.js` | Passed |
| `POST /api/auth/staff` (Role authorization) | 403 Forbidden for kitchen tokens (including forged token payload role) | `backend/routes/authRoutes.test.js` | Passed |
| `POST /api/auth/staff` (Input & duplicate validation) | 400 for bad name/email/short password, 409 Conflict for existing email | `backend/routes/authRoutes.test.js` | Passed |

## QR Generation Utilities Test Checklist

| Feature / Scenario | Expected Result | Test File | Status |
| :--- | :--- | :--- | :--- |
| `buildTableUrl` formatting | Correct base, route structure, trailing slash stripping, and fallback | `backend/utils/generateQR.test.js` | Passed |
| `buildTableUrl` URI encoding | Safely encodes spaces, ampersands, and special characters | `backend/utils/generateQR.test.js` | Passed |
| `generateQR` image data | Returns PNG base64 data URL (>1000 chars) with error correction 'M' | `backend/utils/generateQR.test.js` | Passed |
| `generateQR` validation | Throws on empty string, undefined, numbers, and null | `backend/utils/generateQR.test.js` | Passed |

## Public Restaurant Lookup (`/api/restaurants`) Test Checklist

| Route or Event | Expected Result | Test File | Status |
| :--- | :--- | :--- | :--- |
| `GET /api/restaurants/:id` (Known ID) | 200 OK, returns `{ restaurant: { id, name } }` (omits ownerId) | `backend/routes/restaurantRoutes.test.js` | Passed |
| `GET /api/restaurants/:id` (Public access) | 200 OK without requiring an Authorization header | `backend/routes/restaurantRoutes.test.js` | Passed |
| `GET /api/restaurants/:id` (Unknown ID) | 404 Not Found for non-existent valid ObjectId | `backend/routes/restaurantRoutes.test.js` | Passed |
| `GET /api/restaurants/:id` (Invalid ID) | 404 Not Found for invalid ID strings (`"not-an-id"`, `"123"`) | `backend/routes/restaurantRoutes.test.js` | Passed |

## Owner Table Management & QR Routes (`/api/tables`) Test Checklist

| Route or Event | Expected Result | Test File | Status |
| :--- | :--- | :--- | :--- |
| Authorization on all 4 endpoints | 401 without token, 403 for kitchen token, 401 for garbage token | `backend/routes/tableRoutes.test.js` | Passed |
| `POST /api/tables` (Valid creation) | 201 Created with 32-character hex qrToken, scoped to owner restaurant | `backend/routes/tableRoutes.test.js` | Passed |
| `POST /api/tables` (Input validation) | 400 for missing, 0, -1, 1.5, "3", 501, null, object, or array | `backend/routes/tableRoutes.test.js` | Passed |
| `POST /api/tables` (Uniqueness & isolation) | 409 for duplicate in same restaurant; succeeds in separate restaurant | `backend/routes/tableRoutes.test.js` | Passed |
| `POST /api/tables` (Body tampering) | Client-provided `restaurantId` in body is strictly ignored | `backend/routes/tableRoutes.test.js` | Passed |
| `GET /api/tables` (List & ordering) | 200 OK, returns owner tables sorted by number ascending | `backend/routes/tableRoutes.test.js` | Passed |
| `GET /api/tables/:id/qr` (QR Generation) | 200 OK with table info, canonical join URL, and valid QR PNG data URL | `backend/routes/tableRoutes.test.js` | Passed |
| `GET /api/tables/:id/qr` (Cross-tenant/format) | 404 for another restaurant's table or invalid ObjectId | `backend/routes/tableRoutes.test.js` | Passed |
| `DELETE /api/tables/:id` (Safe deletion) | 200 OK, deletes table from database | `backend/routes/tableRoutes.test.js` | Passed |
| `DELETE /api/tables/:id` (Active session check)| 409 Conflict if table has open session; 200 if only closed sessions | `backend/routes/tableRoutes.test.js` | Passed |
| `DELETE /api/tables/:id` (Cross-tenant/format)| 404 for another restaurant's table or invalid ObjectId | `backend/routes/tableRoutes.test.js` | Passed |

