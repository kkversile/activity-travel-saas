ALTER TABLE "Payment" ADD COLUMN "idempotencyKey" TEXT;

CREATE UNIQUE INDEX "Payment_tenantId_idempotencyKey_key" ON "Payment"("tenantId", "idempotencyKey");
