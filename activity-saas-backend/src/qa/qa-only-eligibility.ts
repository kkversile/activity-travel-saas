import type { PrismaService } from '../prisma/prisma.service';

export const QA_ONLY_AGENT_PRODUCT_PREFIX = 'qa-only.agent-product.';
export const QA_ONLY_AGENT_PRODUCT_KEY = (productId: string) => `${QA_ONLY_AGENT_PRODUCT_PREFIX}${productId}`;

export type QaOnlyEligibilityOverride = {
  qaOnly: true;
  productId: string;
  agentTenantId: string;
  publicProductCode: 'TA-KL-0017' | 'TA-TN-0005';
  fixturePurpose?: 'COMMISSION_INVOICE';
  ratePlanId?: string;
  publicAgentCode: 'AGT-0001';
  expiresAt: string;
  documentStatus: 'UNVERIFIED_TEST_FIXTURE';
  documentAssetId: string;
  voyaRevenuePercent: 5 | 25;
  agentMarkupAmount: 0;
};

type SettingClient = Pick<PrismaService, 'globalSetting'> | any;

export function qaOnlyOverridesEnabled() {
  return process.env.QA_ONLY_ELIGIBILITY_OVERRIDES_ENABLED === 'true'
    && (process.env.NODE_ENV !== 'production'
      || process.env.QA_ONLY_PRODUCTION_DEMO_ORIGIN === 'https://demo.dhisoft.in/voya');
}

function validateOverride(value: unknown, productId: string, agentTenantId: string, now: Date, ratePlanId?: string, discovery = false): QaOnlyEligibilityOverride | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const expiresAt = typeof record.expiresAt === 'string' ? record.expiresAt : '';
  const expiry = new Date(expiresAt);
  if (record.qaOnly !== true || record.productId !== productId || record.agentTenantId !== agentTenantId) return null;
  const commissionFixture = record.publicProductCode === 'TA-TN-0005'
    && record.fixturePurpose === 'COMMISSION_INVOICE'
    && productId === '2b3dea95-24e5-432b-93a1-445f50cf0be5'
    && agentTenantId === 'b679db51-a5b6-4853-89b1-f250103b4dc6'
    && typeof record.ratePlanId === 'string' && record.ratePlanId.length > 0;
  if ((!commissionFixture && record.publicProductCode !== 'TA-KL-0017') || record.publicAgentCode !== 'AGT-0001') return null;
  if (commissionFixture && !discovery && record.ratePlanId !== ratePlanId) return null;
  if (record.documentStatus !== 'UNVERIFIED_TEST_FIXTURE' || typeof record.documentAssetId !== 'string' || !record.documentAssetId) return null;
  if (Number(record.voyaRevenuePercent) !== (commissionFixture ? 25 : 5) || Number(record.agentMarkupAmount) !== 0) return null;
  if (!Number.isFinite(expiry.valueOf()) || expiry <= now) return null;
  // Production-mode demo rehearsals require an explicit deployment opt-in and
  // a short-lived, exact product/agent fixture. Normal production stays closed.
  if (process.env.NODE_ENV === 'production' && expiry.valueOf() - now.valueOf() > 30 * 60 * 1000) return null;
  return record as QaOnlyEligibilityOverride;
}

export async function getQaOnlyEligibilityOverride(
  db: SettingClient,
  productId: string,
  agentTenantId?: string,
  now = new Date(),
  ratePlanId?: string,
): Promise<QaOnlyEligibilityOverride | null> {
  if (!qaOnlyOverridesEnabled() || !agentTenantId || !db?.globalSetting?.findUnique) return null;
  const row = await db.globalSetting.findUnique({
    where: { tenantId_key: { tenantId: agentTenantId, key: QA_ONLY_AGENT_PRODUCT_KEY(productId) } },
    select: { value: true },
  });
  return validateOverride(row?.value, productId, agentTenantId, now, ratePlanId);
}

export async function getQaOnlyEligibilityOverridesForAgent(
  db: SettingClient,
  agentTenantId: string,
  now = new Date(),
): Promise<QaOnlyEligibilityOverride[]> {
  if (!qaOnlyOverridesEnabled() || !agentTenantId || !db?.globalSetting?.findMany) return [];
  const rows = await db.globalSetting.findMany({
    where: { tenantId: agentTenantId, key: { startsWith: QA_ONLY_AGENT_PRODUCT_PREFIX } },
    select: { key: true, value: true },
  });
  return rows.flatMap((row: any) => {
    const productId = row.key.slice(QA_ONLY_AGENT_PRODUCT_PREFIX.length);
    const override = validateOverride(row.value, productId, agentTenantId, now, undefined, true);
    return override ? [override] : [];
  });
}
