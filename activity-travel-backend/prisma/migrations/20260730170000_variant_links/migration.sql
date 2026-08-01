ALTER TABLE "ActivitySchedule" ADD COLUMN "variantId" TEXT;
ALTER TABLE "PricePlan" ADD COLUMN "variantId" TEXT;

CREATE INDEX "ActivitySchedule_variantId_startsAt_idx" ON "ActivitySchedule"("variantId", "startsAt");
CREATE INDEX "PricePlan_variantId_isActive_idx" ON "PricePlan"("variantId", "isActive");

ALTER TABLE "ActivitySchedule" ADD CONSTRAINT "ActivitySchedule_variantId_fkey"
  FOREIGN KEY ("variantId") REFERENCES "ActivityVariant"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "PricePlan" ADD CONSTRAINT "PricePlan_variantId_fkey"
  FOREIGN KEY ("variantId") REFERENCES "ActivityVariant"("id") ON DELETE SET NULL ON UPDATE CASCADE;
