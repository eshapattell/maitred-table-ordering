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
| `errorHandler` (development) | Returns JSON with real `message` and `stack` | `backend/middleware/errorMiddleware.test.js` | Passed |
| `errorHandler` (production / other) | Returns 500 `{ message: "Internal Server Error" }` (omits `stack`) | `backend/middleware/errorMiddleware.test.js` | Passed |
| `errorHandler` (headersSent) | Delegates to `next(err)` and writes nothing to response | `backend/middleware/errorMiddleware.test.js` | Passed |
| `errorHandler` (4xx preservation) | Retains `err.message` for status < 500 outside development | `backend/middleware/errorMiddleware.test.js` | Passed |
| `errorHandler` (status ranges) | Respects `err.status` / `err.statusCode` between 400 and 599 | `backend/middleware/errorMiddleware.test.js` | Passed |
| `errorHandler` (fallback status) | Uses `res.statusCode` only when >= 400; below 400 (201, 302) forces 500 | `backend/middleware/errorMiddleware.test.js` | Passed |
| `errorHandler` (JSON parse error) | `entity.parse.failed` gives 400 `{ message: "Invalid JSON body" }` | `backend/middleware/errorMiddleware.test.js` | Passed |
| `errorHandler` (Payload too large) | `entity.too.large` gives 413 `{ message: "Payload too large" }` | `backend/middleware/errorMiddleware.test.js` | Passed |
| `errorHandler` (Quieter logging) | Statuses < 500 (404, 400, 413) produce NO `console.error` call | `backend/middleware/errorMiddleware.test.js` | Passed |
| `errorHandler` (5xx safe logging) | 5xx produces 1 call with `[maitred]` + message; never leaks `err.body` (e.g. hunter2) | `backend/middleware/errorMiddleware.test.js` | Passed |
| Body parser error handling | Malformed JSON: 400 "Invalid JSON body"; 200KB body: 413 "Payload too large"; {}: 400 | `backend/server.test.js` | Passed |

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
| TableSession Partial Index | Unique on `tableId` with `status: "open"` | `backend/models/models.test.js` | Passed |
| TableSession DB Index Verified | `collection.indexes()` unique index with `partialFilterExpression: { status: "open" }` | `backend/models/tableSessionIndex.test.js` | Passed |
| Two open sessions clash | Second open create for same tableId rejects with MongoDB error 11000 | `backend/models/tableSessionIndex.test.js` | Passed |
| Open + closed / multiple closed | One open + one closed allowed; multiple closed sessions for same table allowed | `backend/models/tableSessionIndex.test.js` | Passed |
| Re-opening closed table | After open session closed via updateOne, a new open session succeeds | `backend/models/tableSessionIndex.test.js` | Passed |
| Multi-table session isolation | Two distinct tables can each maintain one open session concurrently | `backend/models/tableSessionIndex.test.js` | Passed |
| Concurrent session creation | Promise.all simultaneous creates: exactly 1 succeeds, 1 rejects with 11000 | `backend/models/tableSessionIndex.test.js` | Passed |

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
| `assertJwtSecret` startup guard | Passes for >=16 char; throws with code JWT_SECRET_INVALID without leaking secret | `backend/utils/generateToken.test.js` | Passed |

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
| `GET /api/auth/me` (Invalid JWT_SECRET) | 500 Internal Server Error (not 401) on misconfigured secret, recovers when restored | `backend/routes/authRoutes.test.js` | Passed |
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
| Authorization on all 5 endpoints | 401 without token, 403 for kitchen token, 401 for garbage token | `backend/routes/tableRoutes.test.js` | Passed |
| `POST /api/tables` (Valid creation) | 201 Created with 32-character hex qrToken, scoped to owner restaurant | `backend/routes/tableRoutes.test.js` | Passed |
| `POST /api/tables` (Input validation) | 400 for missing, 0, -1, 1.5, "3", 501, null, object, or array | `backend/routes/tableRoutes.test.js` | Passed |
| `POST /api/tables` (Uniqueness & isolation) | 409 for duplicate in same restaurant; succeeds in separate restaurant | `backend/routes/tableRoutes.test.js` | Passed |
| `POST /api/tables` (Body tampering) | Client-provided `restaurantId` in body is strictly ignored | `backend/routes/tableRoutes.test.js` | Passed |
| `GET /api/tables` (List & ordering) | 200 OK, returns owner tables sorted by number ascending | `backend/routes/tableRoutes.test.js` | Passed |
| `GET /api/tables/:id/qr` (QR Generation) | 200 OK with table info, canonical join URL, and valid QR PNG data URL | `backend/routes/tableRoutes.test.js` | Passed |
| `GET /api/tables/:id/qr` (Cross-tenant/format) | 404 for another restaurant's table or invalid ObjectId | `backend/routes/tableRoutes.test.js` | Passed |
| `POST /api/tables/:id/rotate-token` (Owner rotation) | 200 OK, new 32-hex token, updates QR URL, leaves open session active | `backend/routes/tableRoutes.test.js` | Passed |
| `POST /api/tables/:id/rotate-token` (Auth & scoping) | 404 for restaurant B or invalid ID, 403 for kitchen, 401 without token | `backend/routes/tableRoutes.test.js` | Passed |
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
| `confirm-allergens` (Empty tag list) | Confirm with `[]` gives 200 and allergensConfirmed true; repeated confirm stays true | `backend/routes/menuRoutes.test.js` | Passed |
| `confirm-allergens` (Order and casing) | Dish with `["soy","dairy","peanut"]` confirmed with `[" PEANUT ","Dairy","soy"]` -> 200, true | `backend/routes/menuRoutes.test.js` | Passed |
| `confirm-allergens` (Stale review screen) | Allergen edit invalidates confirmation; old list gives 409; new list confirms | `backend/routes/menuRoutes.test.js` | Passed |
| `PATCH /api/menu/:itemId` (Price edit confirmation) | Confirmed dish price edit keeps true and preserves fields; allergen edit resets | `backend/routes/menuRoutes.test.js` | Passed |
| `PATCH /api/menu/:itemId` (Tag immutability) | Unsorted raw array in DB preserved when same tags re-sent in edit | `backend/routes/menuRoutes.test.js` | Passed |
| DB exact array matching (direct calls) | Matches exact array order for [], changed tags give matchedCount 0 / 1 | `backend/routes/menuRoutes.test.js` | Passed |
| Simulated concurrent edit | Conditional update catches matchedCount 0 race condition, answers 409 | `backend/routes/menuRoutes.test.js` | Passed |

