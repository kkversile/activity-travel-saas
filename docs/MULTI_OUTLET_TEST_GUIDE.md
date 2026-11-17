# Multi-outlet acceptance test guide

Use the isolated local demo at http://127.0.0.1:3007/ first. These fixtures are not installed on the client-facing live demo. All banking records and proof documents are illustrative. Do not submit real transfers or alter client records while following this guide.

## Live demo after deployment

Live is deployed at https://demo.dhisoft.in/voya/ as `be71cc3`. Use your existing account, or the Harbour Trails owner session left open in Codex. That separate illustrative workspace has Fort Kochi/Munnar/Alleppey/Wayanad, four private drafts and A-only/A+C employees. Its bank account intentionally remains PENDING; do not approve the illustrative proof as real verification. Local `.local` accounts below are not live accounts. See `MULTI_OUTLET_LIVE_DEPLOYMENT.md` for backup locations, live results and private demo credential storage.

## Local accounts

All accounts below use password `LocalOutlet@123`. Use Sign out between accounts, or separate browser profiles for owner and employee sessions. The app stores its session in localStorage, so ordinary tabs of the same browser share credentials.

| Account | Email | Expected access |
| --- | --- | --- |
| Master owner | owner@abc.local | All outlets and A/B/C/D |
| A catalogue employee | a@abc.local | A products/pricing; no other outlets |
| A operations employee | operations-a@abc.local | A bookings/inventory/fulfilment |
| A/C operations employee | ac@abc.local | Explicit A or C selection |
| Admin maker | maker@platform.local | Settlement previews and beneficiary review |
| Admin checker | checker@platform.local | Separate approval identity; do not release money during client testing |

## Ten-minute walkthrough

1. **Owner aggregate.** Sign in as owner. Open Home with All outlets selected. Open Products and Bookings. Expect the four outlet fixtures, with booking references ABC-LOCAL-A through ABC-LOCAL-D. Amounts/statuses can differ: A was completed and D cancelled for regression checks.
2. **Owner switching.** Select A, then B, C and D. Products, bookings, inventory and performance must refresh to that outlet. The address query must change. Navigate to another page, reload, then use Back/Forward; the selected outlet and data must agree. All outlets restores the combined view.
3. **Manage outlets.** Open Team & settings, then Outlets and payout accounts. Inspect A-D. Add a new location with a unique code, edit its name/location, and reload. Expect saved values and no change to historical booking attribution. Use this newly created location for exploratory changes so the A-D fixture stays intact.
4. **Single-outlet employee.** Sign out and sign in as a@abc.local. Expect only an A scope label and no All outlets option. Products, bookings, performance and downloads must contain A data only. This catalogue role cannot perform operations-only actions; use operations-a@abc.local for check-in/completion/inventory changes.
5. **Multiple assignments.** Sign in as ac@abc.local. Switch A to C and reload each. Expect only A/C choices, no B/D and no All outlets. The API intentionally rejects requests that omit selection when this user has several grants.
6. **Grant/revoke.** In a separate browser profile sign in as owner and open Employee outlet access. Existing A grants must appear checked. Uncheck A for a@abc.local. Refresh the employee page: it must fail closed, with no booking/product data despite its existing signed-in session. Recheck A as owner and retry: A access returns. Restore every change after this test. A success message alone is insufficient; inspect the employee session too.
7. **Shared/distinct banks.** As owner inspect A/C using Illustrative Bank X and B/D using Y. Newly entered accounts require an uploaded proof and remain PENDING. They must not appear as verified assignable options. As admin open Finance/Settlements bank review, open the demonstration proof, and provide a review note only for illustrative records. After verification, owner can select the account for multiple outlets. Previously issued payout beneficiary details must stay unchanged after reassignment; restore original A/C-X and B/D-Y assignments.
8. **Per-outlet finance.** As admin choose ABC Adventures and A, B, C, D individually in settlement previews. Inspect four separate issued settlement/payout records with the correct X/Y snapshots. D should show the -1000 cancellation deduction in a future preview. Recreating the same outlet/week payout must be rejected; changing outlet must not combine it with another outlet even when the bank is shared. Stop before release approval, reconciliation edits or any real payment.

## Additional acceptance tests

| Scenario | Action | Expected result |
| --- | --- | --- |
| Invitation | Owner invites a controlled mailbox as Operations with A/C checked; accept the invitation | User has Operations role and A/C only; cannot self-upgrade; invitation cannot be reused |
| Inventory | As ac@abc.local select C, create a resource and preview/apply a capacity edit | Resource and capacity change belong to C; A/B/D unchanged |
| Isolation by guessed URL | In an employee session request a B product/booking/resource/private file ID copied from owner | API returns 403/404; no B data or file; changing query outletId must not bypass the restriction |
| Exports | Download bookings/reports while scoped to A | Only A rows; B report/download IDs are denied |
| Inactive outlet | Owner deactivates a location with existing obligations; operations user inspects its history and completes a valid existing booking | History and valid obligations work, new sales/listings are blocked; reactivate afterward |
| Last active outlet | Attempt to deactivate the last active outlet | Rejected, leaving one active/default outlet |
| Account reset | Sign out while A selected; sign in as a different user | Old outlet selection and rows do not appear for the new account |
| Existing single-outlet vendor | Use a backfilled legacy vendor | No extra selection friction; old identifiers, amounts, legal identity and historical payouts unchanged |
| Existing application | Check login/register, onboarding, agent discovery/booking, admin approvals, configured theme, sidebar and sign-out | Existing flows work and configured colors remain unchanged |
| Bank revocation | Disposable local data only: revoke an issued payout's bank before request and again before checker approval | Both release stages reject it; no release event posted and original beneficiary snapshot retained |

The supplied local integration script automates negative guessed-ID access, live JWT revocation, invitation escalation/replay, private downloads, bank separation, migration economics, cancellation, inactive obligations and real concurrent settlements. It disables mail delivery and runs only on the named disposable local database. Do not run it against live.

## Before client-facing rollout

A Git push and a live deployment are separate decisions. Confirm that the chosen branch does not trigger automatic deployment. Include the currently untracked outlet modules, migration, frontend components and scripts explicitly; do not stage unrelated archives, storage, .env files or local artifacts.

The actual snapshot rehearsal and target checks have now passed on isolated PostgreSQL 16 and matching PostgreSQL 15.20 copies; see MULTI_OUTLET_STAGING_REHEARSAL.md. Before switching live traffic, obtain deployment/DB approval, take a fresh backup and repeat freshness checks because the source can change after the snapshot. Then apply the additive migration, dry-run/apply/repeat the backfill, inspect orphan/ambiguous records and bank provenance, and compare financial counts/snapshots. The old application must not keep creating unattributed records while backfill and cutover occur: use a controlled write pause or an explicitly tested final catch-up. Bring matching backend/frontend online together, smoke-test owner/employee/agent/admin flows and keep the previous release available for rollback.

Existing historical canonical payouts with no verified issued beneficiary are intentionally blocked from new release pending reconciliation. The older chronological migration chain also has a pre-existing DemandTargetStatus ordering defect for fresh installs. Neither should be bypassed during a live demo. See MULTI_OUTLET_IMPLEMENTATION_REPORT.md for evidence and limitations.
