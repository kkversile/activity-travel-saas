-- The initial counter backfill also matched numeric tails in identifiers that
-- are never allocated through allocatePublicCode (for example EVT UUIDs and
-- fixed vendor payout codes). Keep only counter namespaces used by the code.
DELETE FROM "PublicIdentifierSequence"
WHERE "entityType" NOT IN (
  'APPROVAL',
  'BOOKING',
  'COMMERCIAL_RULE',
  'MASTER_PRODUCT',
  'PRODUCT',
  'REFUND',
  'SELECTION_RULE_SET',
  'SETTLEMENT_BATCH',
  'USER',
  'VENDOR',
  'WALLET_LEDGER'
);
