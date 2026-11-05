CREATE TABLE "PublicIdentifierSequence" (
  "entityType" TEXT NOT NULL,
  "prefix" TEXT NOT NULL,
  "lastValue" INTEGER NOT NULL,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PublicIdentifierSequence_pkey" PRIMARY KEY ("entityType", "prefix")
);

-- Resume each allocator after the highest code already issued with that
-- prefix. PublicIdentifier rows are retained permanently, including for
-- archived or deleted domain records, so numbers are never recycled.
INSERT INTO "PublicIdentifierSequence" ("entityType", "prefix", "lastValue")
SELECT identifiers."entityType", matched.captures[1], MAX(matched.captures[2]::INTEGER)
FROM "PublicIdentifier" identifiers
CROSS JOIN LATERAL regexp_match(identifiers."publicCode", '^(.*?)([0-9]+)$') AS matched(captures)
WHERE length(matched.captures[2]) <= 7
GROUP BY identifiers."entityType", matched.captures[1];
