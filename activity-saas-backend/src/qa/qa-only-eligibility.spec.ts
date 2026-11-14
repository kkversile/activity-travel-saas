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
  it.each([{ agentTenantId: 'other-agent' }, { productId: 'other-product' }, { expiresAt: '2026-11-14T00:00:00Z' }, { expiresAt: '2026-11-16T00:00:00Z' }, { documentStatus: 'VERIFIED' }])('rejects a mismatched, expired or unbounded fixture %j', async (extra) => {
    enableDemo(); await expect(getQaOnlyEligibilityOverride(fixture(extra), 'product-17', 'agent-1', now)).resolves.toBeNull();
  });
});
