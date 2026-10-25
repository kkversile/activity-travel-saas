ALTER TABLE "Product"
ADD COLUMN "sourceImportKey" TEXT,
ADD COLUMN "importFingerprint" TEXT,
ADD COLUMN "importIdempotencyKey" TEXT;

CREATE UNIQUE INDEX "Product_tenantId_sourceImportKey_key"
ON "Product"("tenantId", "sourceImportKey");

CREATE UNIQUE INDEX "Product_tenantId_importFingerprint_key"
ON "Product"("tenantId", "importFingerprint");

CREATE UNIQUE INDEX "Product_tenantId_importIdempotencyKey_key"
ON "Product"("tenantId", "importIdempotencyKey");
