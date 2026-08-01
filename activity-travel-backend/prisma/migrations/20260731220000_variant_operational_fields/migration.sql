ALTER TABLE "ActivityVariant" ADD COLUMN "durationMinutes" INTEGER;
ALTER TABLE "ActivityVariant" ADD COLUMN "capacityMode" TEXT NOT NULL DEFAULT 'SHARED';
ALTER TABLE "ActivityVariant" ADD COLUMN "meetingPoint" TEXT;