## Seed Dataset & Database Seeder Engine Test Checklist

| Feature / Scenario | Expected Result | Test File | Status |
| :--- | :--- | :--- | :--- |
| Static dataset integrity (`menu.json`) | Array of exactly 24 dishes with unique case-insensitive names | `backend/data/seed.test.js` | Passed |
| Mongoose validation (`menu.json`) | All 24 dishes pass MenuItem schema validation; correct fields & types | `backend/data/seed.test.js` | Passed |
| Taxonomy & course coverage | All 10 allergens used, >=4 allergen-free, >=6 veg, >=6 non-veg, all courses represented | `backend/data/seed.test.js` | Passed |
| Vegetarian consistency | No isVeg dish carries fish/shellfish allergens or meat/seafood keywords | `backend/data/seed.test.js` | Passed |
| Egg allergen consistency | Every dish whose allergens include "egg" has isVeg false | `backend/data/seed.test.js` | Passed |
| Strengthened ingredient safety net | 10 allergen checks with soy sauce, pasta shapes, lecithin, mousse & longest exception stripping | `backend/data/seed.test.js` | Passed |
| Ingredient rule unit tests | Verified tamari, gluten-free soy sauce, sunflower lecithin, egg-free mousse, and flagging | `backend/data/seed.test.js` | Passed |
| `assertSeedAllowed` guards | Allows development; throws for "test", ending with `_test`, empty, or production | `backend/data/seed.test.js` | Passed |
| Idempotent seeding (`seedDatabase`) | Creates restaurant, owner, kitchen, tables 1-6 (32-hex tokens), and 24 items | `backend/data/seed.test.js` | Passed |
| Seeder re-run safety | 2nd run creates 0 entities, preserves table tokens and owner passwordHash | `backend/data/seed.test.js` | Passed |
| Seeded credential authentication | Seeded owner logs in with seed password through POST /api/auth/login; 401 on wrong | `backend/data/seed.test.js` | Passed |
| Password length validation | Rejects missing, <8 characters, or >72 bytes passwords in `seedDatabase` | `backend/data/seed.test.js` | Passed |
| Public menu access for seeded data | `GET /api/menu/:restaurantId` returns all 24 seeded dishes | `backend/data/seed.test.js` | Passed |
| Safety core with seeded items | Allergic guest gets safe pool; 10-allergy guest gets allergen-free; non-allergic gets 24 | `backend/data/seed.test.js` | Passed |

## Table Session Models & Indexes (Task 9a)

| Feature / Scenario | Expected Result | Test File | Status |
| :--- | :--- | :--- | :--- |
| `TableSession` & `Participant` Field Defaults | hostId null, lastActivityAt Date, closedAt null, closedReason null, phone null, phoneVerified false, role 'guest', status 'pending', allergiesDeclared false, joinedAt Date | `backend/models/models.test.js` | Passed |
| `participant.role` Enum Validation | Rejects non-allowed roles (e.g. 'superuser'); accepts 'host' and 'guest' | `backend/models/models.test.js` | Passed |
| `participant.status` Enum Validation | Rejects non-allowed status (e.g. 'active'); accepts 'approved' and 'pending' | `backend/models/models.test.js` | Passed |
| `TableSession.closedReason` Enum Validation | Rejects invalid reasons; accepts 'reset', 'rejected', 'timeout', 'table-removed' | `backend/models/models.test.js` | Passed |
| Phone Partial Unique Index Schema Definition | Schema defines unique on `participants.phone` with partialFilterExpression `{ status: "open", "participants.phone": { $type: "string" } }` | `backend/models/models.test.js` | Passed |
| Phone Multi-key Partial Unique Index Enforcement | Two open sessions with same phone: 2nd create rejects with code 11000 and keyPattern `participants.phone` | `backend/models/tableSessionIndex.test.js` | Passed |
| Phone Index Open vs Closed Status Exemption | Same phone allowed across one open and one closed session, or multiple closed sessions | `backend/models/tableSessionIndex.test.js` | Passed |
| Re-opening Session After `closeSession` | `closeSession` nulls phones; new open session with that phone succeeds | `backend/models/tableSessionIndex.test.js` | Passed |
| Null Phone Multiple Open Sessions | Null phone entries across different open sessions are allowed (sparse multi-key) | `backend/models/tableSessionIndex.test.js` | Passed |
| `closeSession` Idempotency & Data Minimization | Safe to call twice (2nd returns false); sets closedReason, closedAt, and nulls every phone while keeping nicknames | `backend/models/tableSessionIndex.test.js` | Passed |
| `closeOrphanSessions` Deletion Cleanup | Sets closedReason "table-removed", closedAt Date, and nulls every phone | `backend/routes/tableRoutes.test.js` | Passed |

