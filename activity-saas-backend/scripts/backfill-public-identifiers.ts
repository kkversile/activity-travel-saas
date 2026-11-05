import { PrismaClient } from "@prisma/client";
import {
  PublicEntity,
  allocatePublicCode,
  ensurePublicIdentifier,
  publicCodeNumber,
  stateCode,
  vendorPayoutPublicCode,
} from "../src/common/public-identifiers";

const prisma = new PrismaClient();
const pad = (value: number, width: number) => String(value).padStart(width, "0");

async function main() {
  const vendors = await prisma.tenant.findMany({
    where: { kind: "VENDOR" },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    select: { id: true },
  });
  for (const [index, tenant] of vendors.entries())
    await ensurePublicIdentifier(
      prisma,
      PublicEntity.VENDOR,
      tenant.id,
      `SUP-${pad(index + 1, 4)}`,
    );

  const agents = await prisma.tenant.findMany({
    where: { kind: "TRAVEL_AGENT" },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    select: { id: true },
  });
  for (const [index, tenant] of agents.entries())
    await ensurePublicIdentifier(
      prisma,
      PublicEntity.AGENT,
      tenant.id,
      `AGT-${pad(index + 1, 4)}`,
    );

  const masters = await prisma.experienceMaster.findMany({
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    select: { id: true },
  });
  for (const [index, master] of masters.entries())
    await ensurePublicIdentifier(
      prisma,
      PublicEntity.MASTER_PRODUCT,
      master.id,
      `MP-${pad(index + 1, 4)}`,
    );

  const products = await prisma.product.findMany({
    where: { deletedAt: null },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    select: {
      id: true,
      currentRevision: { select: { stateName: true } },
    },
  });
  const productCounters = new Map<string, number>();
  for (const product of products) {
    const prefix = `TA-${stateCode(product.currentRevision?.stateName)}-`;
    const next = (productCounters.get(prefix) ?? 0) + 1;
    productCounters.set(prefix, next);
    await ensurePublicIdentifier(
      prisma,
      PublicEntity.PRODUCT,
      product.id,
      `${prefix}${pad(next, 4)}`,
    );
  }

  const productCodes = new Map(
    (
      await prisma.publicIdentifier.findMany({
        where: { entityType: PublicEntity.PRODUCT },
        select: { entityId: true, publicCode: true },
      })
    ).map((row) => [row.entityId, row.publicCode]),
  );
  const variants = await prisma.productVariant.findMany({
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    select: { id: true, productId: true },
  });
  const variantCounters = new Map<string, number>();
  for (const variant of variants) {
    const productCode = productCodes.get(variant.productId) || "TA-XX-0000";
    const next = (variantCounters.get(variant.productId) ?? 0) + 1;
    variantCounters.set(variant.productId, next);
    await ensurePublicIdentifier(
      prisma,
      PublicEntity.VARIANT,
      variant.id,
      `${productCode}-O${pad(next, 2)}`,
    );
  }

  const ratePlans = await prisma.ratePlan.findMany({
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    select: { id: true, variantId: true, variant: { select: { productId: true } } },
  });
  const rateCounters = new Map<string, number>();
  for (const plan of ratePlans) {
    const productCode = productCodes.get(plan.variant.productId) || "TA-XX-0000";
    const productId = plan.variant.productId;
    const next = (rateCounters.get(productId) ?? 0) + 1;
    rateCounters.set(productId, next);
    await ensurePublicIdentifier(
      prisma,
      PublicEntity.RATE_PLAN,
      plan.id,
      `${productCode}-R${pad(next, 2)}`,
    );
  }

  const bookings = await prisma.booking.findMany({
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    select: { id: true, channel: true, createdAt: true },
  });
  const bookingCounters = new Map<string, number>();
  for (const booking of bookings) {
    const prefix = booking.channel === "VOYA_AGENT" ? "AG" : booking.channel === "VOYA_API" ? "AP" : "BK";
    const period = `${String(booking.createdAt.getUTCFullYear()).slice(-2)}${pad(booking.createdAt.getUTCMonth() + 1, 2)}`;
    const key = `${prefix}-${period}`;
    const next = (bookingCounters.get(key) ?? 0) + 1;
    bookingCounters.set(key, next);
    await ensurePublicIdentifier(
      prisma,
      PublicEntity.BOOKING,
      booking.id,
      `${key}${pad(next, 4)}`,
    );
  }

  const rules = await prisma.commercialRule.findMany({
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    select: { id: true },
  });
  for (const [index, rule] of rules.entries())
    await ensurePublicIdentifier(
      prisma,
      PublicEntity.COMMERCIAL_RULE,
      rule.id,
      `RULE-${pad(index + 1, 4)}`,
    );

  const selectionRules = await prisma.experienceSelectionRuleSet.findMany({
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    select: { id: true },
  });
  for (const [index, rule] of selectionRules.entries())
    await ensurePublicIdentifier(
      prisma,
      PublicEntity.SELECTION_RULE_SET,
      rule.id,
      `SRS-${pad(index + 1, 2)}`,
    );

  const promotions = await prisma.promotion.findMany({
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    select: { id: true },
  });
  for (const [index, promotion] of promotions.entries())
    await ensurePublicIdentifier(
      prisma,
      PublicEntity.PROMOTION,
      promotion.id,
      `PRM-${pad(index + 1, 4)}`,
    );

  const platformCoupons = await prisma.platformCoupon.findMany({
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    select: { id: true },
  });
  for (const [index, coupon] of platformCoupons.entries())
    await ensurePublicIdentifier(
      prisma,
      PublicEntity.PLATFORM_COUPON,
      coupon.id,
      `CPN-${pad(index + 1, 4)}`,
    );

  const vendorCodes = new Map(
    (
      await prisma.publicIdentifier.findMany({
        where: { entityType: PublicEntity.VENDOR },
        select: { entityId: true, publicCode: true },
      })
    ).map((row) => [row.entityId, row.publicCode]),
  );
  const batches = await prisma.settlementBatch.findMany({
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    select: { id: true, vendorTenantId: true, createdAt: true },
  });
  for (const batch of batches) {
    const existing = await prisma.publicIdentifier.findUnique({ where: { entityType_entityId: { entityType: PublicEntity.SETTLEMENT_BATCH, entityId: batch.id } } });
    if (existing) continue;
    const date = batch.createdAt;
    const baseCode = `PB-${date.toISOString().slice(0, 10).replace(/-/g, "")}`;
    const baseExists = await prisma.publicIdentifier.findUnique({ where: { publicCode: baseCode }, select: { id: true } });
    const batchCode = baseExists ? await allocatePublicCode(prisma, PublicEntity.SETTLEMENT_BATCH, `${baseCode}-`, 2) : baseCode;
    await ensurePublicIdentifier(
      prisma,
      PublicEntity.SETTLEMENT_BATCH,
      batch.id,
      batchCode,
    );
  }

  const payouts = await prisma.payout.findMany({
    where: { recordType: "CANONICAL" },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    select: { id: true, tenantId: true, createdAt: true },
  });
  for (const payout of payouts) {
    const existing = await prisma.publicIdentifier.findUnique({ where: { entityType_entityId: { entityType: PublicEntity.PAYOUT, entityId: payout.id } }, select: { id: true } });
    if (existing) continue;
    const baseCode = vendorPayoutPublicCode(vendorCodes.get(payout.tenantId) || "", payout.createdAt);
    if (!baseCode) continue;
    const baseExists = await prisma.publicIdentifier.findUnique({ where: { publicCode: baseCode }, select: { id: true } });
    const code = baseExists ? await allocatePublicCode(prisma, PublicEntity.PAYOUT, `${baseCode}-`, 2) : baseCode;
    await ensurePublicIdentifier(prisma, PublicEntity.PAYOUT, payout.id, code);
  }

  console.log(
    JSON.stringify({
      vendors: vendors.length,
      agents: agents.length,
      masters: masters.length,
      products: products.length,
      variants: variants.length,
      ratePlans: ratePlans.length,
      bookings: bookings.length,
      rules: rules.length,
      selectionRules: selectionRules.length,
      promotions: promotions.length,
      platformCoupons: platformCoupons.length,
      settlementBatches: batches.length,
      payouts: payouts.length,
    }),
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
