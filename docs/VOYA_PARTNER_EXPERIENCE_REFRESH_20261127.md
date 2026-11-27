# Voya partner experience refresh — implementation and verification

Date: 27 November 2026. Branch: `codex/voya-partner-experience-refresh`. Base commit: `4efc4f8e6c8b8f88c8a35fc28ceb30dd13c43f99`.

## Outcome

All six approved phases are implemented locally. The original Voya design uses local travel photography, an account workspace beside the story, practical onboarding guidance and a preview of the actual product content. The reference informed the goal of making the journey more engaging; no Headout layout, copy, code or assets were copied.

The saved admin color system and all four presets remain authoritative. No backend source, Prisma schema, migration, financial rule or authentication permission was changed. Nothing was committed, pushed or deployed. No live Voya endpoint, SSH session or production database was used during this implementation.

## The six phases

| Phase | Delivered | Evidence |
| --- | --- | --- |
| 1. Baseline and direction | Archived the original frontend, took before screenshots, selected the Voya direction and restored an isolated local database. | DESIGN_DECISIONS.md and before screenshots in the evidence directory. |
| 2. Landing and account entry | Original travel story with four selectable scenes, local licensed assets, clear joining guidance and keyboard-operable FAQs. Login/register remain functional; all four configured demo shortcuts, reset/activation/OTP and invitation code paths remain. Mobile account forms follow the landing content and FAQs; Create account and Log in jump to the corresponding bottom form. | Login/registration tests, browser interaction and theme checks. |
| 3. Onboarding | Preparation screen, help for each of the eight sections, document/bank/contact guidance, clearer working layout and compact mobile section selector. Save, resume, KYC, agreement, review and validation use the existing workflow. | Started the demonstration application, saved/reloaded business and contact details, inspected all eight sections and confirmed incomplete KYC blocks submission. |
| 4. Product creation | Nine sections remain intact, grouped into story/bookability/guest preparation. Added a read-only content preview using actual unsaved title/summary/location/highlights, saved cover and real options. Required listing settings stay visible. | Created a Fort Kochi demonstration product, saved content, itinerary, image, option, INR rates, availability, cancellation and fulfilment, then submitted it for QC. |
| 5. Shared UX polish | Semantic theme colors, keyboard focus, native disclosures, reduced-motion support, mobile footers, desktop/tablet/mobile layouts, accurate saved/dirty/read-only states and first-save outlet routing repair. | All eight onboarding and all nine product sections fit 390px; 768px and 1440px checked. No nested page scroller found in the working forms. |
| 6. Regression and staging | Full backend/frontend builds and tests, API rehearsal, Codex browser workflows, database readback and protected-data comparison. | Results below and verification-summary.json. |

## Issues found and corrected during verification

- First-save edit URLs lost the outlet query parameter. Refresh therefore returned to All outlets and blocked later saves. The route now carries the active outlet. Unit and component integration tests cover the fix; a browser first-save → refresh → edit → save passed.
- Mobile account forms are placed at the bottom as requested in client review. Header account actions jump directly to the selected form.
- Mobile onboarding footer actions needed more space. They now wrap and stay inside the viewport.
- Preview highlights now use the existing list parser, so persisted comma-separated highlights remain separate items.
- Preview and editor status copy now identifies read-only QC/published revisions instead of inviting edits to a locked draft.
- Added JPG asset declarations and corrected a test fixture's TypeScript type; the final TypeScript/build check passes.

## Test results

| Check | Result |
| --- | --- |
| Backend Jest | 958/958 tests; 130 suites |
| Frontend Vitest | 461/461 tests; 144 reported suites; 14 added regression tests |
| Backend build | PASS |
| Frontend TypeScript + production build under /voya/ | PASS |
| Guarded PostgreSQL staging API rehearsal | 104/104 |
| Codex browser assertions | 38/38 |
| Backend database bootstrap safety tests | 2/2 |
| Operations safety tests | 15/15 |
| Demo build configuration tests | 2/2 |
| JavaScript entry budget | PASS: 271,142 bytes raw / 83,059 bytes gzip; heavy routes remain deferred |
| git diff whitespace check | PASS |
| Protected finance comparison | All 12 table hashes/counts unchanged |
| Existing catalogue comparison | All 12 table hashes/counts unchanged |

The API rehearsal also covers tenant/outlet isolation, employee access, selected rate plans, protected prices, currency handling, booking and finance preservation, import validation and idempotent staging repair checks. The browser created only new demonstration products, checked actionable rate errors, imported a workbook and applied a validated draft rate update to that new cohort. Database readback confirmed INR 1,995 as a DRAFT commercial amount, the manual product's UNDER_REVIEW revision, correct outlet ownership and 365 future sessions.