## Guest Token Generation & Audience Isolation (Task 9a)

| Feature / Scenario | Expected Result | Test File | Status |
| :--- | :--- | :--- | :--- |
| `generateGuestToken` & `verifyGuestToken` Round-trip | Signs and decodes sub (participantId), sid (sessionId), aud "maitred-guest", 8h expiry | `backend/utils/generateToken.test.js` | Passed |
| Audience Isolation: Staff Token Rejection | Staff token without audience fails `verifyGuestToken` | `backend/utils/generateToken.test.js` | Passed |
| Audience Isolation: Guest Token Rejection | Guest token with audience fails `verifyToken` with plain Error "Staff token cannot contain audience claim" | `backend/utils/generateToken.test.js` | Passed |
| Expired / Tampered / Wrong Secret / None Alg | Guest token verification rejects expired, tampered payload, different secret, and alg "none" | `backend/utils/generateToken.test.js` | Passed |
| Invalid `JWT_SECRET` Error Code | Throws Error with `.code = 'JWT_SECRET_INVALID'` without leaking secret value | `backend/utils/generateToken.test.js` | Passed |

## Session Middleware & Lifecycle Guards (Task 9a)

| Feature / Scenario | Expected Result | Test File | Status |
| :--- | :--- | :--- | :--- |
| `guestAuth` Missing/Malformed Header | Returns 401 `{ message: "Not authorised", code: "INVALID_TOKEN" }` | `backend/middleware/sessionMiddleware.test.js` | Passed |
| `guestAuth` Invalid/Garbage Token | Returns 401 `{ message: "Not authorised", code: "INVALID_TOKEN" }` | `backend/middleware/sessionMiddleware.test.js` | Passed |
| `guestAuth` `JWT_SECRET_INVALID` Propagation | Forwards error to `next(err)` instead of 401 client error | `backend/middleware/sessionMiddleware.test.js` | Passed |
| `guestAuth` Invalid sid or missing sub | Returns 401 `{ message: "Not authorised", code: "INVALID_TOKEN" }` | `backend/middleware/sessionMiddleware.test.js` | Passed |
| `requireHost` Guard | 403 NOT_HOST when missing guest, role 'guest', or status 'pending'; passes for approved host | `backend/middleware/sessionMiddleware.test.js` | Passed |
| `requireAllergiesDeclared` Guard | 403 ALLERGIES_REQUIRED when allergiesDeclared is false or undefined; passes when true | `backend/middleware/sessionMiddleware.test.js` | Passed |
| Token Algorithm Strictness | Rejects token signed with HS512 with 401 INVALID_TOKEN | `backend/middleware/sessionMiddleware.test.js` | Passed |
| `guestAuth` Fail-Closed Status | 401 PARTICIPANT_REMOVED when participant status is anything other than "approved" or "pending" | `backend/middleware/sessionMiddleware.test.js` & `backend/routes/sessionRoutes.test.js` | Passed |

## Table Session Integration Routes (`/api/sessions`) Test Checklist (Task 9a)

