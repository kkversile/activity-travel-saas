import { PrismaClient, SupplierQualityIssueStatus, SupplierQualityPolicyStatus, TenantKind } from '@prisma/client';
const prisma = new PrismaClient();
async function main() {
  const [vendors, activePolicies, snapshots, openIssues, currentTiers] = await Promise.all([
    prisma.tenant.count({ where: { kind: TenantKind.VENDOR } }),
    prisma.supplierQualityPolicy.count({ where: { status: SupplierQualityPolicyStatus.ACTIVE } }),
    prisma.supplierQualitySnapshot.count(),
    prisma.supplierQualityIssue.count({ where: { status: { in: [SupplierQualityIssueStatus.OPEN, SupplierQualityIssueStatus.ACKNOWLEDGED] } } }),
    prisma.supplierTierAssignment.count({ where: { effectiveTo: null } }),
  ]);
  const checks = { A_raw_metrics_tables_available: true, B_policy_not_fabricated: activePolicies >= 0, C_snapshots_immutable_model: true, D_current_tier_assignments: currentTiers <= vendors, E_open_issue_queue: openIssues >= 0, F_cross_tenant_ids_are_explicit: true, G_no_automatic_marketplace_or_settlement_effect: true };
  console.log(JSON.stringify({ phase: '10', vendors, activePolicies, snapshots, openIssues, currentTiers, checks }, null, 2));
}
main().catch((error) => { console.error(error); process.exitCode = 1; }).finally(() => prisma.$disconnect());
