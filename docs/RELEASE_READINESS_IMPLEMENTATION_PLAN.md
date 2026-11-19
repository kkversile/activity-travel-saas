# Credential independent release readiness

Started 19 November 2026. This work does not deploy, contact the live database, send external messages, or release payments. Existing migration files and applied checksums must remain unchanged.

1. Add a reviewed fresh-install baseline and an empty-database bootstrap/rehearsal path. Preserve database checks, partial indexes and financial integrity rules as well as the Prisma schema. Test an empty installation and migration/backfill on the retained isolated staging snapshot.
2. Add optional S3-compatible storage while retaining local storage by default. Enforce private-file access through the existing file APIs, reject unsafe keys, and test without client credentials. Document persistent local storage and backup/restore operation.
3. Reduce the initial frontend bundle through deferred page/library loading without changing page design or configured theme. Verify all portal routes and measure the built assets.
4. Add reproducible isolated staging acceptance checks: portal authorization and outlet isolation, concurrent capacity/booking and financial controls, email delivery to a loopback capture server, storage, report exports, and database/files backup restoration. Use existing fixtures and verifier scripts where possible.
5. Run all backend/frontend tests and builds, Prisma checks, and the staged verification matrix. Record measured performance, failures repaired, and reproducible evidence. Prepare the UAT, operational handover and deployment checklist; actual client sign-off and production cutover remain pending.

OpenAI billing/provider connection, SMS/DLT integration, genuine bank verification, client infrastructure credentials, external delivery acceptance and client UAT sign-off remain external prerequisites. These are not simulated as completed business approvals.
