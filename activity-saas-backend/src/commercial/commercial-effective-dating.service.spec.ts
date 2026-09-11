import { CommercialService } from './commercial.service';
import { selectEffectiveVersion } from './commercial-resolution';
import { CommercialCalculatorService } from './commercial-calculator.service';

const user: any = { sub: 'admin-1', tenantId: 'vendor-1', role: 'VENDOR' };
const commercialVersion = (overrides: any = {}) => ({ id: 'v2', ratePlanId: 'rp1', versionNumber: 2, status: 'DRAFT', effectiveFrom: new Date('2026-10-01'), effectiveTo: null, supplierModel: 'NET_RATE', pricingUnit: 'PER_BOOKING', supplierBaseAmount: '100', bookingMode: 'INSTANT', travellerPrices: [], ...overrides });
const ruleVersion = (overrides: any = {}) => ({ id: 'rv2', ruleId: 'rule1', versionNumber: 2, status: 'DRAFT', effectiveFrom: new Date('2026-10-01'), effectiveTo: null, priority: 0, stackingMode: 'EXCLUSIVE', config: { mode: 'NONE', rate: '0', taxableBase: 'AGENT_PRE_TAX', accountableParty: 'NONE', roundingPolicy: 'HALF_UP' }, rule: { id: 'rule1', kind: 'TAX', archivedAt: null }, ...overrides });

