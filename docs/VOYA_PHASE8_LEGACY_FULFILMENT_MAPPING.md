# VOYA Phase 8 Legacy Fulfilment Mapping

## Inspection result

The prepare migration inspected the legacy RatePlan columns before final removal. The live database contained 44 RatePlans and 19 published ProductRevisions. Forty RatePlans were connected to published revision/product relationships and 19 revision policies were created by the backfill.

Legacy fields were not guessed into runtime behavior. The observed non-default signal was limited to `ticketOnly=true` and `offlineVoucher=true` on two products; these flags conflicted with default/ambiguous legacy semantics and did not prove a customer-safe ticket, QR, or automatic fulfilment contract. Other fields were null/default in the inspected records. `generatePnr`, `label`, `vendorVoucherFlag`, `autoRedeem`, and `qrType` did not provide a proven mapping in the source data.

## Mapping decision

All 19 generated policies were created with `mode=null` and `reviewRequired=true`, preserving source RatePlan IDs, product/revision/variant relationships, observed legacy values, and conflict/ambiguity notes in `migrationMetadata`. No `ticketOnly -> TICKET_QR`, `offlineVoucher -> AUTO`, `autoRedeem -> anything`, or unproven PNR mapping was performed.

Operators must resolve each policy in a DRAFT ProductRevision and submit it through the existing review workflow. This prevents historical flags from silently changing the fulfilment promise of a new sellable revision.

## Migration sequence

1. Prepare migration creates policy structures and retains legacy columns.
2. `npm run backfill:phase8` inspects and records provenance.
3. Operators resolve `REVIEW_REQUIRED` policies.
4. Finalize migration removes legacy RatePlan fulfilment columns.

The backfill script remains in the repository for controlled use on a database where the prepare stage still exists; it intentionally cannot be rerun against the finalized schema without first restoring the legacy columns in a separate migration plan.
