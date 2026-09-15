-- Product-level meeting model and structured meeting point for progressive catalogue drafts.
CREATE TYPE "MeetingModel" AS ENUM ('FIXED_MEETING_POINT', 'PICKUP_AVAILABLE', 'FLEXIBLE_ENTRY');

ALTER TABLE "ProductRevision"
  ADD COLUMN "meetingModel" "MeetingModel",
  ADD COLUMN "meetingPoint" TEXT;
