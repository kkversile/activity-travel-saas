-- Phase 12 finalize: status is canonical; enabled remains a derived compatibility field.

UPDATE "DistributionChannel"
SET "type" = 'INTERNAL_MARKETPLACE'
WHERE "code" = 'VOYA_AGENT';

UPDATE "RatePlanChannelMapping"
SET "status" = CASE WHEN "enabled" THEN 'ACTIVE'::"ChannelMappingStatus" ELSE 'DISABLED'::"ChannelMappingStatus" END
WHERE "status" = 'DRAFT'::"ChannelMappingStatus";

ALTER TABLE "RatePlanChannelMapping"
  ADD CONSTRAINT "RatePlanChannelMapping_status_enabled_consistency_check"
  CHECK (("status" IN ('DRAFT'::"ChannelMappingStatus", 'ACTIVE'::"ChannelMappingStatus") AND "enabled" = true)
      OR ("status" IN ('DISABLED'::"ChannelMappingStatus", 'RETIRED'::"ChannelMappingStatus") AND "enabled" = false));

ALTER TABLE "ChannelContract"
  ADD CONSTRAINT "ChannelContract_effective_window_check"
  CHECK ("effectiveTo" IS NULL OR "effectiveTo" > "effectiveFrom");

ALTER TABLE "ChannelInventoryRule"
  ADD CONSTRAINT "ChannelInventoryRule_limits_check"
  CHECK ("capacityBuffer" >= 0 AND ("maxPublishedCapacity" IS NULL OR "maxPublishedCapacity" > 0) AND ("maxUnitsPerQuote" IS NULL OR "maxUnitsPerQuote" > 0));

ALTER TABLE "ChannelContract"
  ADD CONSTRAINT "ChannelContract_availability_horizon_check"
  CHECK ("availabilityHorizonDays" > 0);
