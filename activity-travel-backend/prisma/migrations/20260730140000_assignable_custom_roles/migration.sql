ALTER TABLE "TenantMembership" ADD COLUMN "customRoleId" TEXT;

CREATE INDEX "TenantMembership_tenantId_customRoleId_idx" ON "TenantMembership"("tenantId", "customRoleId");

ALTER TABLE "TenantMembership" ADD CONSTRAINT "TenantMembership_customRoleId_fkey"
  FOREIGN KEY ("customRoleId") REFERENCES "CustomRole"("id") ON DELETE SET NULL ON UPDATE CASCADE;
