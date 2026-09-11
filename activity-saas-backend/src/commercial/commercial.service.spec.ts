import { CommercialService } from './commercial.service';

describe('CommercialService transaction client seam', () => {
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
});
