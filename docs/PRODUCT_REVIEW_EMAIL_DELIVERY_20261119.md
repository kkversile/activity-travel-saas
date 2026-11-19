# Product-review email delivery — 19 November 2026

## Change

Approval, rejection and Super Admin direct publication enqueue a dedicated `PRODUCT_REVIEW_EMAIL_REQUESTED` event in the same transaction as the reviewed revision. The former synchronous decision sender is removed. Submission/admin-edit notices retain their existing implementation. No schema migration, business backfill, finance setting or theme change is required.

The notification worker resolves the exact reviewed revision against its tenant, product and valid decision state. Messages identify the revision, use the stored rejection note and explain the next action. Approved older revisions can be superseded by delivery time; the message asks users to inspect the current product status rather than incorrectly claiming the product is still live.

Recipients are active workspace owners plus active CATALOGUE editors with an active grant to the product's active outlet. Existing permission checks exclude operations, finance and viewer users from review notices. Owner-only delivery is used for legacy unattributed products. The saved `reviewEmail` opt-out is enforced. Connection status now includes review email when SMTP is configured.

## Retry and rollout safety

The worker consumes only the new delivery event namespace, leaving historical `PRODUCT_PUBLISHED` and `PRODUCT_REJECTED` events untouched. This avoids replaying old decisions that the synchronous sender may already have emailed. Existing booking, payout and document notifications keep their event types and permission rules.

Successful recipients receive a hashed user/email receipt in the outbox payload. Partial delivery retries skip those receipts while checking current permissions again. A two-minute processing lease recovers interrupted review events only; five attempts remain the limit. Only one leased event is claimed per batch and delivered first, avoiding expiry while queued behind other claimed messages. SMTP connection/greeting/socket timeouts bound stalled requests and successful recipient receipts renew the lease.

SMTP delivery remains at least once: a process failure after SMTP acceptance but before persisting its receipt can cause a duplicate. SMTP acceptance also cannot prove inbox placement. No claim of exactly-once delivery or external inbox receipt is made.

## Reproduction and evidence

`scripts/verify-product-review-mail.cjs` requires a disposable `voya_readiness_review_mail_<digits>` PostgreSQL copy on `127.0.0.1:55445`, user `voya_staging`. It overrides SMTP to an authenticated in-process loopback sink incapable of forwarding messages. It creates clearly labelled fixtures and quarantines inherited pending outbox events on that copy only. Never use the verifier on a live database.

After the backend build, set `DATABASE_URL` to that dedicated staging copy and optionally `REVIEW_MAIL_EVIDENCE` to a JSON output path, then run `node scripts/verify-product-review-mail.cjs` from the backend directory.

The integration rehearsal captured eight messages and passed approval/rejection content, active outlet and role isolation, revoked grant exclusion, opt-out, foreign tenant and mismatched revision rejection, concurrent claims, partial delivery receipts, lease recovery, bounded attempts and historical event preservation. All 13 protected booking/finance/asset table fingerprints remained unchanged. Local logs and machine-readable results are under `outputs/product-review-email-20261119/` and excluded from Git. Deployment and regression results are recorded below after verification.

## Demo check

In the live vendor portal open **Team & settings → Notifications**. Product-review email should show its configured connection status and remain independently selectable. To receive a future actual review decision, use an authorized owner or CATALOGUE account with a controlled mailbox and enable the review-email preference. Submit a product through the normal QC process and have an authorized different administrator approve it or reject it with a reason. The worker normally checks every 30 seconds; retries use the existing exponential backoff. Owners receive aggregate workspace review decisions; employees receive only decisions for their authorized active outlets.

No sample emails are sent externally by the integration rehearsal or deployment verification. The live SMTP handshake is checked separately without issuing a message. Existing Harbour demonstration approvals, vouchers, blocked payouts and account grants must remain unchanged.

## Local regression results

Backend: **120 suites / 723 tests pass**; NestJS build passes. Frontend: **256 tests pass**; TypeScript and production build pass. The JavaScript build budget passes. Database-bootstrap safety guards pass **2/2** and operations checks pass **15/15**. The dedicated real PostgreSQL/SMTP rehearsal passes as described above. Deployment verification is recorded in the separate live deployment report.
