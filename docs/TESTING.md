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

## Known gaps

| Gap | Closed by | Proven by | Status |
| :--- | :--- | :--- | :--- |
| Table delete vs guest join race | Closed in Task 5b (delete-side orphan cleanup) and Task 9a (join-side re-check and per-request Table.exists check) | `closeOrphanSessions` tests in `tableRoutes.test.js`; join-side race test and per-request delete test in `sessionRoutes.test.js` | closed (Task 9a) |
| Missing JWT_SECRET shows as 401 in protect instead of failing at startup | Task 7 | generateToken and authRoutes tests | closed (Task 7) |
| No rate limit on login | hardening task (needs express-rate-limit, needs my approval) | pending | open |
| Malformed JSON body: confirm it answers 400, not 500 | Task 7 | server.test.js and the errorMiddleware tests | closed (Task 7) |
| Table QR token is a static secret, so a photo of the QR lets anyone join | rotate-token route done in Task 7, the real fix is the session lifecycle (see the new row below) | tableRoutes rotate-token tests | half closed |
| A previous party, or anyone holding a photo of the QR, can reach the next party's table. Needs a session lifecycle: staff opens the table or approves guests, closing the table invalidates every guest token and socket connection, every guest request re-checks that its session is open and its table still exists, and an inactivity timeout closes forgotten sessions | phone-number join, one session per table and per phone, host approval, per-request session open check, and 4-hour idle timeout are completed in Task 9a; staff reject/reset and idle sweeper come in Task 9b | `sessionRoutes.test.js` and `sessionMiddleware.test.js` | half closed |
| $inc skips the min 1 rule on cart qty | cart task | pending | open |
| Guest allergies must be declared before any cart action (allergiesDeclared) | Enforced for guest menu in Task 9a (`requireAllergiesDeclared`); cart task must apply `requireAllergiesDeclared` to cart mutations | `sessionMiddleware.test.js` and `sessionRoutes.test.js` | half closed |
| Unique open-session index is declared but not proven against the real database | Task 7 | tableSessionIndex.test.js | closed (Task 7) |
| Frontend allergen list must match KNOWN_ALLERGENS exactly | frontend foundation task | pending | open |
| npm audit: review production dependencies before submission | final review | pending | open |
| Public menu returns raw allergen tags: guest screens must use the server-computed safe flag from the session menu and never compute safety in the client | Server-computed flag implemented in `GET /api/sessions/menu` (Task 9a); frontend guest view must consume this endpoint | `sessionRoutes.test.js` | half closed |
| Menu item names are not unique per restaurant (needs a unique index, which is a model change) | hardening task | pending | open |
| Seeded demo accounts must never exist in a deployed database (seed already refuses production) | final review | assertSeedAllowed tests now | half closed |
| Demo menu allergen tags are checked by keyword rules and a manual skim, not by a food safety professional | final review (owner skims; the report states the limitation) | pending | open |
| Phone numbers are not verified (no SMS code): anyone with the QR and any number can request to join, and the only protection against impersonation is host or staff approval | SMS verification is future scope and must be stated in the report | Architecture limitation | open |
| The join endpoint has no rate limit, so someone with a QR photo can flood a table with requests (each expires after 10 minutes and a table holds 12 people) | hardening part 2 (needs express-rate-limit, needs my approval) | Security limitation | open |
| Data protection: phone numbers are stored only while a session is open, erased when it closes and masked in every response; describe this in the report (India's DPDP Act is the reason) | final report | `sessionRoutes.test.js` and `tableSessionIndex.test.js` | open |

