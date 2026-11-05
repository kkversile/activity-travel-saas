-- Older vendor-document fixtures were created without the FileAsset ->
-- VendorDocument relationship fields. Rebuild those fields from the
-- authoritative VendorDocumentVersion relation so private document access
-- can remain tenant-scoped and relationship-checked.
UPDATE "FileAsset" AS asset
SET
  "entityType" = 'VendorDocument',
  "entityId" = version."vendorDocumentId"
FROM "VendorDocumentVersion" AS version
WHERE asset."id" = version."fileAssetId"
  AND asset."purpose" = 'VENDOR_DOCUMENT'
  AND (
    asset."entityType" IS DISTINCT FROM 'VendorDocument'
    OR asset."entityId" IS DISTINCT FROM version."vendorDocumentId"
  );
