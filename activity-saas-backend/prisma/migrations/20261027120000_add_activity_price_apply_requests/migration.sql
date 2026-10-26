CREATE TABLE "ActivityPriceApplyRequest" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "productId" TEXT NOT NULL,
  "idempotencyKey" TEXT NOT NULL,
  "payloadFingerprint" TEXT NOT NULL,
  "responsePayload" JSONB,
  "createdById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ActivityPriceApplyRequest_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ActivityPriceApplyRequest_tenantId_idempotencyKey_key" ON "ActivityPriceApplyRequest"("tenantId", "idempotencyKey");
CREATE INDEX "ActivityPriceApplyRequest_productId_createdAt_idx" ON "ActivityPriceApplyRequest"("productId", "createdAt");

ALTER TABLE "ActivityPriceApplyRequest" ADD CONSTRAINT "ActivityPriceApplyRequest_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ActivityPriceApplyRequest" ADD CONSTRAINT "ActivityPriceApplyRequest_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ActivityPriceApplyRequest" ADD CONSTRAINT "ActivityPriceApplyRequest_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
