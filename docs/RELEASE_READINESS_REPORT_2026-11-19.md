# VOYA implementation and verification report — 19 November 2026

## Result and boundary

Credential-independent release work is implemented and the checks below pass. No deployment, push, live database connection, real payment, external email or genuine verification approval was performed. Work started from commit 5cbc26b. Changes remain in the local workspace for review. Existing unrelated untracked archives, documents and storage were preserved.

## Implemented

- Fresh-install migration recovery: frozen schema baseline for the 98 historical migrations, including all 42 database-only invariants; explicit target/checksum/non-empty guards, atomic creation, provenance-based resume, supported Prisma baselining and minimal safe reference defaults. The original migration files are unchanged. Existing installations use their normal forward deployment path, never this baseline.
- Optional private S3/Spaces storage, persistent local-storage root, validated keys/extensions, strict configuration and authorized file API reuse. Local stays default; no cloud cutover was attempted.
- Deferred portal pages, product builder, import modal and spreadsheet library; lossless WebP hero, build manifest/budget enforcement, production-base local preview proxy. Configured themes and visual layout are preserved.
- Fixed CSV coercion introduced by the patched SheetJS upgrade: leading-zero identifiers and clock strings remain literal. Added a regression test.
- Fixed legacy marketplace availability toggling so it preserves activated external product/variant identifiers instead of conflicting with immutability controls. Added a regression test.
- Fixed vendor event emails to select owners plus active grants for the event outlet and enforce existing booking/document/finance role permissions. Unattributed historical/account-wide notifications go to owners. Added isolation regression tests.
- Repaired demo provisioning for outlet-aware resource keys, default attribution, existing voucher shortcode validation and isolated storage. Production demo seed is refused.
- Repaired older verification harnesses to use current Nest injection/outlet authorization and actual maker/checker payout approval. Each phase gets its own database copy; no finance/security controls were relaxed.
- Updated dependency locks and compatible transitive overrides; both audit reports contain zero reported vulnerabilities. Added storage, migration guards, mail, recovery and load verification, UAT worksheet and operational handover.

## Tests and staging evidence

| Check | Result | Evidence in outputs/release-readiness-20261119 |
| --- | --- | --- |
| Backend Jest | 699/699 cases, 117 suites pass | backend-tests.json |
| Frontend Vitest | 254/254 cases pass | frontend-tests.json |
| Bootstrap unit guards/immutable manifest | 2 pass | baseline-unit-tests.log |
| Complete historical end-to-end matrix | 19/19 phases pass; isolated PostgreSQL copy per phase | phase-matrix.json and phase logs |
| Multi-outlet API/security/concurrency | 21 checks pass | local-integration.json, concurrency-proof.json |
| Fresh PostgreSQL 15.20 and 16.15 installs | 98 applied migrations, 42 invariants, zero Prisma drift; invalid singleton and duplicate default outlet rejected | fresh-baselines.json; fresh-*-bootstrap.log |
| Retained snapshot migration/backfill on PG15 and PG16 | 121 original table fingerprints preserved; repeated backfill stable; financial records unchanged | staging-copy-pg15-rehearsal.json, staging-copy-rehearsal.json |
| Existing portal/API/report compatibility, both engines | 150 successful HTTP checks per engine; 13 users, 10 vendors, 3 stored reports per engine; no finance mutation | staging-http-pg15-smoke.json, staging-http-smoke.json |
| S3 emulator | 4 purpose round-trips; 4 anonymous GET denials; 20 concurrent uploads, no collisions | object-storage.json |
| Actual loopback SMTP | Booking/cancellation/payout emails, scheduled report CSV and duplicate suppression pass | smtp-integration.json |
| Backup and restore | 126 table hashes/counts and 21 files match; source unchanged | backup-restore.json |
| Bounded local API read load | 300 requests, concurrency 12, no failures; p50 24.68 ms, p95 78.07 ms, maximum 143.84 ms; finance unchanged | read-load.json |
| Prisma validation/generation, backend/frontend builds, diff whitespace | Pass | prisma-validate.log, prisma-generate.log, backend-build.log, frontend-build.log |
| Dependency audits | Backend 0; frontend 0 reported vulnerabilities | backend-audit.json, frontend-audit.json |

End-to-end phases cover inventory/capacity, eligibility/search, booking/idempotency/concurrency, cancellation/refund races, fulfilment/voucher lifecycle, finance/settlement/reconciliation, supplier quality, demand and channel distribution. The multi-outlet scenarios include cross-tenant/outlet denial, forged grants/invitations, revoked memberships, private files, inactive outlets, shared banks, immutable beneficiary snapshots, bank revocation between maker/checker decisions and one weekly payout per outlet.

Browser review used the built frontend in the Codex browser against isolated synthetic APIs. Owner aggregate/switching, scoped employee bookings, product builder, spreadsheet template download, admin dashboard/finance and agent navigation are covered. Browser screenshots and browser-verification.json are in the evidence directory; the final verification tab remains open.

## Measured frontend performance

Initial JavaScript is 2,64,568 bytes (80,750 gzip), versus about 1.50 MB / 426.69 KB gzip before splitting. Heavy screens and spreadsheet parsing are deferred; the largest JS chunk is below 500 KB. The hero is lossless WebP (2,287,054 bytes versus 3,092,332 PNG); decoded pixels were compared. The image remains substantial on slow links. Load results are local Windows/Docker observations, not a production capacity or SLA claim.

