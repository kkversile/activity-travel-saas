import { UserRole } from '@prisma/client';
import { CatalogueService } from './catalogue.service';

it('orders product options deterministically, including identical creation timestamps, without changing outlet ownership checks', async () => {
  const prisma: any = { product: { findFirstOrThrow: jest.fn().mockResolvedValue({ id: 'p1', tenantId: 't1', revisions: [], variants: [], currentRevision: null }) } };
  const service = new CatalogueService(prisma, {} as any, {} as any, {} as any);
  const ownership = jest.spyOn(service as any, 'product').mockResolvedValue({ id: 'p1', tenantId: 't1' });
  const vendor: any = { sub: 'u1', role: UserRole.VENDOR, tenantId: 't1' };
  await service.get(vendor, 'p1');
  expect(ownership).toHaveBeenCalledWith(vendor, 'p1');
  expect(prisma.product.findFirstOrThrow).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'p1', tenantId: 't1', deletedAt: null }, include: expect.objectContaining({ variants: expect.objectContaining({ orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] }) }) }));
});
