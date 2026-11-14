import { Prisma, UserRole } from '@prisma/client';
import { FinanceService } from './finance.service';

const vendorId = 'vendor-1';
function fixture(holds: any[], released = false) {
  const storedPayout: any = { id: 'p1', tenantId: vendorId, settlementBatchId: 'b1', amount: new Prisma.Decimal(released ? 50 : 150), heldAmount: new Prisma.Decimal(released ? 100 : 0), status: released ? 'RELEASED' : 'READY_TO_RELEASE', currency: 'INR', dueDate: new Date(), createdAt: new Date() };
  const batch: any = { id: 'b1', vendorTenantId: vendorId, netPayable: new Prisma.Decimal(150), status: released ? 'RELEASED' : 'READY_FOR_PAYOUT', payout: storedPayout, lines: [100, 50].map((amount, i) => ({ id: `line-${i}`, netVendorPayable: new Prisma.Decimal(amount), allocations: [{ financialEventId: `event-${i}`, financialEvent: { vendorAmount: new Prisma.Decimal(amount) } }] })) };
  const prisma: any = {
    settlementBatch: { findMany: jest.fn().mockResolvedValue([batch]) },
    payout: { findMany: jest.fn(async ({ where }) => where.recordType === 'CANONICAL' ? [storedPayout] : []) },
    vendorProfile: { findUnique: jest.fn().mockResolvedValue(null) },
    settlementHold: { findMany: jest.fn().mockResolvedValue(holds) },
  };
  return { prisma, storedPayout, service: new FinanceService(prisma, {} as any, {} as any) };
}
const eventHold = { scope: 'FINANCIAL_EVENT', vendorTenantId: vendorId, financialEventId: 'event-0' };

describe('Vendor hold projections', () => {
  it.each([
    { holds: [], held: 0, available: 150 },
    { holds: [eventHold], held: 100, available: 50 },
    { holds: [eventHold, { scope: 'VENDOR', vendorTenantId: vendorId }], held: 150, available: 0 },
  ])('reports available and held amounts without changing stored financial evidence: $held held', async ({ holds, held, available }) => {
    const f = fixture(holds);
    const result = await f.service.vendorSettlements({ role: UserRole.VENDOR, tenantId: vendorId } as any);
    expect(result.summary.onHold).toBe(held);
    expect(result.summary.nextPayout).toMatchObject({ amount: available, heldAmount: held });
    expect(Number(result.payouts[0].amount)).toBe(available);
    expect(Number(result.payouts[0].heldAmount)).toBe(held);
    expect(Number(f.storedPayout.amount)).toBe(150);
    expect(result.batches[0].lines[0]).not.toHaveProperty('allocations');
    expect(f.prisma.settlementHold.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { vendorTenantId: vendorId, status: 'ACTIVE' } }));
  });

  it('preserves released amounts and uses the persisted carry-forward hold', async () => {
    const f = fixture([eventHold], true);
    const result = await f.service.vendorSettlements({ role: UserRole.VENDOR, tenantId: vendorId } as any);
    expect(result.summary.onHold).toBe(100);
    expect(result.summary.paidInSelectedMonth).toBe(50);
    expect(result.summary.nextPayout).toBeNull();
    expect(Number(result.payouts[0].amount)).toBe(50);
  });
});
