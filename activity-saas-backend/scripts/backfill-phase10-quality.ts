import { PrismaClient, SupplierQualityPolicyStatus, TenantKind } from '@prisma/client';
const prisma = new PrismaClient();
async function main() {
  const [vendors, profiles, assignments, snapshots, activePolicies] = await Promise.all([
    prisma.tenant.count({ where: { kind: TenantKind.VENDOR } }),
    prisma.vendorProfile.findMany({ where: { tenant: { kind: TenantKind.VENDOR } }, select: { readinessScore: true } }),
    prisma.supplierTierAssignment.count(), prisma.supplierQualitySnapshot.count(), prisma.supplierQualityPolicy.count({ where: { status: SupplierQualityPolicyStatus.ACTIVE } }),
  ]);
  const distribution = profiles.reduce<Record<string, number>>((out, profile) => { const bucket = profile.readinessScore < 50 ? '<50' : profile.readinessScore < 80 ? '50-79' : '80+'; out[bucket] = (out[bucket] || 0) + 1; return out; }, {});
  console.log(JSON.stringify({ vendors, readinessDistribution: distribution, assignments, snapshots, activePolicies, note: 'No readiness score was converted into quality score or tier.' }, null, 2));
}
main().catch((error) => { console.error(error); process.exitCode = 1; }).finally(() => prisma.$disconnect());
