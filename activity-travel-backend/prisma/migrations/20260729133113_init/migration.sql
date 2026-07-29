-- AlterTable
ALTER TABLE "ActivitySchedule" ADD COLUMN     "cutoffMinutes" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "Booking" ADD COLUMN     "commissionMinor" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "refundMinor" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "CancellationRule" (
    "id" TEXT NOT NULL,
    "activityId" TEXT NOT NULL,
    "hoursBefore" INTEGER NOT NULL,
    "refundPercent" INTEGER NOT NULL,

    CONSTRAINT "CancellationRule_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CancellationRule_activityId_hoursBefore_idx" ON "CancellationRule"("activityId", "hoursBefore");

-- CreateIndex
CREATE UNIQUE INDEX "CancellationRule_activityId_hoursBefore_key" ON "CancellationRule"("activityId", "hoursBefore");

-- AddForeignKey
ALTER TABLE "CancellationRule" ADD CONSTRAINT "CancellationRule_activityId_fkey" FOREIGN KEY ("activityId") REFERENCES "Activity"("id") ON DELETE CASCADE ON UPDATE CASCADE;
