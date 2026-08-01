ALTER TABLE "Activity" ADD COLUMN "publishedAt" TIMESTAMP(3);

CREATE INDEX "Activity_tenantId_publishedAt_idx" ON "Activity"("tenantId", "publishedAt");