Four preset palettes were applied through the existing staging admin appearance API and observed in the browser. The original custom staging palette was restored exactly: page `#fef5ff`, panels `#eee6ef`, headers `#e6c1ce`, primary `#8b504b`, accent `#dda04a`.

## Staging and data safeguards

- UI: http://127.0.0.1:3074/ (left open in the Codex browser).
- API: http://127.0.0.1:4074/api.
- Database: `voya_import_fixes_2026112703`, local PostgreSQL 15 on loopback port 55445.
- Restored from the previously available local staging snapshot. No fresh live database download was performed.
- External email/SMS delivery, AI provider calls and scheduled workers disabled.
- Existing product IDs captured before browser writes. New UX cohort records are excluded from the existing-catalogue preservation comparison; every original record remains protected.
- Existing unrelated changes in the two multi-outlet evidence files were preserved. Their SHA256 hashes match the initial task snapshot.
- No database migration or backfill is needed for this UI change.

The Codex browser replaced the design skill's separate Chrome inspector, as requested. Screenshots and DOM measurements were used at desktop/tablet/mobile sizes. A few full-page capture attempts failed or returned incomplete frames; usable captures were retaken and visually inspected. Viewport and reduced-motion overrides were reset. Browser windows and the user's live tab remain open.

## Demo steps

1. Open http://127.0.0.1:3074/. Change an inspiration scene and open an FAQ. Try Create account and Log in; all four role buttons remain available where configured.
2. Sign in with the staging pending vendor `coastal@voya-staging.example.com`, password `Demo@123`. Open Business profile & KYC. Review section help, edit a business value, save, refresh and confirm it persists. Inspect KYC/bank/review; missing evidence must block submission.
3. Sign out and use Vendor Login for Harbour Trails. Select Fort Kochi before adding a product. Enter title/type, save, refresh, and confirm the selected outlet survives.
4. Open Preview listing. Edit title/content and confirm the preview follows unsaved values without publishing. Hide it and continue through all nine sections.
5. The completed staging product `Demonstration Kochi waterfront walk` is already in QC and read-only (ID `1e8d58d2-8d46-4b53-9c03-6ea3f9e47292`). It has the demonstration media fixture and future inventory; it was not approved for sale.
6. Open Bulk upload. Fresh fixture files are in the evidence directory. `ux-products.xlsx` has already been imported, so reusing it should correctly report a duplicate. Use a new unique product code for another import. `ux-rates.csv` targets only the newly imported staging cohort and has already been applied as a draft.
7. Use Super Admin Login to view the submitted demonstration activity and its read-only preview. Publishing was intentionally not exercised in this change.
8. Check 390px and 768px layouts, section selectors, save actions and keyboard access. The active saved theme must apply to login, registration and the working forms.

## Modified and new application files

- [App.tsx](C:/wamp64/www/voya-vendor-platform/activity-saas-frontend/src/App.tsx) — modified
- [Login.test.tsx](C:/wamp64/www/voya-vendor-platform/activity-saas-frontend/src/Login.test.tsx) — modified
- [BasicInfoStep.tsx](C:/wamp64/www/voya-vendor-platform/activity-saas-frontend/src/components/product-wizard/BasicInfoStep.tsx) — modified
- [ExperienceWizardModal.test.tsx](C:/wamp64/www/voya-vendor-platform/activity-saas-frontend/src/components/product-wizard/ExperienceWizardModal.test.tsx) — modified
- [ExperienceWizardModal.tsx](C:/wamp64/www/voya-vendor-platform/activity-saas-frontend/src/components/product-wizard/ExperienceWizardModal.tsx) — modified
- [WizardNavigation.tsx](C:/wamp64/www/voya-vendor-platform/activity-saas-frontend/src/components/product-wizard/WizardNavigation.tsx) — modified
- [types.test.ts](C:/wamp64/www/voya-vendor-platform/activity-saas-frontend/src/components/product-wizard/types.test.ts) — modified
- [types.ts](C:/wamp64/www/voya-vendor-platform/activity-saas-frontend/src/components/product-wizard/types.ts) — modified
- [main.tsx](C:/wamp64/www/voya-vendor-platform/activity-saas-frontend/src/main.tsx) — modified
- [Onboarding.test.tsx](C:/wamp64/www/voya-vendor-platform/activity-saas-frontend/src/pages/Onboarding.test.tsx) — modified
- [Onboarding.tsx](C:/wamp64/www/voya-vendor-platform/activity-saas-frontend/src/pages/Onboarding.tsx) — modified
- [vite-env.d.ts](C:/wamp64/www/voya-vendor-platform/activity-saas-frontend/src/vite-env.d.ts) — modified
- [PartnerIntroduction.tsx](C:/wamp64/www/voya-vendor-platform/activity-saas-frontend/src/components/PartnerIntroduction.tsx) — new
- [OnboardingCompanion.tsx](C:/wamp64/www/voya-vendor-platform/activity-saas-frontend/src/components/OnboardingCompanion.tsx) — new
- [ProductListingPreview.tsx](C:/wamp64/www/voya-vendor-platform/activity-saas-frontend/src/components/product-wizard/ProductListingPreview.tsx) — new
- [ProductListingPreview.test.tsx](C:/wamp64/www/voya-vendor-platform/activity-saas-frontend/src/components/product-wizard/ProductListingPreview.test.tsx) — new
- [partner-experience.css](C:/wamp64/www/voya-vendor-platform/activity-saas-frontend/src/partner-experience.css) — new
- [credits.json](C:/wamp64/www/voya-vendor-platform/activity-saas-frontend/src/assets/partner-experiences/credits.json) — new
- [munnar-jpg.jpg](C:/wamp64/www/voya-vendor-platform/activity-saas-frontend/src/assets/partner-experiences/munnar-jpg.jpg) — new
- [alleppey-jpg.jpg](C:/wamp64/www/voya-vendor-platform/activity-saas-frontend/src/assets/partner-experiences/alleppey-jpg.jpg) — new
- [kochi-jpg.jpg](C:/wamp64/www/voya-vendor-platform/activity-saas-frontend/src/assets/partner-experiences/kochi-jpg.jpg) — new

