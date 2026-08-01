ALTER TABLE "RecurringSchedule" ADD COLUMN "tenantId" TEXT;
UPDATE "RecurringSchedule" child
SET "tenantId" = parent."tenantId"
FROM "Activity" parent
WHERE child."activityId" = parent."id";
ALTER TABLE "RecurringSchedule" ALTER COLUMN "tenantId" SET NOT NULL;
ALTER TABLE "RecurringSchedule" ADD CONSTRAINT "RecurringSchedule_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
CREATE INDEX "RecurringSchedule_tenantId_startsOn_endsOn_idx" ON "RecurringSchedule"("tenantId", "startsOn", "endsOn");

ALTER TABLE "ActivitySchedule" ADD COLUMN "tenantId" TEXT;
UPDATE "ActivitySchedule" child
SET "tenantId" = parent."tenantId"
FROM "Activity" parent
WHERE child."activityId" = parent."id";
ALTER TABLE "ActivitySchedule" ALTER COLUMN "tenantId" SET NOT NULL;
ALTER TABLE "ActivitySchedule" ADD CONSTRAINT "ActivitySchedule_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
CREATE INDEX "ActivitySchedule_tenantId_startsAt_idx" ON "ActivitySchedule"("tenantId", "startsAt");

ALTER TABLE "PricePlan" ADD COLUMN "tenantId" TEXT;
UPDATE "PricePlan" child
SET "tenantId" = parent."tenantId"
FROM "Activity" parent
WHERE child."activityId" = parent."id";
ALTER TABLE "PricePlan" ALTER COLUMN "tenantId" SET NOT NULL;
ALTER TABLE "PricePlan" ADD CONSTRAINT "PricePlan_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
CREATE INDEX "PricePlan_tenantId_isActive_validFrom_validTo_idx" ON "PricePlan"("tenantId", "isActive", "validFrom", "validTo");

ALTER TABLE "ActivityImage" ADD COLUMN "tenantId" TEXT;
UPDATE "ActivityImage" child
SET "tenantId" = parent."tenantId"
FROM "Activity" parent
WHERE child."activityId" = parent."id";
ALTER TABLE "ActivityImage" ALTER COLUMN "tenantId" SET NOT NULL;
ALTER TABLE "ActivityImage" ADD CONSTRAINT "ActivityImage_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ActivityVariant" ADD COLUMN "tenantId" TEXT;
UPDATE "ActivityVariant" child
SET "tenantId" = parent."tenantId"
FROM "Activity" parent
WHERE child."activityId" = parent."id";
ALTER TABLE "ActivityVariant" ALTER COLUMN "tenantId" SET NOT NULL;
ALTER TABLE "ActivityVariant" ADD CONSTRAINT "ActivityVariant_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
CREATE INDEX "ActivityVariant_tenantId_isActive_name_idx" ON "ActivityVariant"("tenantId", "isActive", "name");

ALTER TABLE "CancellationRule" ADD COLUMN "tenantId" TEXT;
UPDATE "CancellationRule" child
SET "tenantId" = parent."tenantId"
FROM "Activity" parent
WHERE child."activityId" = parent."id";
ALTER TABLE "CancellationRule" ALTER COLUMN "tenantId" SET NOT NULL;
ALTER TABLE "CancellationRule" ADD CONSTRAINT "CancellationRule_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
CREATE INDEX "CancellationRule_tenantId_activityId_hoursBefore_idx" ON "CancellationRule"("tenantId", "activityId", "hoursBefore");

ALTER TABLE "ScheduleBlackout" ADD COLUMN "tenantId" TEXT;
UPDATE "ScheduleBlackout" child
SET "tenantId" = parent."tenantId"
FROM "ActivitySchedule" schedule
JOIN "Activity" parent ON parent."id" = schedule."activityId"
WHERE child."scheduleId" = schedule."id";
ALTER TABLE "ScheduleBlackout" ALTER COLUMN "tenantId" SET NOT NULL;
ALTER TABLE "ScheduleBlackout" ADD CONSTRAINT "ScheduleBlackout_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
CREATE INDEX "ScheduleBlackout_tenantId_date_idx" ON "ScheduleBlackout"("tenantId", "date");

ALTER TABLE "Passenger" ADD COLUMN "tenantId" TEXT;
UPDATE "Passenger" child
SET "tenantId" = parent."tenantId"
FROM "Booking" parent
WHERE child."bookingId" = parent."id";
ALTER TABLE "Passenger" ALTER COLUMN "tenantId" SET NOT NULL;
ALTER TABLE "Passenger" ADD CONSTRAINT "Passenger_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
CREATE INDEX "Passenger_tenantId_bookingId_idx" ON "Passenger"("tenantId", "bookingId");
