CREATE TYPE "ScheduleType" AS ENUM ('ONE_TIME', 'RECURRING');

ALTER TABLE "ActivitySchedule" ADD COLUMN "scheduleType" "ScheduleType" NOT NULL DEFAULT 'ONE_TIME';
ALTER TABLE "ActivitySchedule" ADD COLUMN "recurrenceGroupId" TEXT;

CREATE INDEX "ActivitySchedule_recurrenceGroupId_idx" ON "ActivitySchedule"("recurrenceGroupId");
