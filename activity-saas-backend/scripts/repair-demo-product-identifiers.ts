import { randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const vendorSlug = 'blue-mountain-adventures';
const targetName = 'Sunrise Trek to Top Station';
const currentOwnerName = 'Athirappilly Excursion from Kochi to Munnar';
const requestedCode = 'TA-KL-0017';

async function main() {
  await prisma.$transaction(async (tx) => {
    const tenant = await tx.tenant.findUniqueOrThrow({ where: { slug: vendorSlug }, select: { id: true } });
    const [target, currentOwner] = await Promise.all([
      tx.product.findFirstOrThrow({ where: { tenantId: tenant.id, revisions: { some: { productName: targetName } } }, select: { id: true } }),
      tx.product.findFirstOrThrow({ where: { tenantId: tenant.id, revisions: { some: { productName: currentOwnerName } } }, select: { id: true } }),
    ]);
    const [targetIdentifier, ownerIdentifier] = await Promise.all([
      tx.publicIdentifier.findUniqueOrThrow({ where: { entityType_entityId: { entityType: 'PRODUCT', entityId: target.id } } }),
      tx.publicIdentifier.findUniqueOrThrow({ where: { entityType_entityId: { entityType: 'PRODUCT', entityId: currentOwner.id } } }),
    ]);

    if (targetIdentifier.publicCode === requestedCode) {
      console.log(`${targetName} already has ${requestedCode}; no changes needed.`);
      return;
    }
    if (targetIdentifier.publicCode !== 'TA-KL-0016' || ownerIdentifier.publicCode !== requestedCode) {
      throw new Error(`Unexpected ID ownership: ${targetName}=${targetIdentifier.publicCode}, ${currentOwnerName}=${ownerIdentifier.publicCode}. Refusing to change identifiers.`);
    }

    const collectIds = async (productId: string) => {
      const variants = await tx.productVariant.findMany({ where: { productId }, select: { id: true } });
      const variantIds = variants.map((row) => row.id);
      const ratePlans = variantIds.length ? await tx.ratePlan.findMany({ where: { variantId: { in: variantIds } }, select: { id: true } }) : [];
      return [productId, ...variantIds, ...ratePlans.map((row) => row.id)];
    };
    const targetIds = await collectIds(target.id);
    const ownerIds = await collectIds(currentOwner.id);
    const identifiers = await tx.publicIdentifier.findMany({ where: { entityType: { in: ['PRODUCT', 'VARIANT', 'RATE_PLAN'] }, entityId: { in: [...targetIds, ...ownerIds] } } });
    const changes = identifiers.map((row) => {
      const toTarget = targetIds.includes(row.entityId);
      const fromPrefix = toTarget ? 'TA-KL-0016' : requestedCode;
      const toPrefix = toTarget ? requestedCode : 'TA-KL-0016';
      if (row.publicCode !== fromPrefix && !row.publicCode.startsWith(`${fromPrefix}-`))
        throw new Error(`Unexpected child identifier ${row.publicCode} for ${row.entityType}/${row.entityId}.`);
      return { id: row.id, nextCode: row.publicCode.replace(fromPrefix, toPrefix) };
    });

    for (const change of changes)
      await tx.publicIdentifier.update({ where: { id: change.id }, data: { publicCode: `TMP-${randomUUID()}` } });
    for (const change of changes)
      await tx.publicIdentifier.update({ where: { id: change.id }, data: { publicCode: change.nextCode } });

    console.log(`Assigned ${requestedCode} to ${targetName}; ${currentOwnerName} now uses TA-KL-0016. Updated ${changes.length} linked identifiers transactionally.`);
  });
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}).finally(() => prisma.$disconnect());
