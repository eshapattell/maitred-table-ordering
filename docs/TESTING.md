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
| `closeOrphanSessions` helper | Closes open sessions for table, leaves closed/other open sessions untouched, 0 if empty | `backend/routes/tableRoutes.test.js` | Passed |

## Menu Management & Public Routes (`/api/menu`) Test Checklist

| Route or Feature | Expected Result | Test File | Status |
| :--- | :--- | :--- | :--- |
| `GET /api/menu/:restaurantId` (Public) | 200 OK with available items; excludes unavailable & other restaurants | `backend/routes/menuRoutes.test.js` | Passed |
| `GET /api/menu/:restaurantId` (Key whitelisting) | Strict public projection (exact 14 keys; no internal fields or timestamps) | `backend/routes/menuRoutes.test.js` | Passed |
| `GET /api/menu/:restaurantId` (Public access) | 200 OK without token; 404 on unknown or invalid restaurantId | `backend/routes/menuRoutes.test.js` | Passed |
| `GET /api/menu` (Staff access) | 200 OK for owner & kitchen; includes unavailable items with available key | `backend/routes/menuRoutes.test.js` | Passed |
| `GET /api/menu` (Auth failures) | 401 without token or with garbage token | `backend/routes/menuRoutes.test.js` | Passed |
| `POST /api/menu` (Owner creation) | 201 Created; forces allergensConfirmed: false, normalises allergens, defaults desc | `backend/routes/menuRoutes.test.js` | Passed |
| `POST /api/menu` (Empty allergens) | 201 Created with explicit `[]` allergens | `backend/routes/menuRoutes.test.js` | Passed |
| `POST /api/menu` (Missing allergens) | 400 Bad Request; missing allergens is never read as "none" | `backend/routes/menuRoutes.test.js` | Passed |
| `POST /api/menu` (Field validation sweep) | 400 Bad Request on invalid name, price, category, veg, allergens, spice, etc. | `backend/routes/menuRoutes.test.js` | Passed |
| `POST /api/menu` (Role authorization) | 403 Forbidden for kitchen; 401 without token | `backend/routes/menuRoutes.test.js` | Passed |
| `PATCH /api/menu/:itemId` (Partial update) | 200 OK on editable fields; price persists; resets allergensConfirmed if tags change | `backend/routes/menuRoutes.test.js` | Passed |
| `PATCH /api/menu/:itemId` (Unchanged allergens) | Retains allergensConfirmed: true and leaves stored array untouched | `backend/routes/menuRoutes.test.js` | Passed |
| `PATCH /api/menu/:itemId` (Non-editable fields) | 400 "Nothing to update" if only available/restaurantId/allergensConfirmed sent | `backend/routes/menuRoutes.test.js` | Passed |
| `PATCH /api/menu/:itemId` (Auth & scoping) | 404 for restaurant B or invalid id; 403 for kitchen; 401 without token | `backend/routes/menuRoutes.test.js` | Passed |
| `POST /api/menu/:itemId/confirm-allergens` | 200 OK sets allergensConfirmed: true; idempotent on repeated confirmation | `backend/routes/menuRoutes.test.js` | Passed |
| `POST /api/menu/:itemId/confirm-allergens` (Validation) | 400 on missing allergens, non-array, or unknown tag | `backend/routes/menuRoutes.test.js` | Passed |
| `POST /api/menu/:itemId/confirm-allergens` (Mismatch) | 409 Conflict if reviewed tags differ from stored; stays unconfirmed | `backend/routes/menuRoutes.test.js` | Passed |
| `POST /api/menu/:itemId/confirm-allergens` (Auth & scoping) | 403 for kitchen; 401 without token; 404 for restaurant B or invalid id | `backend/routes/menuRoutes.test.js` | Passed |
| `PATCH /api/menu/:itemId/availability` | 200 OK toggles available true/false for both owner and kitchen | `backend/routes/menuRoutes.test.js` | Passed |
| `PATCH /api/menu/:itemId/availability` (Input & scoping) | 400 on non-boolean; 404 on restaurant B or invalid id; 401 without token | `backend/routes/menuRoutes.test.js` | Passed |
| `DELETE /api/menu/:itemId` (No delete) | 404 Not Found; dish remains in database to protect order integrity | `backend/routes/menuRoutes.test.js` | Passed |
| Safety core integration (`buildEligiblePool`) | Unconfirmed dishes excluded for allergic diners; included after confirmation | `backend/routes/menuRoutes.test.js` | Passed |

