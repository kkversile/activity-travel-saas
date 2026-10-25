CREATE TABLE "public"."global_settings" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT,
  "key" TEXT NOT NULL,
  "value" JSONB NOT NULL DEFAULT '{}',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "global_settings_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "global_settings_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "public"."Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "global_settings_tenantId_key_key" ON "public"."global_settings"("tenantId", "key");
CREATE INDEX "global_settings_key_idx" ON "public"."global_settings"("key");
