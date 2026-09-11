-- DropForeignKey
ALTER TABLE "AvailabilitySlot" DROP CONSTRAINT "AvailabilitySlot_ratePlanId_fkey";

-- AlterTable
ALTER TABLE "RatePlan" DROP COLUMN "blackoutDates",
DROP COLUMN "dynamicInventory",
DROP COLUMN "scheduleEndTime",
DROP COLUMN "scheduleStartTime",
DROP COLUMN "slotAvailable",
DROP COLUMN "timeOfDay",
DROP COLUMN "validDays";

-- DropTable
DROP TABLE "AvailabilitySlot";
