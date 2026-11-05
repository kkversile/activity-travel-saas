ALTER TABLE "ProductRevision"
  ADD COLUMN "durationValue" TEXT,
  ADD COLUMN "durationUnit" TEXT,
  ADD COLUMN "guideIncluded" TEXT,
  ADD COLUMN "guideLanguages" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "included" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "notIncluded" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "endPoint" TEXT,
  ADD COLUMN "thingsToKnow" TEXT,
  ADD COLUMN "accessibility" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "followItinerary" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "voucherCodeSource" TEXT,
  ADD COLUMN "voucherAcceptedAs" TEXT,
  ADD COLUMN "voucherInstructions" TEXT,
  ADD COLUMN "cancellationPreset" TEXT,
  ADD COLUMN "travellerDetails" TEXT,
  ADD COLUMN "amendmentPolicy" TEXT;

UPDATE "ProductRevision"
SET
  "durationValue" = NULLIF("sourcePayload"->'prototype'->>'durationValue', ''),
  "durationUnit" = NULLIF("sourcePayload"->'prototype'->>'durationUnit', ''),
  "guideIncluded" = NULLIF("sourcePayload"->'prototype'->>'guideIncluded', ''),
  "guideLanguages" = CASE WHEN jsonb_typeof("sourcePayload"->'prototype'->'guideLanguages') = 'array' THEN ARRAY(SELECT jsonb_array_elements_text("sourcePayload"->'prototype'->'guideLanguages')) WHEN NULLIF("sourcePayload"->'prototype'->>'guideLanguages', '') IS NOT NULL THEN regexp_split_to_array("sourcePayload"->'prototype'->>'guideLanguages', '\s*,\s*') ELSE ARRAY[]::TEXT[] END,
  "included" = CASE WHEN jsonb_typeof("sourcePayload"->'prototype'->'included') = 'array' THEN ARRAY(SELECT jsonb_array_elements_text("sourcePayload"->'prototype'->'included')) WHEN NULLIF("sourcePayload"->'prototype'->>'included', '') IS NOT NULL THEN regexp_split_to_array("sourcePayload"->'prototype'->>'included', '\s*[,\n]\s*') ELSE ARRAY[]::TEXT[] END,
  "notIncluded" = CASE WHEN jsonb_typeof("sourcePayload"->'prototype'->'notIncluded') = 'array' THEN ARRAY(SELECT jsonb_array_elements_text("sourcePayload"->'prototype'->'notIncluded')) WHEN NULLIF("sourcePayload"->'prototype'->>'notIncluded', '') IS NOT NULL THEN regexp_split_to_array("sourcePayload"->'prototype'->>'notIncluded', '\s*[,\n]\s*') ELSE ARRAY[]::TEXT[] END,
  "endPoint" = NULLIF("sourcePayload"->'prototype'->>'endPoint', ''),
  "thingsToKnow" = NULLIF("sourcePayload"->'prototype'->>'thingsToKnow', ''),
  "accessibility" = CASE WHEN jsonb_typeof("sourcePayload"->'prototype'->'accessibility') = 'array' THEN ARRAY(SELECT jsonb_array_elements_text("sourcePayload"->'prototype'->'accessibility')) WHEN NULLIF("sourcePayload"->'prototype'->>'accessibility', '') IS NOT NULL THEN regexp_split_to_array("sourcePayload"->'prototype'->>'accessibility', '\s*[,\n]\s*') ELSE ARRAY[]::TEXT[] END,
  "followItinerary" = COALESCE(("sourcePayload"->'prototype'->>'followItinerary')::BOOLEAN, true),
  "voucherCodeSource" = NULLIF("sourcePayload"->'prototype'->>'voucherCodeSource', ''),
  "voucherAcceptedAs" = NULLIF("sourcePayload"->'prototype'->>'voucherAcceptedAs', ''),
  "voucherInstructions" = NULLIF("sourcePayload"->'prototype'->>'voucherInstructions', ''),
  "cancellationPreset" = NULLIF("sourcePayload"->'prototype'->>'cancellationPreset', ''),
  "travellerDetails" = NULLIF("sourcePayload"->'prototype'->>'travellerDetails', ''),
  "amendmentPolicy" = NULLIF("sourcePayload"->'prototype'->>'amendmentPolicy', '')
WHERE "sourcePayload" IS NOT NULL AND "sourcePayload" ? 'prototype';
