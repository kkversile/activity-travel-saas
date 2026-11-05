import type { PrismaService } from '../prisma/prisma.service';

export const QA_ONLY_AGENT_PRODUCT_PREFIX = 'qa-only.agent-product.';
export const QA_ONLY_AGENT_PRODUCT_KEY = (productId: string) => `${QA_ONLY_AGENT_PRODUCT_PREFIX}${productId}`;

export type QaOnlyEligibilityOverride = {
  qaOnly: true;
  productId: string;
  agentTenantId: string;
  publicProductCode: 'TA-KL-0017';
  publicAgentCode: 'AGT-0001';
  expiresAt: string;
  documentStatus: 'UNVERIFIED_TEST_FIXTURE';
  documentAssetId: string;
  voyaRevenuePercent: 5;
  agentMarkupAmount: 0;
};

type SettingClient = Pick<PrismaService, 'globalSetting'> | any;

export function qaOnlyOverridesEnabled() {
  return process.env.QA_ONLY_ELIGIBILITY_OVERRIDES_ENABLED === 'true'
    && process.env.NODE_ENV !== 'production';
}

function validateOverride(value: unknown, productId: string, agentTenantId: string, now: Date): QaOnlyEligibilityOverride | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const expiresAt = typeof record.expiresAt === 'string' ? record.expiresAt : '';
  const expiry = new Date(expiresAt);
  if (record.qaOnly !== true || record.productId !== productId || record.agentTenantId !== agentTenantId) return null;
  if (record.publicProductCode !== 'TA-KL-0017' || record.publicAgentCode !== 'AGT-0001') return null;
  if (record.documentStatus !== 'UNVERIFIED_TEST_FIXTURE' || typeof record.documentAssetId !== 'string' || !record.documentAssetId) return null;
  if (Number(record.voyaRevenuePercent) !== 5 || Number(record.agentMarkupAmount) !== 0) return null;
  if (!Number.isFinite(expiry.valueOf()) || expiry <= now) return null;
  return record as QaOnlyEligibilityOverride;
}

export async function getQaOnlyEligibilityOverride(
  db: SettingClient,
  productId: string,
  agentTenantId?: string,
  now = new Date(),
): Promise<QaOnlyEligibilityOverride | null> {
  if (!qaOnlyOverridesEnabled() || !agentTenantId || !db?.globalSetting?.findUnique) return null;
  const row = await db.globalSetting.findUnique({
    where: { tenantId_key: { tenantId: agentTenantId, key: QA_ONLY_AGENT_PRODUCT_KEY(productId) } },
    select: { value: true },
  });
  return validateOverride(row?.value, productId, agentTenantId, now);
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
    const override = validateOverride(row.value, productId, agentTenantId, now);
    return override ? [override] : [];
  });
}
