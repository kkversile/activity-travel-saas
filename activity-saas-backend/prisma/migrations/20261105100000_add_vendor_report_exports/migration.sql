CREATE TABLE "VendorReportExport" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "format" TEXT NOT NULL,
    "fromDate" TIMESTAMP(3),
    "toDate" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "rows" JSONB,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "VendorReportExport_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "VendorReportExport_tenantId_createdAt_idx" ON "VendorReportExport"("tenantId", "createdAt");
CREATE INDEX "VendorReportExport_status_createdAt_idx" ON "VendorReportExport"("status", "createdAt");

ALTER TABLE "VendorReportExport"
ADD CONSTRAINT "VendorReportExport_tenantId_fkey"
FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Preserve previously generated tenant reports in the normalized export table.
INSERT INTO "VendorReportExport" (
    "id", "tenantId", "name", "type", "format", "status", "rows", "createdAt", "completedAt", "updatedAt"
)
SELECT
    report->>'id',
    setting."tenantId",
    COALESCE(report->>'name', 'Report'),
    COALESCE(report->>'type', 'BOOKINGS'),
    COALESCE(report->>'format', 'CSV'),
    'READY',
    COALESCE(report->'rows', '[]'::jsonb),
    COALESCE((report->>'createdAt')::timestamp, CURRENT_TIMESTAMP),
    COALESCE((report->>'createdAt')::timestamp, CURRENT_TIMESTAMP),
    CURRENT_TIMESTAMP
FROM "global_settings" setting
CROSS JOIN LATERAL jsonb_array_elements(COALESCE(setting."value"->'reports', '[]'::jsonb)) AS legacy(report)
WHERE setting."key" = 'vendor_reports'
  AND setting."tenantId" IS NOT NULL
  AND report->>'id' IS NOT NULL
ON CONFLICT ("id") DO NOTHING;