| Route / Feature | Expected Result | Test File | Status |
| :--- | :--- | :--- | :--- |
| `POST /api/sessions/join` (First guest) | 201 Created; role "host", status "approved", token returned, normalised phone stored, unmasked phone never in response | `backend/routes/sessionRoutes.test.js` | Passed |
| `POST /api/sessions/join` (Phone formatting) | Accepts 10 digits, spaces, hyphens, leading 0, 91, +91; stores normalised `+91XXXXXXXXXX` | `backend/routes/sessionRoutes.test.js` | Passed |
| `POST /api/sessions/join` (Bad input validation) | 400 INVALID_INPUT on bad phone, nickname, tableNumber, qrToken, restaurantId | `backend/routes/sessionRoutes.test.js` | Passed |
| `POST /api/sessions/join` (Invalid table/token) | 404 TABLE_NOT_FOUND with identical message/code for unknown restaurant, unknown table, wrong qrToken | `backend/routes/sessionRoutes.test.js` | Passed |
| `POST /api/sessions/join` (Second guest) | 201 Created with status "pending", role "guest"; session retains exactly one host | `backend/routes/sessionRoutes.test.js` | Passed |
| `POST /api/sessions/join` (Same phone repeated) | 409 ALREADY_JOINED if phone already active in current session | `backend/routes/sessionRoutes.test.js` | Passed |
| `POST /api/sessions/join` (Cross-table occupancy) | 409 PHONE_ACTIVE_ELSEWHERE if phone active at another table; allowed after session closed | `backend/routes/sessionRoutes.test.js` | Passed |
| `POST /api/sessions/join` (Capacity & expired requests)| 409 TABLE_FULL at 12 participants; unblocks when expired pending request is cleaned up | `backend/routes/sessionRoutes.test.js` | Passed |
| `POST /api/sessions/join` (Pending expiry re-join) | Expired pending guest (>10m) can request again and leaves single pending entry | `backend/routes/sessionRoutes.test.js` | Passed |
| `POST /api/sessions/join` (Idle session replacement) | Session idle >4 hours closed (reason "timeout", phones nulled); new session created with guest as host | `backend/routes/sessionRoutes.test.js` | Passed |
| `POST /api/sessions/join` (Simultaneous joins) | Promise.all of 5 distinct phones: exactly 1 host, 4 pending, exactly 1 open session, no 500 | `backend/routes/sessionRoutes.test.js` | Passed |
| `POST /api/sessions/join` (Simultaneous cross-table) | Promise.all of same phone at 2 tables: exactly 1 succeeds (201), 1 fails (409 PHONE_ACTIVE_ELSEWHERE) | `backend/routes/sessionRoutes.test.js` | Passed |
| `POST /api/sessions/join` (Join-side table race) | `Table.exists` null at re-check: 404 TABLE_NOT_FOUND, closes session ("table-removed", phones null) | `backend/routes/sessionRoutes.test.js` | Passed |
| `GET /api/sessions/me` (Visibility & masking) | Host sees approved & pending; approved sees approved; pending sees self; unmasked phones never leaked | `backend/routes/sessionRoutes.test.js` | Passed |
| `GET /api/sessions/me` (Auth & token checks) | 401 on missing token, garbage token, staff token, closed session (SESSION_CLOSED), removed participant (PARTICIPANT_REMOVED), deleted session document | `backend/routes/sessionRoutes.test.js` | Passed |
| Guest token on staff route | Guest token rejected with 401 on `GET /api/auth/me` | `backend/routes/sessionRoutes.test.js` | Passed |
| Pending guest authorization | 403 APPROVAL_PENDING when pending guest accesses `/allergies` or `/menu` | `backend/routes/sessionRoutes.test.js` | Passed |
| Expired pending guest access | Next request cleans up expired pending participant and returns 401 PARTICIPANT_REMOVED | `backend/routes/sessionRoutes.test.js` | Passed |
| Idle session on guest access | Session idle >4h returns 401 SESSION_CLOSED and is closed with reason "timeout" | `backend/routes/sessionRoutes.test.js` | Passed |
| Table delete race (Per-request half) | Deleted table returns 401 SESSION_CLOSED on next request and closes session with "table-removed" | `backend/routes/sessionRoutes.test.js` | Passed |
| Touch `lastActivityAt` throttling | Touches timestamp when >60 seconds old; skips update when recent | `backend/routes/sessionRoutes.test.js` | Passed |
| `POST /api/sessions/participants/:id/approve` | Host approves pending guest (200, status "approved"); 403 NOT_HOST for guest; 404 on unknown, already approved, expired request | `backend/routes/sessionRoutes.test.js` | Passed |
| `POST /api/sessions/participants/:id/reject` | Host rejects pending guest (removed); 404 when attempting to reject approved guest or host self | `backend/routes/sessionRoutes.test.js` | Passed |
| Cross-session approval isolation | Token from session A cannot approve/reject participants belonging to session B (404) | `backend/routes/sessionRoutes.test.js` | Passed |
| `POST /api/sessions/allergies` | Declares allergies (200), sets allergiesDeclared true; empty array `[]` valid ("no allergies") | `backend/routes/sessionRoutes.test.js` | Passed |
| `POST /api/sessions/allergies` (Validation) | 400 INVALID_INPUT on non-array, >10 items, unknown allergen, plural typos | `backend/routes/sessionRoutes.test.js` | Passed |
| `POST /api/sessions/allergies` (Casing & de-dup) | Normalises casing/spacing and removes duplicate allergen entries | `backend/routes/sessionRoutes.test.js` | Passed |
| `GET /api/sessions/menu` (Safety enforcement) | 403 ALLERGIES_REQUIRED before declaration; 200 after declaration with server-computed safe flag | `backend/routes/sessionRoutes.test.js` | Passed |
| `GET /api/sessions/menu` (Allergen safety logic) | Clashes flagged safe=false reason="allergen"; unconfirmed dish safe=false reason="unconfirmed" for allergic diner; unconfirmed safe for guest with `[]` | `backend/routes/sessionRoutes.test.js` | Passed |
| `GET /api/sessions/menu` (Scoping & keys) | Lists only available items for this restaurant; exact publicMenuItem keys + safe, clashes, reason | `backend/routes/sessionRoutes.test.js` | Passed |
| `GET /api/sessions/menu` (Dynamic safety recalculation) | Subsequent `/allergies` updates immediately reflect on next `/menu` call | `backend/routes/sessionRoutes.test.js` | Passed |
| `GET /api/sessions/menu` (Taxonomy ordering) | Items sorted by category ascending then name ascending | `backend/routes/sessionRoutes.test.js` | Passed |
| Indian scripts & Nickname rules | Supports Hindi (`रवि`), Gujarati (`અમિત`), punctuation (`O'Connor-Smith Jr.`), collapses internal whitespace | `backend/routes/sessionRoutes.test.js` | Passed |
| `POST /api/sessions/join` (Create race retry) | TableSession.create losing race once (E11000) recovers and succeeds as host (201) | `backend/routes/sessionRoutes.test.js` | Passed |
| `POST /api/sessions/join` (Create race exhaustion) | TableSession.create always losing race answers 503 TRY_AGAIN and no 500 | `backend/routes/sessionRoutes.test.js` | Passed |
| `POST /api/sessions/join` (Pending push retry) | updateOne matching 0 once recovers and succeeds as pending (201) | `backend/routes/sessionRoutes.test.js` | Passed |
| `POST /api/sessions/join` (Pending push exhaustion) | updateOne continuously matching 0 answers 503 TRY_AGAIN | `backend/routes/sessionRoutes.test.js` | Passed |
| `POST /api/sessions/allergies` (Session closed race) | updateOne matching 0 (session closed in between) answers 401 SESSION_CLOSED | `backend/routes/sessionRoutes.test.js` | Passed |