Design draw metadata is under `C:/wamp64/www/voya-vendor-platform/.taste-skill/voya-experience-20261127`. The evidence scripts under the local tmp directory are guarded staging helpers, not application runtime code.

## Assets

Munnar Tea Plantations and Chinese Fishing Nets 2: Ingo Mehling, CC BY-SA 4.0. Alleppey houseboat: Paul Arps, CC BY 2.0. Author/source/license links appear beside the selected photo and in credits.json. Photos are served locally. The fourth scene reuses the existing Voya coastal hero.

## Verification limits and review items

- No regressions were found in the checks above; these checks do not guarantee every possible browser/device/input combination.
- Real OpenAI, DLT SMS, external email delivery, payment gateways and client credentials were not exercised. Existing code paths remain; those integrations were outside this UI task.
- The new pending vendor was not approved and no real legal/KYC/bank evidence was submitted. The start/draft/recovery and required submission gates were checked in the browser; existing onboarding backend/frontend regression suites passed.
- No new booking, payout or settlement transaction was executed for this redesign. Their backend regression coverage and protected table hashes passed.
- Staging uses a previously restored snapshot rather than today's live database. Live verification remains a later deployment step after approval.
- Licensed photographs remain subject to their displayed attribution requirements. The demonstration product image is a clearly labelled upload fixture, not a real client catalogue photo.
- Review the original Voya presentation on staging before authorizing push/deployment. The implementation is currently uncommitted on the local branch.

## Evidence

Full machine-readable summary, test logs, browser assertions, before/after screenshots, API readbacks and database hashes are under `C:/wamp64/www/voya-vendor-platform/outputs/voya-experience-refresh-20261127`.

## Mobile account and animation follow-up

The mobile forms now follow all landing content, the new two-row Voya animation and FAQs, before the footer. Header account actions jump to and focus the selected form. The original custom theme is unchanged. REA static evidence and Codex browser runtime observations informed the original Voya motion implementation. Latest validation: 461 frontend tests, production build and entry budget passed; 9 new browser checks passed. See [C:/wamp64/www/voya-vendor-platform/docs/VOYA_MOBILE_ACCOUNT_AND_MOTION_20261127.md](C:/wamp64/www/voya-vendor-platform/docs/VOYA_MOBILE_ACCOUNT_AND_MOTION_20261127.md) for scope, evidence and limits. Earlier browser logs describe the initial implementation; the superseded “mobile login first” assertion is replaced by the final bottom-form checks.


## Latest client refinement: pause button removed

Removed the visible Pause/Resume motion control at the client’s request. Continuous animation, hover pause, offscreen suspension and reduced-motion static rendering remain. Updated the existing ribbon tests to remove the obsolete manual-control expectation. Focused ribbon/account/login tests and the production build passed; the Codex browser confirmed zero ribbon buttons and continuing movement. No push, deployment or live data change. See remove-pause-tests.log, remove-pause-build.log and remove-pause-browser.json in the evidence directory.
