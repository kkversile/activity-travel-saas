-- Phase 10.1 governance hardening. Existing Phase 10 rows are intentionally preserved.
CREATE UNIQUE INDEX "SupplierQualityPolicy_one_active_key" ON "SupplierQualityPolicy" ((1)) WHERE "status" = 'ACTIVE';
ALTER TABLE "SupplierQualityPolicy" ADD CONSTRAINT "SupplierQualityPolicy_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SupplierQualityPolicy" ADD CONSTRAINT "SupplierQualityPolicy_activatedById_fkey" FOREIGN KEY ("activatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "SupplierQualitySnapshot" ADD CONSTRAINT "SupplierQualitySnapshot_vendorTenantId_fkey" FOREIGN KEY ("vendorTenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SupplierTierAssignment" ADD CONSTRAINT "SupplierTierAssignment_vendorTenantId_fkey" FOREIGN KEY ("vendorTenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SupplierTierAssignment" ADD CONSTRAINT "SupplierTierAssignment_sourceSnapshotId_fkey" FOREIGN KEY ("sourceSnapshotId") REFERENCES "SupplierQualitySnapshot"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "SupplierTierAssignment" ADD CONSTRAINT "SupplierTierAssignment_assignedById_fkey" FOREIGN KEY ("assignedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SupplierQualityIssue" ADD CONSTRAINT "SupplierQualityIssue_vendorTenantId_fkey" FOREIGN KEY ("vendorTenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SupplierQualityIssue" ADD CONSTRAINT "SupplierQualityIssue_acknowledgedById_fkey" FOREIGN KEY ("acknowledgedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "SupplierQualityIssue" ADD CONSTRAINT "SupplierQualityIssue_resolvedById_fkey" FOREIGN KEY ("resolvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