## Staff Session Safeguards & Sweeper Test Checklist (Task 9b)

| Route / Feature | Expected Result | Test File | Status |
| :--- | :--- | :--- | :--- |
| `GET /api/sessions/staff/active` (Owner & Kitchen access) | Returns open sessions of own restaurant sorted by table number ascending; restaurant B and closed sessions excluded | `backend/routes/sessionStaffRoutes.test.js` | Passed |
| `GET /api/sessions/staff/active` (Key whitelist & idleMinutes) | Exactly 9 documented keys; idleMinutes accurately reflects lastActivityAt elapsed time | `backend/routes/sessionStaffRoutes.test.js` | Passed |
| `GET /api/sessions/staff/active` (Expired request exclusion) | Expired pending requests (>10m) excluded from participantCount, pendingCount, and participants array | `backend/routes/sessionStaffRoutes.test.js` | Passed |
| `GET /api/sessions/staff/active` (Data protection & masking) | Entire JSON response contains no raw phone numbers or 10-digit unmasked strings; only masked values | `backend/routes/sessionStaffRoutes.test.js` | Passed |
| `GET /api/sessions/staff/active` (Auth guards) | 401 on missing token, guest token, or garbage token | `backend/routes/sessionStaffRoutes.test.js` | Passed |
| `POST /api/sessions/staff/:id/close` (Reset) | 200 { message: "Table reset" }; status "closed", reason "reset", closedAt set, phones null; guest tokens answer 401 SESSION_CLOSED; table freed | `backend/routes/sessionStaffRoutes.test.js` | Passed |
| `POST /api/sessions/staff/:id/close` (Rejected) | 200 { message: "Session rejected" }; status "closed", reason "rejected", phones null | `backend/routes/sessionStaffRoutes.test.js` | Passed |
| `POST /api/sessions/staff/:id/close` (Validation & scoping) | 400 on missing/invalid reason; 404 on unknown session, restaurant B, already closed session, not-an-id, or double close | `backend/routes/sessionStaffRoutes.test.js` | Passed |
| `POST /api/sessions/staff/:id/close` (Concurrent close race) | Database update matching 0 answers 404 NOT_FOUND, never 200 | `backend/routes/sessionStaffRoutes.test.js` | Passed |
| `POST /api/sessions/staff/:id/participants/:id/approve` | Staff approves pending guest (200 with staff view, status "approved" in DB) while host inactive; same shape as active item | `backend/routes/sessionStaffRoutes.test.js` | Passed |
| `POST /api/sessions/staff/:id/participants/:id/approve` (Guards) | 404 on unknown participant, already approved, expired request, weird status, restaurant B session, closed session, or update matchedCount 0 | `backend/routes/sessionStaffRoutes.test.js` | Passed |
| `POST /api/sessions/staff/:id/participants/:id/remove` (Pending) | 200 { message: "Removed" }; pulls pending guest from array | `backend/routes/sessionStaffRoutes.test.js` | Passed |
| `POST /api/sessions/staff/:id/participants/:id/remove` (Approved) | 200 { message: "Removed" }; token answers PARTICIPANT_REMOVED; phone freed immediately for new table | `backend/routes/sessionStaffRoutes.test.js` | Passed |
| `POST /api/sessions/staff/:id/participants/:id/remove` (Host promotion) | Removing host promotes longest-seated approved guest (hostId and role "host" updated in DB) | `backend/routes/sessionStaffRoutes.test.js` | Passed |
| `POST /api/sessions/staff/:id/participants/:id/remove` (Empty/pending only reset) | Removing host with only pending guests left closes session (reason "reset", phones null); removing last participant does same | `backend/routes/sessionStaffRoutes.test.js` | Passed |
| `POST /api/sessions/staff/:id/participants/:id/remove` (Host race - successor removed) | Concurrent removal of chosen successor recovers on fresh data and promotes other approved guest (200) | `backend/routes/sessionStaffRoutes.test.js` | Passed |
| `POST /api/sessions/staff/:id/participants/:id/remove` (Host race - successor demoted) | Concurrent demotion of chosen successor to pending recovers and promotes other approved guest (200) | `backend/routes/sessionStaffRoutes.test.js` | Passed |
| `POST /api/sessions/staff/:id/participants/:id/remove` (Promotion never matches) | Spy returning matchedCount 0 closes session (reason "reset", phones null, 200) | `backend/routes/sessionStaffRoutes.test.js` | Passed |
| `POST /api/sessions/staff/:id/participants/:id/remove` (Consistency property) | 25 seeded random sessions invariant: after every removal answers 200, session is closed or has exactly one approved host whose id matches hostId | `backend/routes/sessionStaffRoutes.test.js` | Passed |
| `POST /api/sessions/staff/:id/participants/:id/remove` (Guards) | 404 on unknown participant, restaurant B, closed session, not-an-id, or update matchedCount 0 | `backend/routes/sessionStaffRoutes.test.js` | Passed |
| `closeIdleSessions` (Inactivity sweeper logic) | Closes sessions idle >240m (reason "timeout", phones null); 239m remains open; returns closed count (0 on second call); table freed | `backend/routes/sessionStaffRoutes.test.js` | Passed |
| `startIdleSweeper` (Recurring interval execution) | Calls run repeatedly, survives exceptions thrown by run, timer is unref'd, clearable via clearInterval | `backend/routes/sessionStaffRoutes.test.js` | Passed |
| `startIdleSweeper` (Error logging) | On run rejection, logs fixed text "[maitred] idle session sweep failed" with no error data, continues interval execution | `backend/routes/sessionStaffRoutes.test.js` | Passed |
| `startIdleSweeper` (Success logging) | On closed > 0 logs "[maitred] closed N idle table session(s)" via console.log; on closed 0 logs nothing | `backend/routes/sessionStaffRoutes.test.js` | Passed |
| Server Startup Sweeper Wiring | server.js calls startIdleSweeper() exactly once after server.listen, guarded by NODE_ENV !== 'test' | `backend/routes/sessionStaffRoutes.test.js` | Passed |

