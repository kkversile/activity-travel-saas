CREATE TABLE "ProductVariantTicketType" (
  "id" TEXT NOT NULL,
  "variantId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "ageFrom" INTEGER,
  "ageTo" INTEGER,
  "needsAdult" BOOLEAN NOT NULL DEFAULT false,
  "countsCapacity" BOOLEAN NOT NULL DEFAULT true,
  "rank" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ProductVariantTicketType_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ProductVariantTicketType_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "ProductVariant"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "ProductVariantTicketType_variantId_rank_idx" ON "ProductVariantTicketType"("variantId", "rank");

CREATE TABLE "ProductVariantUnit" (
  "id" TEXT NOT NULL,
  "variantId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "minPax" INTEGER NOT NULL DEFAULT 1,
  "maxPax" INTEGER NOT NULL DEFAULT 1,
  "paxIncluded" INTEGER NOT NULL DEFAULT 1,
  "extraPerPerson" DECIMAL(12,2),
  "unitsPerSlot" INTEGER NOT NULL DEFAULT 1,
  "rank" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ProductVariantUnit_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ProductVariantUnit_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "ProductVariant"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "ProductVariantUnit_variantId_rank_idx" ON "ProductVariantUnit"("variantId", "rank");

-- Preserve the existing editor data while moving the prototype option data into
-- first-class records. Invalid or missing numeric values remain NULL/defaulted.
INSERT INTO "ProductVariantTicketType" ("id", "variantId", "name", "ageFrom", "ageTo", "needsAdult", "countsCapacity", "rank", "updatedAt")
SELECT gen_random_uuid()::text, v."id", COALESCE(NULLIF(item->>'name', ''), 'Adult'), NULLIF(item->>'ageFrom', '')::integer, NULLIF(item->>'ageTo', '')::integer,
       COALESCE((item->>'needsAdult')::boolean, false), COALESCE((item->>'countsCapacity')::boolean, true), ordinality - 1, CURRENT_TIMESTAMP
FROM "ProductVariant" v
CROSS JOIN LATERAL jsonb_array_elements(COALESCE(v."sourcePayload"->'prototype'->'ticketTypes', '[]'::jsonb)) WITH ORDINALITY AS entries(item, ordinality);

INSERT INTO "ProductVariantUnit" ("id", "variantId", "name", "minPax", "maxPax", "paxIncluded", "extraPerPerson", "unitsPerSlot", "rank", "updatedAt")
SELECT gen_random_uuid()::text, v."id", COALESCE(NULLIF(item->>'name', ''), 'UNIT'),
       COALESCE(NULLIF(item->>'minPax', '')::integer, 1), COALESCE(NULLIF(item->>'maxPax', '')::integer, 1), COALESCE(NULLIF(item->>'paxIncluded', '')::integer, 1),
       NULLIF(item->>'extraPerPerson', '')::numeric, COALESCE(NULLIF(item->>'unitsPerSlot', '')::integer, 1), ordinality - 1, CURRENT_TIMESTAMP
FROM "ProductVariant" v
CROSS JOIN LATERAL jsonb_array_elements(COALESCE(v."sourcePayload"->'prototype'->'unitRows', '[]'::jsonb)) WITH ORDINALITY AS entries(item, ordinality);
