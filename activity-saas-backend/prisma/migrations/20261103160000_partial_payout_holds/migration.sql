ALTER TABLE "Payout"
  ADD COLUMN "heldAmount" DECIMAL(18,4) NOT NULL DEFAULT 0,
  ADD COLUMN "heldHoldIds" JSONB NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE "PayoutReleaseApprovalRequest"
  ADD COLUMN "requestedAmount" DECIMAL(18,4);

UPDATE "PayoutReleaseApprovalRequest" request
SET "requestedAmount" = payout."amount"
FROM "Payout" payout
WHERE payout."id" = request."payoutId";

ALTER TABLE "PayoutReleaseApprovalRequest"
  ALTER COLUMN "requestedAmount" SET NOT NULL;