## Bill Splitting Engine (`backend/utils/splitBill.js`) Test Checklist

| Feature / Logic | Expected Result | Test File | Status |
| :--- | :--- | :--- | :--- |
| `SPLIT_MODES` Definition | Exports frozen array `['equal', 'item', 'custom']` matching Bill model enum | `backend/utils/splitBill.test.js` | Passed |
| Currency Conversion (`toPaise` & `toRupees`) | Converts INR currency safely avoiding IEEE-754 traps; rejects negatives, non-finite, and decimals beyond 2 places; round-trips 5,000 random paise values | `backend/utils/splitBill.test.js` | Passed |
| Order Total Calculation (`orderTotal`) | Sums item subtotals (price * qty) in paise and returns exact rupee total | `backend/utils/splitBill.test.js` | Passed |
| Equal Split (`splitEqual`) | Distributes total evenly to the paisa; remainder paise allocated 1p each to earliest diners; sum of shares equals order total across thousands of random cases | `backend/utils/splitBill.test.js` | Passed |
| Split by Item (`splitByItem`) | Item claimed by diner allocated to that diner; item shared by multiple diners split equally; sum of shares matches bill total | `backend/utils/splitBill.test.js` | Passed |
| Custom Split (`splitCustom`) | Validates custom allocations; rejects when sum does not equal total to the paisa; returns Bill-shaped share array | `backend/utils/splitBill.test.js` | Passed |
| Bill Splitting Facade (`splitBill`) | Routes dynamically by splitMode ('equal', 'item', 'custom'); produces valid Bill model payload structure | `backend/utils/splitBill.test.js` | Passed |

## Frontend Foundation & Staff Authentication Test Checklist (Task 8a)

How to run frontend test suite:
```bash
cd frontend
npm test
```

To run production build check:
```bash
cd frontend
npm run build
```

Manual checks:
- Navbar wraps on narrow screens: manual check at 375 px width, no sideways scrolling

