ALTER TABLE "BookingFulfilment"
  ADD COLUMN "generationToken" TEXT,
  ADD COLUMN "generationClaimedAt" TIMESTAMP(3),
  ADD COLUMN "generationLeaseExpiresAt" TIMESTAMP(3);

CREATE INDEX "BookingFulfilment_status_generationStatus_generationLeaseExpiresAt_generationRequestedAt_idx"
  ON "BookingFulfilment"("status", "generationStatus", "generationLeaseExpiresAt", "generationRequestedAt");
