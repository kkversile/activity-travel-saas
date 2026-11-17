import { PrismaClient, UserRole } from '@prisma/client';
import { assertLoopbackDatabaseUrl } from './local-database-policy';
import { createHash } from 'crypto';

/**
 * Idempotent default-outlet expansion for a disposable/local database.
 * Run without --apply for a read-only count; mutations require --apply and a
 * PostgreSQL URL whose host is loopback. This tool intentionally refuses remote
 * database hosts to prevent accidental production use.
 */
const apply = process.argv.includes('--apply');
const prisma = new PrismaClient();

function assertLocalDatabase() {
  assertLoopbackDatabaseUrl(process.env.DATABASE_URL);
}

async function main() {
  assertLocalDatabase();
  const vendors = await prisma.tenant.findMany({
    where: { kind: 'VENDOR' },
    select: {
      id: true,
      name: true,
      vendorProfile: { select: { legalBusinessName: true, displayName: true } },
      outlets: { select: { id: true, outletCode: true, isDefault: true, createdAt: true }, orderBy: { createdAt: 'asc' } },
    },
  });

  let toCreate = 0;
  for (const vendor of vendors) {
    if (!vendor.outlets.some((outlet) => outlet.isDefault)) toCreate += vendor.outlets.length === 0 ? 1 : 0;
  }
  const [unassignedProducts, unassignedBookings, unassignedResources, linkedEvents, activeNonOwners] = await Promise.all([
    prisma.product.count({ where: { outletId: null, tenant: { kind: 'VENDOR' } } }),
    prisma.$queryRaw<Array<{ count: bigint }>>`SELECT count(*) FROM "Booking" b JOIN "Product" p ON p."id" = b."productId" AND p."tenantId" = b."vendorTenantId" JOIN "Tenant" t ON t."id" = p."tenantId" WHERE b."outletId" IS NULL AND t."kind" = 'VENDOR'`.then((rows) => Number(rows[0].count)),
    prisma.resource.count({ where: { outletId: null, tenant: { kind: 'VENDOR' } } }),
    prisma.financialEvent.count({ where: { outletId: null, bookingId: { not: null } } }),
    prisma.user.count({ where: { role: UserRole.VENDOR, active: true, OR: [{ organizationRole: { not: 'OWNER' } }, { organizationRole: null }], tenant: { kind: 'VENDOR' } } }),
  ]);
  console.log(JSON.stringify({ mode: apply ? 'apply' : 'dry-run', vendors: vendors.length, outletsToCreate: toCreate, unassignedProducts, eligibleBookings: unassignedBookings, unassignedResources, bookingLinkedEvents: linkedEvents, nonOwnerUsers: activeNonOwners }, null, 2));
  if (!apply) return;

  await prisma.$transaction(async (tx) => {
    const defaults = new Map<string, string>();
    for (const vendor of vendors) {
      const existingDefault = vendor.outlets.find((outlet) => outlet.isDefault);
      if (existingDefault) {
        defaults.set(vendor.id, existingDefault.id);
        continue;
      }
      const existingMain = vendor.outlets.find((outlet) => outlet.outletCode === 'MAIN');
      if (existingMain) {
        const updated = await tx.vendorOutlet.update({ where: { id: existingMain.id }, data: { isDefault: true } });
        defaults.set(vendor.id, updated.id);
      } else if (vendor.outlets.length > 0) {
        const oldest = vendor.outlets[0];
        const updated = await tx.vendorOutlet.update({ where: { id: oldest.id }, data: { isDefault: true } });
        defaults.set(vendor.id, updated.id);
      } else {
        const created = await tx.vendorOutlet.create({
          data: {
            tenantId: vendor.id,
            outletCode: 'MAIN',
            name: vendor.vendorProfile?.displayName || vendor.vendorProfile?.legalBusinessName || vendor.name,
            isDefault: true,
          },
        });
        defaults.set(vendor.id, created.id);
      }
    }

    for (const [tenantId, outletId] of defaults) {
      await tx.product.updateMany({ where: { tenantId, outletId: null }, data: { outletId } });
      await tx.resource.updateMany({ where: { tenantId, outletId: null }, data: { outletId } });
      // A legacy single-location tenant maps unambiguously to its sole outlet.
      // Preserve these payouts for existing finance employees without inventing
      // attribution for a tenant that already has multiple outlets.
      if ((vendors.find((vendor) => vendor.id === tenantId)?.outlets.length ?? 2) <= 1) {
        await tx.payout.updateMany({ where: { tenantId, recordType: 'LEGACY', outletId: null }, data: { outletId } });
        // Preserve access to legacy single-location report history and keep
        // existing scheduled deliveries bound to that location after expansion.
        await tx.reportSchedule.updateMany({ where: { tenantId, outletId: null }, data: { outletId } });
        await tx.vendorReportExport.updateMany({ where: { tenantId, outletId: null }, data: { outletId } });
      }
      // Reuse recoverable, previously verified onboarding details only when
      // verification provenance and a verified bank proof are both present.
      // Masked-only profile fields never become a usable beneficiary.
      const application = await tx.vendorOnboardingApplication.findUnique({ where: { tenantId } });
      if (application?.bankAccountCiphertext && application.bankAccountMasked && application.bankName && application.ifscCode && application.accountHolderName && application.bankVerificationStatus === 'VERIFIED' && application.reviewedAt && application.reviewedById) {
        const proof = await tx.vendorDocumentVersion.findFirst({ where: { vendorDocument: { tenantId, type: 'BANK_PROOF' }, status: 'VERIFIED', fileAsset: { archivedAt: null } }, orderBy: { versionNumber: 'desc' } });
        if (proof) {
          const hash = createHash('sha256').update(`voya-legacy-bank:${tenantId}`).digest('hex');
          const bankId = `${hash.slice(0, 8)}-${hash.slice(8, 12)}-5${hash.slice(13, 16)}-a${hash.slice(17, 20)}-${hash.slice(20, 32)}`;
          await tx.vendorBankAccount.upsert({ where: { id: bankId }, update: {}, create: { id: bankId, tenantId, accountNumberCiphertext: application.bankAccountCiphertext, accountNumberMasked: application.bankAccountMasked, bankName: application.bankName, ifsc: application.ifscCode, accountHolder: application.accountHolderName, accountType: application.accountType || 'OTHER', proofDocumentId: proof.fileAssetId, verificationStatus: 'VERIFIED', verifiedAt: application.reviewedAt, verifiedById: application.reviewedById, verificationNote: 'Migrated verified onboarding beneficiary and verified bank-proof provenance.' } });
          await tx.vendorOutlet.updateMany({ where: { id: outletId, tenantId, bankAccountId: null }, data: { bankAccountId: bankId } });
        }
      }
      await tx.userOutletAccess.createMany({
        data: await tx.user.findMany({
          where: { tenantId, role: UserRole.VENDOR, active: true, outletAccess: { none: {} }, OR: [{ organizationRole: { not: 'OWNER' } }, { organizationRole: null }] },
          select: { id: true },
        }).then((users) => users.map((user) => ({ tenantId, outletId, userId: user.id }))),
        skipDuplicates: true,
      });
    }

    // Booking attribution always follows its owning product, never request data.
    await tx.$executeRaw`UPDATE "Booking" b SET "outletId" = p."outletId" FROM "Product" p WHERE b."productId" = p."id" AND b."vendorTenantId" = p."tenantId" AND b."outletId" IS NULL AND p."outletId" IS NOT NULL`;
    // Only booking-linked events and batches with exactly one observed outlet
    // are attributed. Vendor-wide/manual rows remain explicitly unscoped.
    await tx.$executeRaw`UPDATE "FinancialEvent" e SET "outletId" = b."outletId" FROM "Booking" b WHERE e."bookingId" = b."id" AND e."vendorTenantId" = b."vendorTenantId" AND e."outletId" IS NULL AND b."outletId" IS NOT NULL`;
    await tx.$executeRaw`UPDATE "SettlementBatch" s SET "outletId" = evidence."outletId" FROM (SELECT line."batchId", MIN(booking."outletId") AS "outletId" FROM "SettlementLine" line JOIN "SettlementBatch" batch ON batch."id" = line."batchId" LEFT JOIN "Booking" booking ON booking."id" = line."bookingId" AND booking."vendorTenantId" = batch."vendorTenantId" GROUP BY line."batchId" HAVING COUNT(*) = COUNT(booking."outletId") AND COUNT(DISTINCT booking."outletId") = 1) evidence WHERE s."id" = evidence."batchId" AND s."outletId" IS NULL AND NOT EXISTS (SELECT 1 FROM "FinancialEvent" e WHERE e."settlementBatchId" = s."id" AND e."type"::text IN ('BOOKING_CONFIRMED', 'VENDOR_ADJUSTMENT') AND (e."outletId" IS NULL OR e."outletId" <> evidence."outletId"))`;
    // A pre-expansion single-location vendor's adjustment-only/empty historical
    // batches also belong to its sole outlet. Reject conflicting parent evidence
    // instead of silently attributing cross-tenant or mixed-outlet records.
    for (const [tenantId, outletId] of defaults) {
      if ((vendors.find((vendor) => vendor.id === tenantId)?.outlets.length ?? 2) > 1) continue;
      await tx.$executeRaw`UPDATE "SettlementBatch" s SET "outletId" = ${outletId}
        WHERE s."vendorTenantId" = ${tenantId} AND s."outletId" IS NULL
        AND NOT EXISTS (SELECT 1 FROM "SettlementLine" l LEFT JOIN "Booking" b ON b."id" = l."bookingId" WHERE l."batchId" = s."id" AND l."bookingId" IS NOT NULL AND (b."id" IS NULL OR b."vendorTenantId" <> ${tenantId} OR b."outletId" IS DISTINCT FROM ${outletId}))
        AND NOT EXISTS (SELECT 1 FROM "FinancialEvent" e WHERE e."settlementBatchId" = s."id" AND (e."vendorTenantId" IS DISTINCT FROM ${tenantId} OR (e."outletId" IS NOT NULL AND e."outletId" <> ${outletId})))
        AND NOT EXISTS (SELECT 1 FROM "SettlementEventAllocation" a JOIN "FinancialEvent" e ON e."id" = a."financialEventId" JOIN "SettlementLine" l ON l."id" = a."lineId" WHERE a."batchId" = s."id" AND (l."batchId" <> s."id" OR e."vendorTenantId" IS DISTINCT FROM ${tenantId} OR (e."outletId" IS NOT NULL AND e."outletId" <> ${outletId})))`;
    }
    await tx.$executeRaw`UPDATE "FinancialEvent" e SET "outletId" = s."outletId" FROM "SettlementBatch" s WHERE e."settlementBatchId" = s."id" AND e."vendorTenantId" = s."vendorTenantId" AND e."outletId" IS NULL AND s."outletId" IS NOT NULL AND e."type"::text IN ('SETTLEMENT_BATCH_CREATED', 'PAYOUT_RELEASED')`;
    await tx.$executeRaw`UPDATE "Payout" p SET "outletId" = batch."outletId" FROM "SettlementBatch" batch WHERE p."settlementBatchId" = batch."id" AND p."tenantId" = batch."vendorTenantId" AND p."outletId" IS NULL AND batch."outletId" IS NOT NULL`;
  }, { timeout: 120_000 });

  const [productsRemaining, bookingsRemaining, eventsRemaining, batchesRemaining] = await Promise.all([
    prisma.product.count({ where: { outletId: null, tenant: { kind: 'VENDOR' } } }),
    prisma.booking.count({ where: { outletId: null, vendorTenant: { kind: 'VENDOR' }, product: { outletId: { not: null } } } }),
    prisma.financialEvent.count({ where: { outletId: null, bookingId: { not: null } } }),
    prisma.settlementBatch.count({ where: { outletId: null, vendorTenant: { kind: 'VENDOR' }, OR: [{ lines: { some: { booking: { outletId: { not: null } } } } }, { financialEvents: { some: { outletId: { not: null } } } }] } }),
  ]);
  console.log(JSON.stringify({ completed: true, productsWithoutOutlet: productsRemaining, eligibleBookingsWithoutOutlet: bookingsRemaining, bookingEventsWithoutOutlet: eventsRemaining, mixedOrUnattributedBatchesForReview: batchesRemaining }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : 'Multi-outlet backfill failed');
  process.exitCode = 1;
}).finally(async () => prisma.$disconnect());
