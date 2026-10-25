ALTER TABLE "public"."Product" ADD COLUMN "deletedAt" TIMESTAMP(3);
ALTER TABLE "public"."Product" ADD COLUMN "deletedById" TEXT;
CREATE INDEX "Product_tenantId_deletedAt_idx" ON "public"."Product"("tenantId", "deletedAt");