function commercialHarness(candidate: any, old: any, audit = jest.fn()) {
  const tx: any = {
    $queryRaw: jest.fn(),
    ratePlanCommercialVersion: {
      findUniqueOrThrow: jest.fn().mockResolvedValue(candidate),
      findMany: jest.fn().mockResolvedValue([old]),
      update: jest.fn().mockImplementation(({ data }: any) => { Object.assign(old, data); return Promise.resolve(old); }),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
  };
  const prisma: any = {
    ratePlan: { findFirst: jest.fn().mockResolvedValue({ id: 'rp1', variant: { product: { tenantId: 'vendor-1' } }, travellerRules: [] }), findUnique: jest.fn().mockResolvedValue({ id: 'rp1', variantId: 'variant1', variant: { productId: 'product1', product: { tenantId: 'vendor-1' } } }) },
    ratePlanCommercialVersion: { findFirst: jest.fn().mockResolvedValue(candidate), findMany: jest.fn().mockResolvedValue([old, candidate]) },
    commercialRule: { findMany: jest.fn().mockResolvedValue([{ id: 'voya', kind: 'VOYA_REVENUE', scopeType: 'GLOBAL', versions: [{ id: 'voya-v1', priority: 0, stackingMode: 'EXCLUSIVE', effectiveFrom: new Date('2026-09-01'), effectiveTo: null }], config: { model: 'MARKUP_FIXED', fixedAmount: '0' } }, { id: 'tax', kind: 'TAX', scopeType: 'GLOBAL', versions: [{ id: 'tax-v1', priority: 0, stackingMode: 'EXCLUSIVE', effectiveFrom: new Date('2026-09-01'), effectiveTo: null }], config: { mode: 'NONE', rate: '0', taxableBase: 'AGENT_PRE_TAX', accountableParty: 'NONE', roundingPolicy: 'HALF_UP' } }]) },
    agentGroupMember: { findMany: jest.fn().mockResolvedValue([]) },
    $transaction: jest.fn((callback: any) => callback(tx)),
  };
  const service = new CommercialService(prisma, { write: audit } as any, { enqueue: jest.fn() } as any, new CommercialCalculatorService());
  return { service, prisma, tx, audit };
}

describe('CommercialService effective-dated cutover', () => {
  it('keeps the previous commercial version ACTIVE and preserves both quote dates', async () => {
    const old = commercialVersion({ id: 'v1', versionNumber: 1, status: 'ACTIVE', effectiveFrom: new Date('2026-09-01'), effectiveTo: null });
    const candidate = commercialVersion();
    const { service, tx } = commercialHarness(candidate, old);
    await service.activateVersion(user, candidate.id);
    expect(tx.ratePlanCommercialVersion.update).toHaveBeenCalledWith({ where: { id: 'v1' }, data: { effectiveTo: new Date('2026-10-01') } });
    expect(tx.ratePlanCommercialVersion.update).not.toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ data: expect.objectContaining({ status: 'RETIRED' }) }));
    const history = [{ ...old, effectiveTo: new Date('2026-10-01') }, candidate];
    expect((selectEffectiveVersion(history as any, new Date('2026-09-15')) as any)?.id).toBe('v1');
    expect((selectEffectiveVersion(history as any, new Date('2026-10-15')) as any)?.id).toBe('v2');
    expect((await service.quote(user, { ratePlanId: 'rp1', serviceDate: '2026-09-15T00:00:00.000Z', units: 1, travellers: [] } as any)).ratePlanCommercialVersionId).toBe('v1');
    expect((await service.quote(user, { ratePlanId: 'rp1', serviceDate: '2026-10-15T00:00:00.000Z', units: 1, travellers: [] } as any)).ratePlanCommercialVersionId).toBe('v2');
  });

  it('rejects a same-start or bounded mid-window commercial overlap', async () => {
    const boundedOld = commercialVersion({ id: 'v1', versionNumber: 1, status: 'ACTIVE', effectiveFrom: new Date('2026-09-01'), effectiveTo: new Date('2026-12-31') });
    const { service: midWindow } = commercialHarness(commercialVersion(), boundedOld);
    await expect(midWindow.activateVersion(user, 'v2')).rejects.toMatchObject({ response: { code: 'COMMERCIAL_VERSION_OVERLAP_REQUIRES_SPLIT' } });
    const sameStart = commercialVersion({ effectiveFrom: new Date('2026-09-01') });
    const sameStartHarness = commercialHarness(sameStart, commercialVersion({ id: 'v1', status: 'ACTIVE', effectiveFrom: new Date('2026-09-01'), effectiveTo: null }));
    await expect(sameStartHarness.service.activateVersion(user, sameStart.id)).rejects.toMatchObject({ response: { code: 'COMMERCIAL_VERSION_OVERLAP_REQUIRES_SPLIT' } });
  });

  it('keeps the previous rule version ACTIVE and records cutover metadata', async () => {
    const old = ruleVersion({ id: 'rv1', versionNumber: 1, status: 'ACTIVE', effectiveFrom: new Date('2026-09-01'), effectiveTo: null });
    const candidate = ruleVersion();
    const tx: any = { $queryRaw: jest.fn(), commercialRuleVersion: { findUniqueOrThrow: jest.fn().mockResolvedValue(candidate), findMany: jest.fn().mockResolvedValue([old]), update: jest.fn().mockResolvedValue({ ...old, effectiveTo: candidate.effectiveFrom }), updateMany: jest.fn().mockResolvedValue({ count: 1 }) } };
    const audit = jest.fn();
    const prisma: any = { commercialRuleVersion: { findUnique: jest.fn().mockResolvedValue(candidate) }, $transaction: jest.fn((callback: any) => callback(tx)) };
    const service = new CommercialService(prisma, { write: audit } as any, { enqueue: jest.fn() } as any, {} as any);
    await service.activateRuleVersion(user, candidate.id);
    expect(tx.commercialRuleVersion.update).toHaveBeenCalledWith({ where: { id: 'rv1' }, data: { effectiveTo: new Date('2026-10-01') } });
    expect(audit).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ afterState: expect.objectContaining({ previousVersionId: 'rv1', previousEffectiveTo: null, newVersionId: 'rv2', cutoverAt: expect.any(String) }) }));
    const history = [{ ...old, effectiveTo: new Date('2026-10-01') }, candidate];
    expect((selectEffectiveVersion(history as any, new Date('2026-09-15')) as any)?.id).toBe('rv1');
    expect((selectEffectiveVersion(history as any, new Date('2026-10-15')) as any)?.id).toBe('rv2');
  });

  it('rejects a rule overlap that would require splitting history', async () => {
    const old = ruleVersion({ id: 'rv1', status: 'ACTIVE', effectiveFrom: new Date('2026-09-01'), effectiveTo: new Date('2026-12-31') });
    const candidate = ruleVersion();
    const tx: any = { $queryRaw: jest.fn(), commercialRuleVersion: { findUniqueOrThrow: jest.fn().mockResolvedValue(candidate), findMany: jest.fn().mockResolvedValue([old]) } };
    const prisma: any = { commercialRuleVersion: { findUnique: jest.fn().mockResolvedValue(candidate) }, $transaction: jest.fn((callback: any) => callback(tx)) };
    const service = new CommercialService(prisma, { write: jest.fn() } as any, { enqueue: jest.fn() } as any, {} as any);
    await expect(service.activateRuleVersion(user, candidate.id)).rejects.toMatchObject({ response: { code: 'COMMERCIAL_RULE_VERSION_OVERLAP_REQUIRES_SPLIT' } });
  });
});
