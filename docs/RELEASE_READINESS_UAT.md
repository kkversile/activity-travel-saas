# Client UAT and training walkthrough

Prepared 19 November 2026. This is an acceptance worksheet; client attendance and sign-off remain pending. Rehearsal financial records are simulated and no bank transfers occur.

| Step | Demonstrate | Expected result |
| --- | --- | --- |
| 1 | Sign in as owner | Configured theme appears; owner can view All outlets. |
| 2 | Team & settings → Outlets | Manage named outlets and employee access through existing invitations. |
| 3 | Switch to one outlet | Dashboard, products, bookings, availability, reports and settlements use the selected outlet through navigation. |
| 4 | Sign in as single-outlet employee | Only authorized data/operations are available. Copied foreign outlet/booking/file/report links fail at the API. |
| 5 | Add bank details and proof | Pending until admin review; employees cannot approve or reassign banks. |
| 6 | Admin reviews sample documents/bank | Explicit demo notes. Outlets support separate or shared verified banks, with currency/active checks. |
| 7 | Create product for active outlet | Complete content, options, rates, schedules/capacity, policies and voucher details. Manual authoring and spreadsheets work without AI. |
| 8 | Approve product and channel setup | Published revision and active commercial/distribution rules expose the offer to approved agents. Activated identifiers stay stable when availability is toggled. |
| 9 | Agent searches, previews and books | Stale quotes fail; acknowledged snapshots are retained; concurrent requests cannot overbook or duplicate an idempotent booking. |
| 10 | Confirm on-request booking or review instant confirmation | Inventory and immutable operational/economics snapshots agree with financial events. |
| 11 | Generate voucher, upload PNR/evidence, check in and complete | Files are tenant/outlet authorized; retries and lifecycle changes preserve history. |
| 12 | Cancel and review refund status | Policy calculation, inventory release and financial permissions are correct; concurrent terminal decisions have one winner. |
| 13 | Preview/create outlet settlement | Only eligible unallocated events; holds, verified matching bank, weekly payout uniqueness and beneficiary snapshot enforced. |
| 14 | Maker requests release; checker approves; reconcile | Self-approval rejected; amount/reference match. Bank reassignment cannot rewrite an issued snapshot. Simulated status only. |
| 15 | Export reports and review email settings | Scoped CSV/XLSX/PDF; SMTP configuration required for delivery. Local capture covers scheduled CSV attachments. |
| 16 | Sign out and open existing single-outlet vendor | Sign-out works; old products/bookings/payouts remain under default outlet. |

Local review only: `serve-readiness.cjs` uses synthetic `owner@abc.local`, `a@abc.local`, `operations-a@abc.local`, password `LocalOutlet@123`. These are not live Harbour Trails credentials. The fixture includes an inactive outlet and revoked bank for negative tests; choose active Outlet B for new owner operations. Booking-matrix accounts/data are separate.

Record tester/date, environment/release, row pass/fail, evidence, issue owner, retest, training completion, provider setup and final client sign-off. Automated checks do not constitute client acceptance.

External acceptance remains for funded AI/direct OpenAI integration, SMS/DLT, genuine KYC/bank verification, SMTP/WhatsApp/OTA/payment provider credentials, real cloud storage/offsite backups, approved policies/content and production hosting/release approval. Run authenticated provider checks once credentials and approved accounts are available.
