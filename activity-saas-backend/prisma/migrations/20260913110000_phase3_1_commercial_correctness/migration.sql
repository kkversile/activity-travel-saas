CREATE TYPE "BookingMode_new" AS ENUM ('INSTANT', 'VENDOR_CONFIRMATION', 'MANUAL_ON_REQUEST');
ALTER TABLE "RatePlanCommercialVersion"
  ALTER COLUMN "bookingMode" TYPE "BookingMode_new"
  USING (CASE WHEN "bookingMode"::text = 'REQUEST' THEN NULL ELSE "bookingMode"::text::"BookingMode_new" END);
DROP TYPE "BookingMode";
ALTER TYPE "BookingMode_new" RENAME TO "BookingMode";

ALTER TABLE "BookingEconomicsSnapshot"
  ADD COLUMN "agentFacingAmount" DECIMAL(18,4) NOT NULL DEFAULT 0,
  ADD COLUMN "taxContext" JSONB NOT NULL DEFAULT '{}',
  ADD COLUMN "promotionFunder" "PromotionFunder",
  ADD COLUMN "promotionContext" JSONB NOT NULL DEFAULT '{}',
  ADD COLUMN "focContext" JSONB NOT NULL DEFAULT '{}',
  ADD COLUMN "commercialEligibility" JSONB NOT NULL DEFAULT '{}';
ALTER TABLE "BookingEconomicsSnapshot"
  ALTER COLUMN "agentFacingAmount" DROP DEFAULT,
  ALTER COLUMN "taxContext" DROP DEFAULT,
  ALTER COLUMN "promotionContext" DROP DEFAULT,
  ALTER COLUMN "focContext" DROP DEFAULT,
  ALTER COLUMN "commercialEligibility" DROP DEFAULT;
