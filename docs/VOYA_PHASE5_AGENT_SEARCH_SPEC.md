# Voya Phase 5 Agent Marketplace Search

`POST /api/marketplace/search` requires an approved authenticated `TRAVEL_AGENT`. The tenant is always read from the JWT-backed user; `agentTenantId` is never accepted from the Agent browser.

Request requires date-only `serviceDate` (`YYYY-MM-DD`) and `travellers`. Optional filters are query, destination, category, subType, duration range, non-negative price range, booking mode, pickup, rating, private/shared, child suitability, sort, and limit (maximum 50). Unsupported enum values are rejected.

The candidate query prefilters LIVE products with a PUBLISHED current revision, ACTIVE variants/rate plans, effective schedules/sessions, verified vendors, and enabled `VOYA_AGENT` mappings. The shared evaluator then applies cutoff, traveller, commercial, inventory, and resource gates.

Response groups eligible offers under Product then Variant. A Product with zero eligible offers is omitted. The Agent-safe projection includes published name/description/destination/media, variant structured fields, session timing/timezone, booking mode, final Agent price, availability summary, evaluation time, and simple match reasons.

Supported sort modes are `RELEVANCE`, `PRICE_ASC`, `PRICE_DESC`, `RATING`, and `EARLIEST_SESSION`. Relevance uses exact destination, destination/text match, instant confirmation, and availability. Ties use product code, variant code, rate-plan code, session time, and session ID. No paid placement or implicit commercial boost exists.

`POST /api/marketplace/products/:productId/view` uses the exact Agent search context (`serviceDate`, normalized traveller mix, and optional `units`) and directly evaluates the requested Product's candidates; it does not depend on the first 50 search results. It returns only the current published revision, public media, safe variant content, eligible offers, inclusions/exclusions, pickup, terms, and Agent price. Query is a structured case-insensitive partial match across published Product and Variant fields; unrelated Products are excluded. Public uploaded media is projected as `/api/files/public/:fileAssetId/content`. It excludes drafts, supplier/Vendor economics, Voya margin, internal rules/source payloads, admin notes, and private files.

Child suitability is a structural filter: the RatePlan must have a `CHILD` TravellerRule with `maxCount >= 1`; actual child pricing/acceptance is still decided by Eligibility and Commercial evaluation.

## Phase 5.1 Final Eligibility Closure Verification

The Agent UI preserves search filters/context while opening Customer View and exposes the first-class filter set without implementing Booking actions.

## Phase 5.2 Final Closure

The search form exposes optional integer `Units` (minimum 1) for vehicle, boat, equipment, or other unit-capacity activities. It has no default. When entered, the exact value travels through search and Customer View; omitting it leaves the request unit-free and a UNIT offer fails the Eligibility Capacity gate.

Category is the broad Product Revision classification; Sub-type is a specific current-revision filter and is matched case-insensitively. Date input is date-only (`YYYY-MM-DD`); duration and price bounds are non-negative and inverted ranges return HTTP 400; rating is constrained to 0–5.

The marketplace reads all matching candidates through deterministic cursor pagination (100 per page), evaluates all of them, and applies the maximum 50 to returned Products after eligibility, ranking, grouping, and filtering. This prevents eligible products after candidate 250 from disappearing and avoids an N+1 Product lookup pattern.
