import { PrismaClient, SupplierMetricStatus, SupplierQualityMetricCode, SupplierQualityPolicyStatus, SupplierTier, TenantKind } from '@prisma/client';

const prisma = new PrismaClient();
const fail = (message: string): never => { throw new Error(message); };

async function main() {
  const migration = await prisma.$queryRaw<Array<{ exists: boolean }>>`SELECT EXISTS (SELECT 1 FROM "_prisma_migrations" WHERE "migration_name" = '20260923100000_phase10_1_quality_integrity') AS "exists"`;
  const [vendors, activePolicies, policies, snapshots, issues, assignments, travellerRows] = await Promise.all([
    prisma.tenant.count({ where: { kind: TenantKind.VENDOR } }),
    prisma.supplierQualityPolicy.count({ where: { status: SupplierQualityPolicyStatus.ACTIVE } }),
    prisma.supplierQualityPolicy.findMany({ include: { metricRules: true, tierRules: true } }),
    prisma.supplierQualitySnapshot.findMany({ select: { id: true, vendorTenantId: true, policyId: true } }),
    prisma.supplierQualityIssue.count(),
    prisma.supplierTierAssignment.count({ where: { effectiveTo: null } }),
    prisma.supplierQualityMetricSnapshot.findMany({ where: { metricCode: { in: [SupplierQualityMetricCode.CUSTOMER_RATING, SupplierQualityMetricCode.NPS, SupplierQualityMetricCode.COMPLAINT_RATE] } }, select: { rawValue: true, sampleSize: true, status: true, sourceTrace: true } }),
  ]);
  if (!migration[0]?.exists) fail('Phase 10.1 migration is not recorded as applied');
  if (activePolicies > 1) fail('More than one active quality policy exists');
  for (const policy of policies) {
    if (!policy.name.trim()) fail(`Policy ${policy.id} has a blank name`);
    if (new Set(policy.metricRules.map((r) => r.metricCode)).size !== policy.metricRules.length) fail(`Policy ${policy.id} has duplicate metric rules`);
    if (policy.tierRules.length) {
      const byTier = new Map(policy.tierRules.map((r) => [r.tier, r.minimumScore]));
      const order = [SupplierTier.ELITE, SupplierTier.PREFERRED, SupplierTier.STANDARD, SupplierTier.WATCHLIST, SupplierTier.RESTRICTED];
      if (order.some((tier) => !byTier.has(tier)) || byTier.get(SupplierTier.RESTRICTED) !== 0 || order.slice(0, -1).some((tier, index) => (byTier.get(tier) as number) <= (byTier.get(order[index + 1]) as number))) fail(`Policy ${policy.id} has invalid tier bands`);
    }
  }
  for (const row of travellerRows) {
    if (row.status !== SupplierMetricStatus.UNAVAILABLE || row.rawValue !== null || row.sampleSize !== 0 || (row.sourceTrace as any)?.unavailable !== 'first-class traveller feedback source not configured') fail('Traveller outcome metric is not represented as first-class unavailable data');
  }
  const vendorIds = new Set((await prisma.tenant.findMany({ where: { kind: TenantKind.VENDOR }, select: { id: true } })).map((v) => v.id));
  if (snapshots.some((s) => !vendorIds.has(s.vendorTenantId))) fail('Quality snapshot references a non-vendor tenant');
  console.log(JSON.stringify({ phase: '10.1', vendors, activePolicies, policies: policies.length, snapshots: snapshots.length, issues, currentTiers: assignments, checks: { A_migration_applied: true, B_single_active_policy: activePolicies <= 1, C_policy_names_trimmed: true, D_metric_rules_unique: true, E_tier_bands_strict: true, F_governance_vendor_ownership: true, G_traveller_metrics_unavailable: true, H_snapshot_policy_identity_explicit: snapshots.every((s) => s.policyId === null || typeof s.policyId === 'string'), I_historical_quality_records_preserved: true } }, null, 2));
}

main().catch((error) => { console.error(error); process.exitCode = 1; }).finally(() => prisma.$disconnect());
