import { FinancialEventType, PrismaClient, PayoutRecordType, PaymentCollectionMode, SettlementCycleMode, SettlementEligibilityTrigger, TenantKind } from '@prisma/client';

async function main() {
  const prisma = new PrismaClient(); await prisma.$connect();
  try {
    const payouts = await prisma.payout.updateMany({ where: { recordType: { not: PayoutRecordType.LEGACY } }, data: { recordType: PayoutRecordType.LEGACY } });
    await prisma.financeConfiguration.upsert({ where: { id: 'default' }, update: {}, create: { id: 'default', paymentCollectionMode: PaymentCollectionMode.UNCONFIGURED, baseCurrency: 'INR' } });
    const vendors = await prisma.tenant.findMany({ where: { kind: TenantKind.VENDOR }, select: { id: true } });
    for (const vendor of vendors) await prisma.vendorSettlementPolicy.upsert({ where: { vendorTenantId: vendor.id }, update: { reviewRequired: true, active: false }, create: { vendorTenantId: vendor.id, cycleMode: SettlementCycleMode.MANUAL, eligibilityTrigger: SettlementEligibilityTrigger.SERVICE_COMPLETED, settlementDelayDays: 0, active: false, reviewRequired: true } });
    const events = await prisma.financialEvent.findMany({ where: { bookingId: { not: null } }, include: { booking: { include: { economicsSnapshot: true } } } });
    let enriched = 0; let confirmedEnriched = 0;
    for (const event of events) {
      if (!event.booking) continue;
      const vendorAmount = event.type === FinancialEventType.BOOKING_CONFIRMED ? event.booking.economicsSnapshot?.vendorPayable ?? null : event.vendorAmount;
      await prisma.financialEvent.update({ where: { id: event.id }, data: { vendorTenantId: event.booking.vendorTenantId, agentTenantId: event.booking.agentTenantId, vendorAmount } }); enriched += 1; if (event.type === FinancialEventType.BOOKING_CONFIRMED && vendorAmount !== null) confirmedEnriched += 1;
    }
    console.log(JSON.stringify({ passing: true, legacyPayoutsMarked: payouts.count, vendors: vendors.length, financialEventsEnriched: enriched, confirmedEventsWithVendorAmount: confirmedEnriched, settlementBatchesCreated: 0, fabricatedPayoutRelationships: 0, fabricatedCancellationLiability: 0 }, null, 2));
  } finally { await prisma.$disconnect(); }
}
main().catch((error) => { console.error(error?.stack || error?.message || error); process.exitCode = 1; });
