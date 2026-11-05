import { CommercialService } from './commercial.service';

describe('CommercialService transaction client seam', () => {
  it('persists imported MRP proof metadata on the commercial version', async () => {
    const version = { id: 'cv-import', versionNumber: 1, status: 'DRAFT' };
    const tx: any = { $queryRaw: jest.fn(), ratePlanCommercialVersion: { findFirst: jest.fn().mockResolvedValue(null), create: jest.fn().mockResolvedValue(version) } };
    const plan = { id: 'rp1', currency: 'INR' };
    const prisma: any = { ratePlan: { findFirst: jest.fn().mockResolvedValue(plan) }, $transaction: jest.fn(async (callback: any) => callback(tx)) };
    const audit: any = { write: jest.fn().mockResolvedValue(undefined) };
    const outbox: any = { enqueue: jest.fn().mockResolvedValue(undefined) };
    const service = new CommercialService(prisma, audit, outbox, {} as any);

    await service.createVersion({ sub: 'vendor-1', tenantId: 'tenant-1' } as any, 'rp1', {
      effectiveFrom: '2026-11-04T00:00:00.000Z', sourcePayload: { mrpMode: 'YES', mrpAmount: '2200', mrpProof: 'https://supplier.example/rate-board' },
    } as any);

    expect(tx.ratePlanCommercialVersion.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ sourcePayload: { mrpMode: 'YES', mrpAmount: '2200', mrpProof: 'https://supplier.example/rate-board' } }) }));
  });

  it('creates a commercial rule and its initial draft version in one transaction', async () => {
    const rule = { id: 'rule-1', code: 'MARGIN-P1', kind: 'VOYA_REVENUE', scopeType: 'PRODUCT' };
    const version = { id: 'version-1', ruleId: 'rule-1', versionNumber: 1, status: 'DRAFT' };
    const tx: any = { commercialRule: { create: jest.fn().mockResolvedValue(rule) }, commercialRuleVersion: { create: jest.fn().mockResolvedValue(version) } };
    const prisma: any = { product: { findUnique: jest.fn().mockResolvedValue({ id: 'p1' }) }, $transaction: jest.fn(async (callback: any) => callback(tx)) };
    const audit: any = { write: jest.fn().mockResolvedValue(undefined) };
    const outbox: any = { enqueue: jest.fn().mockResolvedValue(undefined) };
    const service = new CommercialService(prisma, audit, outbox, {} as any);
    await expect(service.createRuleWithInitialVersion({ sub: 'admin-1' } as any, {
      rule: { code: 'MARGIN-P1', name: 'Product margin', kind: 'VOYA_REVENUE' as any, scopeType: 'PRODUCT' as any, productId: 'p1' },
      version: { effectiveFrom: '2026-11-03T00:00:00.000Z', priority: 0, stackingMode: 'EXCLUSIVE' as any, config: { model: 'MARKUP_PERCENT', percent: '12.5' } },
    })).resolves.toEqual({ rule, version });
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(tx.commercialRule.create).toHaveBeenCalledTimes(1);
    expect(tx.commercialRuleVersion.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ ruleId: 'rule-1', versionNumber: 1, createdById: 'admin-1' }) }));
    expect(audit.write).toHaveBeenCalledTimes(2);
    expect(outbox.enqueue).toHaveBeenCalledTimes(2);
  });

  it('uses one supplied client for plan, version, rule and agent-group lookups', async () => {
    const activeVersion: any = { id: 'cv1', versionNumber: 1, effectiveFrom: new Date('2026-01-01'), effectiveTo: null, status: 'ACTIVE' };
    const plan: any = { id: 'rp1', variant: { product: { id: 'p1', tenantId: 'vendor1' } } };
    const root: any = { ratePlan: { findUnique: jest.fn(() => { throw new Error('root plan lookup'); }) }, ratePlanCommercialVersion: { findMany: jest.fn(() => { throw new Error('root version lookup'); }) }, commercialRule: { findMany: jest.fn(() => { throw new Error('root rule lookup'); }) }, agentGroupMember: { findMany: jest.fn(() => { throw new Error('root group lookup'); }) } };
    const tx: any = { ratePlan: { findUnique: jest.fn().mockResolvedValue(plan) }, ratePlanCommercialVersion: { findMany: jest.fn().mockResolvedValue([activeVersion]) }, commercialRule: { findMany: jest.fn().mockResolvedValue([]) }, agentGroupMember: { findMany: jest.fn().mockResolvedValue([]) } };
    const calculator: any = { calculate: jest.fn().mockReturnValue({ ready: true, reasonCodes: [], finalAmount: '100.00' }) };
    const service = new CommercialService(root, {} as any, {} as any, calculator);
    const result = await service.evaluateInternal({ ratePlanId: 'rp1', serviceDate: new Date('2026-09-01'), units: 1, travellers: [], agentTenantId: 'agent1' }, tx);
    expect(result.finalAmount).toBe('100.00'); expect(tx.ratePlan.findUnique).toHaveBeenCalled(); expect(tx.ratePlanCommercialVersion.findMany).toHaveBeenCalled(); expect(tx.commercialRule.findMany).toHaveBeenCalled(); expect(tx.agentGroupMember.findMany).toHaveBeenCalled(); expect(calculator.calculate).toHaveBeenCalled();
  });

  it('adds an eligible vendor promotion to the shared quote calculation rules', async () => {
    const service = Object.create(CommercialService.prototype) as any;
    const promotion = { id: 'promo-1', name: 'Early sale', promotionType: 'EARLY_BIRD', discountPercent: 15, conditionValue: 2, startsAt: new Date('2026-11-10T00:00:00Z'), endsAt: new Date('2026-11-10T23:59:59Z'), validWeekdays: [], stackWithPlatform: false, maxDiscountedBookings: null };
    const rules: any[] = [];
    await service.appendVendorPromotion(rules, 'p1', { serviceDate: new Date('2026-11-10T00:00:00Z'), travellers: [{ travellerType: 'ADULT', quantity: 2 }] }, { promotion: { findFirst: jest.fn().mockResolvedValue(promotion) } });
    expect(rules).toHaveLength(1);
    expect(rules[0].config).toMatchObject({ discountType: 'PERCENT', value: '15', funder: 'SUPPLIER', vendorPromotionId: 'promo-1' });
  });

  it('does not apply last-minute offers without an activity start timestamp', async () => {
    const service = Object.create(CommercialService.prototype) as any;
    const promotion = { id: 'promo-late', name: 'Last minute', promotionType: 'LAST_MINUTE', discountPercent: 10, conditionValue: 6, startsAt: new Date('2026-11-10T00:00:00Z'), endsAt: new Date('2026-11-10T23:59:59Z'), validWeekdays: [], stackWithPlatform: false, maxDiscountedBookings: null };
    const rules: any[] = [];
    await service.appendVendorPromotion(rules, 'p1', { serviceDate: new Date('2026-11-10T00:00:00Z'), travellers: [{ travellerType: 'ADULT', quantity: 1 }] }, { promotion: { findFirst: jest.fn().mockResolvedValue(promotion) } });
    expect(rules).toHaveLength(0);
  });
});
