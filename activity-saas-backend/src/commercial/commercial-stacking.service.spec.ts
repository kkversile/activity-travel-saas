import { CommercialRuleKind, CommercialStackingMode } from '@prisma/client';
import { CommercialService } from './commercial.service';

const user: any = { sub: 'admin-1', tenantId: 't1', role: 'ADMIN' };
const taxConfig = { mode: 'NONE', rate: '0', taxableBase: 'AGENT_PRE_TAX', accountableParty: 'NONE', roundingPolicy: 'HALF_UP' };
const promotion = (id: string, stackingMode: CommercialStackingMode = CommercialStackingMode.STACKABLE) => ({ id, kind: CommercialRuleKind.PROMOTION, scopeType: 'GLOBAL', versions: [{ id: `${id}-v1`, priority: 10, stackingMode, effectiveFrom: new Date('2026-09-01'), effectiveTo: null }], config: { discountType: 'FIXED', value: '10', funder: 'VOYA', applicationStage: 'POST_TAX' } });

describe('CommercialService stacking and group safety', () => {
  it.each([CommercialRuleKind.VOYA_REVENUE, CommercialRuleKind.TAX, CommercialRuleKind.AGENT_COMMERCIAL, CommercialRuleKind.FOC, CommercialRuleKind.ELIGIBILITY])('rejects STACKABLE for %s', async (kind) => {
    const prisma: any = { commercialRule: { findUnique: jest.fn().mockResolvedValue({ id: 'rule1', kind, archivedAt: null }) } };
    const service = new CommercialService(prisma, { write: jest.fn() } as any, { enqueue: jest.fn() } as any, {} as any);
    const config = kind === CommercialRuleKind.TAX ? taxConfig : kind === CommercialRuleKind.ELIGIBILITY ? { decision: 'ALLOW' } : kind === CommercialRuleKind.FOC ? { enabled: true, qualifyingQuantity: 2, freeQuantity: 1, appliesTo: 'ADULT', funder: 'SUPPLIER' } : kind === CommercialRuleKind.AGENT_COMMERCIAL ? { model: 'NET_PLUS_MARKUP', markupAmount: '1' } : { model: 'MARKUP_FIXED', fixedAmount: '1' };
    await expect(service.createRuleVersion(user, 'rule1', { effectiveFrom: '2026-09-01T00:00:00.000Z', config, stackingMode: CommercialStackingMode.STACKABLE } as any)).rejects.toMatchObject({ response: { code: 'STACKING_NOT_SUPPORTED_FOR_RULE_KIND' } });
  });

  it('combines stackable promotions only in the winning specificity and priority band', async () => {
    const prisma: any = {
      commercialRule: { findMany: jest.fn().mockResolvedValue([promotion('p1'), promotion('p2'), { ...promotion('lower'), versions: [{ ...promotion('lower').versions[0], priority: 1 }] }]) },
      ratePlan: { findUnique: jest.fn().mockResolvedValue({ id: 'rp1', variantId: 'v1', variant: { productId: 'p1', product: { tenantId: 'vendor1' } } }) },
      agentGroupMember: { findMany: jest.fn().mockResolvedValue([]) },
    };
    const service = new CommercialService(prisma, { write: jest.fn() } as any, { enqueue: jest.fn() } as any, {} as any);
    const resolved = await (service as any).resolveRules({ ratePlanId: 'rp1', serviceDate: '2026-09-15T00:00:00.000Z', units: 1, travellers: [] });
    expect(resolved.filter((item: any) => item.rule.kind === 'PROMOTION').map((item: any) => item.rule.id)).toEqual(['p1', 'p2']);
  });

  it('keeps an exclusive collision ambiguous', async () => {
    const prisma: any = {
      commercialRule: { findMany: jest.fn().mockResolvedValue([promotion('p1', CommercialStackingMode.EXCLUSIVE), promotion('p2', CommercialStackingMode.EXCLUSIVE)]) },
      ratePlan: { findUnique: jest.fn().mockResolvedValue({ id: 'rp1', variantId: 'v1', variant: { productId: 'p1', product: { tenantId: 'vendor1' } } }) },
      agentGroupMember: { findMany: jest.fn().mockResolvedValue([]) },
    };
    const service = new CommercialService(prisma, { write: jest.fn() } as any, { enqueue: jest.fn() } as any, {} as any);
    await expect((service as any).resolveRules({ ratePlanId: 'rp1', serviceDate: '2026-09-15T00:00:00.000Z', units: 1, travellers: [] })).rejects.toMatchObject({ response: { code: 'AMBIGUOUS_RULE' } });
  });

  it('ignores inactive agent groups during resolution', async () => {
    const prisma: any = {
      commercialRule: { findMany: jest.fn().mockResolvedValue([]) },
      ratePlan: { findUnique: jest.fn().mockResolvedValue({ id: 'rp1', variantId: 'v1', variant: { productId: 'p1', product: { tenantId: 'vendor1' } } }) },
      agentGroupMember: { findMany: jest.fn().mockResolvedValue([]) },
    };
    const service = new CommercialService(prisma, { write: jest.fn() } as any, { enqueue: jest.fn() } as any, {} as any);
    await (service as any).resolveRules({ ratePlanId: 'rp1', serviceDate: '2026-09-15T00:00:00.000Z', units: 1, travellers: [], agentTenantId: 'agent1' });
    expect(prisma.agentGroupMember.findMany).toHaveBeenCalledWith({ where: { agentTenantId: 'agent1', agentGroup: { active: true } }, select: { agentGroupId: true } });
  });

  it('blocks new versions for archived rules inside the transaction', async () => {
    const tx: any = { $queryRaw: jest.fn(), commercialRule: { findUniqueOrThrow: jest.fn().mockResolvedValue({ id: 'rule1', kind: CommercialRuleKind.TAX, archivedAt: new Date() }) } };
    const prisma: any = { commercialRule: { findUnique: jest.fn().mockResolvedValue({ id: 'rule1', kind: CommercialRuleKind.TAX, archivedAt: null }) }, $transaction: jest.fn((callback: any) => callback(tx)) };
    const service = new CommercialService(prisma, { write: jest.fn() } as any, { enqueue: jest.fn() } as any, {} as any);
    await expect(service.createRuleVersion(user, 'rule1', { effectiveFrom: '2026-09-01T00:00:00.000Z', config: taxConfig } as any)).rejects.toMatchObject({ response: { code: 'COMMERCIAL_RULE_ARCHIVED' } });
  });

  it('blocks activation when the rule was archived after draft creation', async () => {
    const candidate: any = { id: 'rv1', ruleId: 'rule1', status: 'DRAFT', stackingMode: CommercialStackingMode.EXCLUSIVE, rule: { id: 'rule1', kind: CommercialRuleKind.TAX, archivedAt: new Date() } };
    const tx: any = { $queryRaw: jest.fn(), commercialRuleVersion: { findUniqueOrThrow: jest.fn().mockResolvedValue(candidate) } };
    const prisma: any = { commercialRuleVersion: { findUnique: jest.fn().mockResolvedValue(candidate) }, $transaction: jest.fn((callback: any) => callback(tx)) };
    const service = new CommercialService(prisma, { write: jest.fn() } as any, { enqueue: jest.fn() } as any, {} as any);
    await expect(service.activateRuleVersion(user, 'rv1')).rejects.toMatchObject({ response: { code: 'COMMERCIAL_RULE_ARCHIVED' } });
  });
});
