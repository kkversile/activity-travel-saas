import { CatalogueService } from './catalogue.service';

export function attachCatalogueTestOutletAccess(service: CatalogueService) {
  // Legacy business-rule tests assume an authorized workspace. Supply the
  // parent projection used by the new ownership preflight without consuming
  // their queued reads. Isolation tests use the real resolver and real rows.
  const prisma = (service as any).prisma;
  for (const name of ['productRevision', 'productVariant', 'productBookingQuestion']) {
    if (!prisma[name]?.findFirst) continue;
    const original = prisma[name].findFirst;
    prisma[name].findFirst = new Proxy(original, {
      apply(target, receiver, args) {
        const select = args[0]?.select;
        if (select?.product?.select?.outletId) return Promise.resolve({ product: { outletId: 'outlet-test' } });
        if (select?.productRevision?.select?.product?.select?.outletId) return Promise.resolve({ productRevision: { product: { outletId: 'outlet-test' } } });
        return Reflect.apply(target, receiver, args);
      },
    });
  }
  (service as any).outletAccess = {
    resolve: jest.fn(async (user: any, outletId?: string) => ({
      tenantId: user.tenantId || 'tenant-test',
      outletIds: [outletId || 'outlet-test'],
      aggregate: false,
    })),
  };
  const originalProduct = (service as any).product.bind(service);
  (service as any).product = async (user: any, id: string) => {
    if (user.role !== 'VENDOR') return originalProduct(user, id);
    const prisma = (service as any).prisma;
    const product = await prisma.product.findFirst({ where: { id, tenantId: user.tenantId, deletedAt: null } });
    if (!product) throw new Error('Product not found');
    const outletId = product.outletId || 'outlet-test';
    await (service as any).outletAccess.resolve(user, outletId);
    return { ...product, outletId };
  };
  return service;
}
