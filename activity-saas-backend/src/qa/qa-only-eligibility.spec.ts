import { getQaOnlyEligibilityOverride, qaOnlyOverridesEnabled } from './qa-only-eligibility';

describe('Scoped demo eligibility fixture', () => {
  const original = { ...process.env };
  const now = new Date('2026-11-15T00:00:00Z');
  afterEach(() => { process.env = { ...original }; });
  function fixture(extra = {}) {
    const value = { qaOnly: true, productId: 'product-17', agentTenantId: 'agent-1', publicProductCode: 'TA-KL-0017', publicAgentCode: 'AGT-0001', expiresAt: '2026-11-15T00:20:00Z', documentStatus: 'UNVERIFIED_TEST_FIXTURE', documentAssetId: 'demo-document', voyaRevenuePercent: 5, agentMarkupAmount: 0, ...extra };
    return { globalSetting: { findUnique: jest.fn().mockResolvedValue({ value }) } };
  }
  function enableDemo() { process.env.NODE_ENV = 'production'; process.env.QA_ONLY_ELIGIBILITY_OVERRIDES_ENABLED = 'true'; process.env.QA_ONLY_PRODUCTION_DEMO_ORIGIN = 'https://demo.dhisoft.in/voya'; }
  it('keeps production closed without the exact demo deployment opt-in', () => {
    process.env.NODE_ENV = 'production'; process.env.QA_ONLY_ELIGIBILITY_OVERRIDES_ENABLED = 'true'; delete process.env.QA_ONLY_PRODUCTION_DEMO_ORIGIN;
    expect(qaOnlyOverridesEnabled()).toBe(false);
    process.env.QA_ONLY_PRODUCTION_DEMO_ORIGIN = 'https://another.example/voya';
    expect(qaOnlyOverridesEnabled()).toBe(false);
  });
  it('requires both deployment switches', () => { enableDemo(); delete process.env.QA_ONLY_ELIGIBILITY_OVERRIDES_ENABLED; expect(qaOnlyOverridesEnabled()).toBe(false); });
  it('keeps the document explicitly unverified for the exact short-lived fixture', async () => {
    enableDemo(); await expect(getQaOnlyEligibilityOverride(fixture(), 'product-17', 'agent-1', now)).resolves.toMatchObject({ qaOnly: true, documentStatus: 'UNVERIFIED_TEST_FIXTURE' });
  });
  it('limits the approved commission rehearsal to one product, Agent and rate plan', async () => {
    enableDemo();
    const product = '2b3dea95-24e5-432b-93a1-445f50cf0be5';
    const agent = 'b679db51-a5b6-4853-89b1-f250103b4dc6';
    const db = fixture({ productId: product, agentTenantId: agent, publicProductCode: 'TA-TN-0005', fixturePurpose: 'COMMISSION_INVOICE', ratePlanId: 'commission-plan', voyaRevenuePercent: 25 });
    await expect(getQaOnlyEligibilityOverride(db, product, agent, now, 'commission-plan')).resolves.toMatchObject({ documentStatus: 'UNVERIFIED_TEST_FIXTURE', ratePlanId: 'commission-plan' });
    await expect(getQaOnlyEligibilityOverride(db, product, agent, now, 'other-plan')).resolves.toBeNull();
    await expect(getQaOnlyEligibilityOverride(db, product, agent, now)).resolves.toBeNull();
    await expect(getQaOnlyEligibilityOverride(db, 'other-product', agent, now, 'commission-plan')).resolves.toBeNull();
    await expect(getQaOnlyEligibilityOverride(db, product, 'other-agent', now, 'commission-plan')).resolves.toBeNull();
  });
  it.each([{ agentTenantId: 'other-agent' }, { productId: 'other-product' }, { expiresAt: '2026-11-14T00:00:00Z' }, { expiresAt: '2026-11-16T00:00:00Z' }, { documentStatus: 'VERIFIED' }])('rejects a mismatched, expired or unbounded fixture %j', async (extra) => {
    enableDemo(); await expect(getQaOnlyEligibilityOverride(fixture(extra), 'product-17', 'agent-1', now)).resolves.toBeNull();
  });
});
