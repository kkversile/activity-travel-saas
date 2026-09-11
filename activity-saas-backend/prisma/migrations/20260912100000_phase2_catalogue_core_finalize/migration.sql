-- DropForeignKey
ALTER TABLE "Activity" DROP CONSTRAINT "Activity_tenantId_fkey";

-- DropForeignKey
ALTER TABLE "ActivityMedia" DROP CONSTRAINT "ActivityMedia_activityId_fkey";

-- DropForeignKey
ALTER TABLE "Booking" DROP CONSTRAINT "Booking_activityId_fkey";

-- DropForeignKey
ALTER TABLE "PricingRule" DROP CONSTRAINT "PricingRule_activityId_fkey";

-- DropForeignKey
ALTER TABLE "Promotion" DROP CONSTRAINT "Promotion_activityId_fkey";

-- DropForeignKey
ALTER TABLE "RatePlan" DROP CONSTRAINT "RatePlan_activityId_fkey";

-- DropIndex
DROP INDEX "PricingRule_activityId_active_idx";

-- DropIndex
DROP INDEX "Promotion_activityId_active_idx";

-- DropIndex
DROP INDEX "RatePlan_activityId_ratePlanCode_key";

-- DropIndex
DROP INDEX "RatePlan_activityId_status_idx";

-- AlterTable
ALTER TABLE "Booking" DROP COLUMN "activityId",
ALTER COLUMN "productId" SET NOT NULL;

-- AlterTable
ALTER TABLE "PricingRule" DROP COLUMN "activityId",
ALTER COLUMN "productId" SET NOT NULL;

-- AlterTable
ALTER TABLE "Promotion" DROP COLUMN "activityId",
ALTER COLUMN "productId" SET NOT NULL;

-- AlterTable
ALTER TABLE "RatePlan" DROP COLUMN "activityId",
DROP COLUMN "attachedHotelIds",
DROP COLUMN "dropoffIncluded",
DROP COLUMN "dropoffTimings",
DROP COLUMN "durationMinutes",
DROP COLUMN "entryFeeIncluded",
DROP COLUMN "exclusions",
DROP COLUMN "formDataRequired",
DROP COLUMN "inclusions",
DROP COLUMN "luxuryTier",
DROP COLUMN "mealIncluded",
DROP COLUMN "mealType",
DROP COLUMN "mealVariety",
DROP COLUMN "menu",
DROP COLUMN "pickupIncluded",
DROP COLUMN "pickupInput",
DROP COLUMN "pickupTimings",
DROP COLUMN "pickupType",
DROP COLUMN "pointsOfInterest",
DROP COLUMN "privateShared",
DROP COLUMN "salience",
DROP COLUMN "sameItineraryVendor",
DROP COLUMN "sightseeingIds",
DROP COLUMN "suitableFor",
DROP COLUMN "ticketLinkedToSightseeing",
DROP COLUMN "transferType",
DROP COLUMN "vehicleType",
DROP COLUMN "vendorCode",
DROP COLUMN "vendorRatePlanCode",
DROP COLUMN "zoneApplicable",
ALTER COLUMN "variantId" SET NOT NULL;

-- DropTable
DROP TABLE "Activity";

-- DropTable
DROP TABLE "ActivityMedia";

-- CreateIndex
CREATE INDEX "PricingRule_productId_active_idx" ON "PricingRule"("productId", "active");

-- CreateIndex
CREATE INDEX "Promotion_productId_active_idx" ON "Promotion"("productId", "active");

-- CreateIndex
CREATE INDEX "RatePlan_variantId_status_idx" ON "RatePlan"("variantId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "RatePlan_variantId_ratePlanCode_key" ON "RatePlan"("variantId", "ratePlanCode");

