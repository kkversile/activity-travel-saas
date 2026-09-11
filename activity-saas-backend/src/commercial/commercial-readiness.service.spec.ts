import { CommercialService } from './commercial.service';
import { CommercialCalculatorService } from './commercial-calculator.service';

const plan = {
  id: 'rp1', basePrice: '100', unitType: 'per_person', instantConfirmation: false, freehold: false, affiliates: [], sourcePayload: null,
  variant: { id: 'variant1', productId: 'product1', product: { tenantId: 'vendor1' } }, travellerRules: [{ type: 'CHILD', maxCount: 5 }],
};
const active = { id: 'cv1', ratePlanId: 'rp1', versionNumber: 1, status: 'ACTIVE', effectiveFrom: new Date('2026-09-01'), effectiveTo: null, supplierModel: 'NET_RATE', pricingUnit: 'PER_PERSON', supplierBaseAmount: '100', bookingMode: 'INSTANT', travellerPrices: [{ travellerType: 'CHILD', amount: '100' }] };
const rules = [
  { id: 'voya1', kind: 'VOYA_REVENUE', scopeType: 'GLOBAL', versions: [{ id: 'voya-v1', priority: 0, stackingMode: 'EXCLUSIVE', effectiveFrom: new Date('2026-09-01'), effectiveTo: null }], config: { model: 'MARKUP_FIXED', fixedAmount: '0' } },
  { id: 'tax1', kind: 'TAX', scopeType: 'GLOBAL', versions: [{ id: 'tax-v1', priority: 0, stackingMode: 'EXCLUSIVE', effectiveFrom: new Date('2026-09-01'), effectiveTo: null }], config: { mode: 'NONE', rate: '0', taxableBase: 'AGENT_PRE_TAX', accountableParty: 'NONE', roundingPolicy: 'HALF_UP' } },
];

function makeService() {
  const prisma: any = {
    ratePlan: { findFirst: jest.fn().mockResolvedValue(plan), findUnique: jest.fn().mockResolvedValue(plan) },
    ratePlanCommercialVersion: { findMany: jest.fn().mockResolvedValue([active]), findFirst: jest.fn().mockResolvedValue(null) },
    commercialRule: { findMany: jest.fn().mockResolvedValue(rules) },
    agentGroupMember: { findMany: jest.fn().mockResolvedValue([]) },
  };
  return new CommercialService(prisma, { write: jest.fn() } as any, { enqueue: jest.fn() } as any, new CommercialCalculatorService());
}

describe('CommercialService structural readiness', () => {
  it('does not synthesize an ADULT requirement for a child-only commercial setup', async () => {
    const result = await makeService().readiness({ sub: 'vendor-user', tenantId: 'vendor1', role: 'VENDOR' } as any, 'rp1', new Date('2026-09-15'));
    expect(result.ready).toBe(true);
    expect(result.reasonCodes).not.toContain('TRAVELLER_PRICE_MISSING');
  });

  it('does not require agent commercial configuration for vendor structural readiness', async () => {
    const result = await makeService().readiness({ sub: 'vendor-user', tenantId: 'vendor1', role: 'VENDOR' } as any, 'rp1', new Date('2026-09-15'));
    expect(result.reasonCodes).not.toContain('AGENT_COMMERCIAL_UNCONFIGURED');
    expect(result.reasonCodes).not.toContain('AGENT_ELIGIBILITY_UNCONFIGURED');
  });

  it('requires agent commercial and eligibility configuration for an agent evaluation', async () => {
    const result = await makeService().readiness({ sub: 'vendor-user', tenantId: 'vendor1', role: 'VENDOR' } as any, 'rp1', new Date('2026-09-15'), 'agent1');
    expect(result.ready).toBe(false);
    expect(result.reasonCodes).toEqual(expect.arrayContaining(['AGENT_COMMERCIAL_UNCONFIGURED', 'AGENT_ELIGIBILITY_UNCONFIGURED']));
  });
});