## Seed Dataset & Database Seeder Engine Test Checklist

| Feature / Scenario | Expected Result | Test File | Status |
| :--- | :--- | :--- | :--- |
| Static dataset integrity (`menu.json`) | Array of exactly 24 dishes with unique case-insensitive names | `backend/data/seed.test.js` | Passed |
| Mongoose validation (`menu.json`) | All 24 dishes pass MenuItem schema validation; correct fields & types | `backend/data/seed.test.js` | Passed |
| Taxonomy & course coverage | All 10 allergens used, >=4 allergen-free, >=6 veg, >=6 non-veg, all courses represented | `backend/data/seed.test.js` | Passed |
| Vegetarian consistency | No isVeg dish carries fish/shellfish allergens or meat/seafood keywords | `backend/data/seed.test.js` | Passed |
| Ingredient keyword safety net | 10 allergen keyword checks verify every dish declaring ingredients carries tags | `backend/data/seed.test.js` | Passed |
| `assertSeedAllowed` guards | Allows development; throws for "test", ending with `_test`, empty, or production | `backend/data/seed.test.js` | Passed |
| Idempotent seeding (`seedDatabase`) | Creates restaurant, owner, kitchen, tables 1-6 (32-hex tokens), and 24 items | `backend/data/seed.test.js` | Passed |
| Seeder re-run safety | 2nd run creates 0 entities, preserves table tokens and owner passwordHash | `backend/data/seed.test.js` | Passed |
| Seeded credential authentication | Seeded owner logs in with seed password through POST /api/auth/login; 401 on wrong | `backend/data/seed.test.js` | Passed |
| Password length validation | Rejects missing, <8 characters, or >72 bytes passwords in `seedDatabase` | `backend/data/seed.test.js` | Passed |
| Public menu access for seeded data | `GET /api/menu/:restaurantId` returns all 24 seeded dishes | `backend/data/seed.test.js` | Passed |
| Safety core with seeded items | Allergic guest gets safe pool; 10-allergy guest gets allergen-free; non-allergic gets 24 | `backend/data/seed.test.js` | Passed |

## Known gaps

| Gap | Closed by | Proven by | Status |
| :--- | :--- | :--- | :--- |
| Table delete vs guest join race | delete side: Task 5b; join side: session task (after creating or finding the session, re-check the table still exists, otherwise close the session and answer 404) | closeOrphanSessions tests now; join re-check test in the session task | half closed |
| Missing JWT_SECRET shows as 401 in protect instead of failing at startup | hardening task | pending | open |
| No rate limit on login | hardening task (needs express-rate-limit, needs my approval) | pending | open |
| Malformed JSON body: confirm it answers 400, not 500 | hardening task | pending | open |
| Table QR token is a static secret, so a photo of the QR lets anyone join | rotate-token route in the hardening task | pending | open |
| $inc skips the min 1 rule on cart qty | cart task | pending | open |
| Guest allergies must be declared before any cart action (allergiesDeclared) | session task | pending | open |
| Unique open-session index is declared but not proven against the real database | session task | pending | open |
| Frontend allergen list must match KNOWN_ALLERGENS exactly | frontend foundation task | pending | open |
| npm audit: review production dependencies before submission | final review | pending | open |
| Public menu returns raw allergen tags: guest screens must use the server-computed safe flag from the session menu and never compute safety in the client | session task and frontend tasks | pending | open |
| Menu item names are not unique per restaurant (needs a unique index, which is a model change) | hardening task | pending | open |
| Seeded demo accounts must never exist in a deployed database (seed already refuses production) | final review | assertSeedAllowed tests now | half closed |
| Demo menu allergen tags are checked by keyword rules and a manual skim, not by a food safety professional | final review (owner skims; the report states the limitation) | pending | open |