| Component / Utility | Test Description | Test File | Status |
| :--- | :--- | :--- | :--- |
| Allergens Taxonomy (`ALLERGENS`, `ALLERGEN_VALUES`) | Matches backend `KNOWN_ALLERGENS` exactly in values and order; non-empty capitalized labels; frozen arrays | `frontend/src/utils/allergens.test.js` | Passed |
| Currency Formatter (`formatPrice`) | Formats INR values (₹250, ₹1,800, ₹2,50,000); returns empty string on non-finite, null, or invalid input | `frontend/src/utils/formatters.test.js` | Passed |
| Route Definitions & Paths (`ROUTE_PATHS`, `homePathFor`) | Role-based redirection resolver (`owner` -> `/owner/menu`, `kitchen` -> `/kitchen`, fallback -> `/login`) | `frontend/src/utils/routePaths.test.js` | Passed |
| Project Constants & Design Scanner | "î" only in APP_NAME (`constants.js`); index.html title `<title>MaîtreD</title>`; zero color literals in src `.js`/`.jsx`; all design tokens in index.css | `frontend/src/utils/constants.test.js` | Passed |
| Import Casing Validator | Verifies every relative import below `src` matches filesystem directory/file casing with exact letter case | `frontend/src/utils/importCase.test.js` | Passed |
| Axios API Client & Interceptors (`api.js`) | Bearer header attached with token; 401 on auth request removes token & fires `UNAUTHORISED`; 401 on unauth request does not remove token; 500 keeps token | `frontend/src/services/api.test.js` | Passed |
| Auth Service (`authService.js`) | `login` posts credentials to `/auth/login`; `fetchCurrentUser` queries `/auth/me`; propagates errors | `frontend/src/services/authService.test.js` | Passed |
| Auth Context & Lifecycle (`AuthContext.jsx`) | Anonymous on mount without token; fetchCurrentUser on token; clears token on 401; preserves token on network failure; logout clears token; listens to `UNAUTHORISED` | `frontend/src/context/AuthContext.test.jsx` | Passed |
| Route Guards (`ProtectedRoute.jsx`) | Anonymous redirects to login; loading renders Loader; unauthorized role redirects to role home; authorized user renders children | `frontend/src/routes/ProtectedRoute.test.jsx` | Passed |
| App Routes Switchboard (`AppRoutes`) | Root redirects role to home; authenticated user on `/login` redirects home; unknown route renders NotFound | `frontend/src/routes/index.test.jsx` | Passed |
| Staff Sign-in Screen (`Login.jsx`) | Accessible inputs; trims email; handles 401 (invalid) and 400 (required); network/500/429 (unavailable); clears password; hides server messages; zero credential leaks | `frontend/src/pages/Login.test.jsx` | Passed |
| Button Component (`Button.jsx`) | Primary and ghost variants; loading disables & sets aria-busy; disabled prevents onClick handler | `frontend/src/Components/Common/Button.test.jsx` | Passed |
| Error Message Banner (`ErrorMessage.jsx`) | Role `alert`; displays text message; renders null when children empty | `frontend/src/Components/Common/ErrorMessage.test.jsx` | Passed |
| Loader Component (`Loader.jsx`) | Role `status`; quiet understated copy | `frontend/src/Components/Common/Loader.test.jsx` | Passed |
| Navigation Header (`Navbar.jsx`) | Anonymous sees brand only; authenticated owner sees menu & tables links + sign-out; kitchen sees kitchen link + sign-out; logout triggers sign-out | `frontend/src/Components/Common/Navbar.test.jsx` | Passed |

## Owner Screens Test Checklist: Menu & Table Management (Task 8b)

Manual checks:
- Add a dish and see it marked as not confirmed
- Review and confirm it
- Edit only the price and see the confirmation stay
- Edit an allergen and see it go back to not confirmed
- Hide and show a dish
- Add, show, replace and delete a table
- Print preview of a QR shows only the code
- Print preview of the Menu page is not blank
- Opening Add a dish puts the cursor in the first field
- 375 px width has no sideways scrolling