## Remaining dependencies and release risks

- Funded OpenAI/direct provider integration and production SMS/DLT are excluded by instruction. Existing other AI adapters do not prove a direct OpenAI connection.
- Actual SMTP/WhatsApp/OTA/payment/KYC/bank providers, real cloud bucket policy/delivery, offsite backup retention and infrastructure setup still need approved client accounts/credentials and provider acceptance checks.
- Genuine bank/KYC verification, final policies/content, client UAT/training attendance and production sign-off require client participation; demonstration approvals are not genuine verification.
- Rehearsal used the retained 17 November snapshot (SHA256 af0fba4c97d88059e1a5518ab60f26dbee480199cc7ce932de830b8a37be6694). Fresh live state, production proxy/TLS and actual provider behavior were not rechecked or changed. Obtain a fresh approved backup/rehearsal before cutover.
- The retained history has an inherited checksum difference for 20261031120000_partner_hub_gap_models and line-ending differences. These are documented and not rewritten. The fresh baseline is strictly for empty installations.
- S3 does not copy existing local files automatically. Keep the local default until a separately approved file migration is verified. Preserve original encryption keys with recovery configuration.
- Automated regression checks found no remaining failure in the covered paths; they cannot guarantee every production condition. No formal client acceptance is claimed.

## Timeline and demonstration

The supplied client plan runs 12 October–20 December 2026. On 19 November it is Week 6 (16–22 November); the final deadline has not passed. Core later-week fulfilment, admin integration and settlement functions have automated evidence, but provider acceptance, UAT and production handover remain pending.

Follow [the UAT walkthrough](RELEASE_READINESS_UAT.md) and [operations/runbook](RELEASE_READINESS_OPERATIONS.md). Use only the documented synthetic accounts locally. Live Harbour Trails accounts were not changed. Deployment requires separate approval, a fresh consistent backup and the existing-database path.

## Modified and added files

- README.md
- activity-saas-backend/.env.example
- activity-saas-backend/package-lock.json
- activity-saas-backend/package.json
- activity-saas-backend/prisma/baseline/20261119/manifest.json
- activity-saas-backend/prisma/baseline/20261119/reference-data.sql
- activity-saas-backend/prisma/baseline/20261119/schema.sql
- activity-saas-backend/prisma/seed.ts
- activity-saas-backend/scripts/bootstrap-fresh-database.cjs
- activity-saas-backend/scripts/bootstrap-fresh-database.test.cjs
- activity-saas-backend/scripts/build-fresh-baseline.cjs
- activity-saas-backend/scripts/multi-outlet-legacy-fixture.sql
- activity-saas-backend/scripts/prepare-readiness-fixture.cjs
- activity-saas-backend/scripts/rehearse-multi-outlet.cjs
- activity-saas-backend/scripts/rehearse-readiness-operations.cjs
- activity-saas-backend/scripts/rehearse-staging-snapshot.cjs
- activity-saas-backend/scripts/serve-readiness.cjs
- activity-saas-backend/scripts/verify-fresh-baselines.cjs
- activity-saas-backend/scripts/verify-multi-outlet-local.cjs
- activity-saas-backend/scripts/verify-object-storage.cjs
- activity-saas-backend/scripts/verify-phase6-2-booking.ts
- activity-saas-backend/scripts/verify-phase7-1-financial-integrity.ts
- activity-saas-backend/scripts/verify-phase7-cancellation.ts
- activity-saas-backend/scripts/verify-phase9-settlement.ts
- activity-saas-backend/scripts/verify-readiness-load.cjs
- activity-saas-backend/scripts/verify-readiness-mail.cjs
- activity-saas-backend/scripts/verify-release-matrix.cjs
- activity-saas-backend/scripts/verify-staging-copy.cjs
- activity-saas-backend/src/admin/admin.service.spec.ts
- activity-saas-backend/src/admin/admin.service.ts
- activity-saas-backend/src/outbox/vendor-notification.worker.spec.ts
- activity-saas-backend/src/outbox/vendor-notification.worker.ts
- activity-saas-backend/src/storage/storage.service.spec.ts
- activity-saas-backend/src/storage/storage.service.ts
- activity-saas-frontend/package-lock.json
- activity-saas-frontend/package.json
- activity-saas-frontend/scripts/check-build-budget.mjs
- activity-saas-frontend/src/App.tsx
- activity-saas-frontend/src/assets/voya-partner-hero.webp
- activity-saas-frontend/src/components/product-import/productImport.test.ts
- activity-saas-frontend/src/components/product-import/productImport.ts
- activity-saas-frontend/src/lazyPages.ts
- activity-saas-frontend/src/pages/PartnerHubPages.tsx
- activity-saas-frontend/src/vite-env.d.ts
- activity-saas-frontend/vite.config.js
- activity-saas-frontend/vite.config.ts
- docs/RELEASE_READINESS_IMPLEMENTATION_PLAN.md
- docs/RELEASE_READINESS_OPERATIONS.md
- docs/RELEASE_READINESS_REPORT_2026-11-19.md
- docs/RELEASE_READINESS_UAT.md

Private evidence, database snapshots, generated build directories, node_modules and unrelated archives are not part of the source change. Do not bulk-add the workspace.
