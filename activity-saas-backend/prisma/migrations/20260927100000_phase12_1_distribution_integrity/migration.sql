ALTER TABLE "public"."DistributionChannel"
  ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1;

ALTER TABLE "public"."ProductChannelMapping"
  ADD COLUMN "activatedAt" TIMESTAMP(3);

ALTER TABLE "public"."VariantChannelMapping"
  ADD COLUMN "activatedAt" TIMESTAMP(3);

UPDATE "public"."ProductChannelMapping"
SET "activatedAt" = COALESCE("updatedAt", "createdAt")
WHERE "status" = 'ACTIVE' AND "activatedAt" IS NULL;

UPDATE "public"."VariantChannelMapping"
SET "activatedAt" = COALESCE("updatedAt", "createdAt")
WHERE "status" = 'ACTIVE' AND "activatedAt" IS NULL;

CREATE INDEX "ProductChannelMapping_channelId_activatedAt_idx"
  ON "public"."ProductChannelMapping" ("channelId", "activatedAt");

CREATE INDEX "VariantChannelMapping_channelId_activatedAt_idx"
  ON "public"."VariantChannelMapping" ("channelId", "activatedAt");
