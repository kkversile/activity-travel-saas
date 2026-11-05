-- Vendor documents use stable public codes in both Admin and Vendor views.
WITH ranked AS (
  SELECT "id", row_number() OVER (ORDER BY "createdAt", "id") AS ordinal
  FROM "VendorDocument"
)
INSERT INTO "PublicIdentifier" ("id", "entityType", "entityId", "publicCode", "createdAt", "updatedAt")
SELECT gen_random_uuid()::text, 'VENDOR_DOCUMENT', "id", 'DOC-' || lpad(ordinal::text, 6, '0'), CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM ranked
ON CONFLICT ("entityType", "entityId") DO NOTHING;