| Component / Feature | Expected Result | Test File | Status |
| :--- | :--- | :--- | :--- |
| Menu Service (`menuService.js`) | GET /menu, POST /menu, PATCH /menu/:itemId, POST confirm-allergens, PATCH availability; URI encodes IDs; propagates 409 and 500 status | `frontend/src/services/menuService.test.js` | Passed |
| Table Service (`tableService.js`) | GET /tables (drops qrToken), POST /tables (drops qrToken), GET /tables/:id/qr, POST rotate-token (drops qrToken), DELETE /tables/:id; URI encodes IDs; propagates 409 and 500 status | `frontend/src/services/tableService.test.js` | Passed |
| Accessible Modal (`Modal.jsx`) | createPortal into body, aria-modal, aria-labelledby heading, Escape/backdrop close, click inside isolated, busy blocks close/escape, focus trap (Tab/Shift+Tab wrap), initial focus on first focusable in modal-body (fallback to Close button), scroll lock & restore | `frontend/src/Components/Common/Modal.test.jsx` | Passed |
| Menu Form (`MenuForm.jsx`) | 12 fields; blank validation prevents submit; focus to first invalid; allergen and flavour fieldsets link aria-describedby to error IDs; allergen none/list exclusivity; exact create payload; prefilled edit mode; unknown tags warning; busy disabled; cancel | `frontend/src/Components/Owner/MenuForm.test.jsx` | Passed |
| Allergen Tag Review (`AllergenTagReview.jsx`) | Displays stored tags; empty list safety warning; unreadable/unknown tags disable confirm; requires explicit tick; passes exact stored array; cancel & busy states | `frontend/src/Components/Owner/AllergenTagReview.test.jsx` | Passed |
| Table Card (`TableCard.jsx`) | Heading Table N; three accessible buttons (Show, Replace, Delete); disabled when busy; dispatches handlers with table | `frontend/src/Components/Owner/TableCard.test.jsx` | Passed |
| QR Display (`QRDisplay.jsx`) | Displays img only for valid PNG base64; http(s) guest link; download filename format; Print button calls window.print; updated qrCaption wording; zero hex secret leaks in visible text | `frontend/src/Components/Owner/QRDisplay.test.jsx` | Passed |
| Menu Manager Page (`MenuManager.jsx`) | Full listing, summary counts, section grouping, status chips, filter group aria-label "Filter dishes", filters with counts, add/edit/review modals, availability toggle, 409 conflict reload, generic error handling | `frontend/src/pages/MenuManager.test.jsx` | Passed |
| Table Manager Page (`TableManager.jsx`) | Table grid & empty state; numeric input validation (1-500); add/rotate/delete modals; split replace-QR flow (replacedQrLoadFailed banner on QR fetch failure without generic error); 409 table exists / session active blocked; zero 32-hex token leaks; busy locks | `frontend/src/pages/TableManager.test.jsx` | Passed |
| Frontend Architecture & Safety Rules (`sourceRules.test.js`) | Zero dangerouslySetInnerHTML, innerHTML, localStorage, dialog, eval, new Function; no console in pages/components/services; index.css scoped print (body:has(.qr-print) #root); no color literals outside :root; index.html icon & title | `frontend/src/utils/sourceRules.test.js` | Passed |

## Known gaps

| Gap | Closed by | Proven by | Status |
| :--- | :--- | :--- | :--- |
| Table delete vs guest join race | Closed in Task 5b (delete-side orphan cleanup) and Task 9a (join-side re-check and per-request Table.exists check) | `closeOrphanSessions` tests in `tableRoutes.test.js`; join-side race test and per-request delete test in `sessionRoutes.test.js` | closed (Task 9a) |
| Missing JWT_SECRET shows as 401 in protect instead of failing at startup | Task 7 | generateToken and authRoutes tests | closed (Task 7) |
| No rate limit on login | hardening task (needs express-rate-limit, needs my approval) | pending | open |
| Malformed JSON body: confirm it answers 400, not 500 | Task 7 | server.test.js and the errorMiddleware tests | closed (Task 7) |
| Table QR token is a static secret, so a photo of the QR lets anyone join | rotate-token route done in Task 7, the real fix is the session lifecycle (see the new row below) | tableRoutes rotate-token tests | half closed |
| A previous party, or anyone holding a photo of the QR, can reach the next party's table. Needs a session lifecycle: staff opens the table or approves guests, closing the table invalidates every guest token and socket connection, every guest request re-checks that its session is open and its table still exists, and an inactivity timeout closes forgotten sessions | phone-number join, one session per table and per phone, host approval, staff reject, reset and removal, and the idle sweeper | `sessionRoutes.test.js`, `sessionMiddleware.test.js`, and `sessionStaffRoutes.test.js` | closed (Task 9b) |
| $inc skips the min 1 rule on cart qty | cart task | pending | open |
| Guest allergies must be declared before any cart action (allergiesDeclared) | Enforced for guest menu in Task 9a (`requireAllergiesDeclared`); cart task must apply `requireAllergiesDeclared` to cart mutations | `sessionMiddleware.test.js` and `sessionRoutes.test.js` | half closed |
| Unique open-session index is declared but not proven against the real database | Task 7 | tableSessionIndex.test.js | closed (Task 7) |
| Frontend allergen list must match KNOWN_ALLERGENS exactly | Task 8a (frontend foundation) | allergens.test.js | closed (Task 8a) |
| The auth token lives in sessionStorage, readable by any script that runs on the page | deployment and final review: add a Content-Security-Policy, keep dependencies minimal, never render HTML from data | pending | open |
| npm audit: review production dependencies before submission | final review | pending | open |
| Public menu returns raw allergen tags: guest screens must use the server-computed safe flag from the session menu and never compute safety in the client | Server-computed flag implemented in `GET /api/sessions/menu` (Task 9a); frontend guest view must consume this endpoint | `sessionRoutes.test.js` | half closed |
| Menu item names are not unique per restaurant (needs a unique index, which is a model change) | hardening task | pending | open |
| Seeded demo accounts must never exist in a deployed database (seed already refuses production) | final review | assertSeedAllowed tests now | half closed |
| Demo menu allergen tags are checked by keyword rules and a manual skim, not by a food safety professional | final review (owner skims; the report states the limitation) | pending | open |
| Phone numbers are not verified (no SMS code): anyone with the QR and any number can request to join, and the only protection against impersonation is host or staff approval | SMS verification is future scope and must be stated in the report | Architecture limitation | open |
| The join endpoint has no rate limit, so someone with a QR photo can flood a table with requests (each expires after 10 minutes and a table holds 12 people) | hardening part 2 (needs express-rate-limit, needs my approval) | Security limitation | open |
| Data protection: phone numbers are stored only while a session is open, erased when it closes and masked in every response; describe this in the report (India's DPDP Act is the reason) | final report | `sessionRoutes.test.js` and `tableSessionIndex.test.js` | open |
| Someone holding a QR photo can learn whether a given phone number is currently seated at this restaurant, because the 409 answers reveal it | rate limiting (hardening part 2) and SMS verification (future scope); state it in the report | pending | open |
| Phone uniqueness is enforced across the whole database, not per restaurant; fine for one restaurant | scope it per restaurant when multi-restaurant support is built; state it in the report | pending | open |
| Staff reset does not check for an unpaid bill (orders and bills are built in later tasks) | the bill task: the staff screen warns when unpaid items exist before a reset | open | open |
| Pending approvals and the staff session list are fetched by polling, not pushed live | the Socket.io cart task adds live updates | open | open |
| The idle limit of 4 hours is a safety valve chosen by us, not by the mentor; a table with no activity for 4 hours can be claimed again | state it in the report | open | open |
| Allergen confirmation is a human check: the screen requires an explicit tick but cannot verify the recipe | the report states the limitation | pending | open |
| Staff session controls (approve, reject, reset, remove) exist in the API but have no screen yet | kitchen screens task | pending | open |
| QR codes encode CLIENT_URL, which must be the public address before any code is printed | final review (deployment) | pending | open |

