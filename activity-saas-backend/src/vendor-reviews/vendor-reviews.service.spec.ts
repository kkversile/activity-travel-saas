import { ConflictException, NotFoundException } from '@nestjs/common';
import { VendorReviewsService } from './vendor-reviews.service';

describe('VendorReviewsService', () => {
  const vendor = { sub: 'user-1', tenantId: 'tenant-1', role: 'VENDOR' } as any;

  it('lists only the active vendor tenant reviews and attaches current product names', async () => {
    const findMany = jest.fn().mockResolvedValue([{ id: 'review-1', rating: 5, product: { productCode: 'TA-1', currentRevision: { productName: 'Sunrise Trek' } } }]);
    const service = new VendorReviewsService({ vendorReview: { findMany } } as any, {} as any);

    const result = await service.list(vendor);

    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { tenantId: 'tenant-1', status: 'PUBLISHED' }, take: 200 }));
    expect(result[0]).toMatchObject({ rating: 5, productName: 'Sunrise Trek' });
  });

  it('rejects a review reply from another vendor tenant', async () => {
    const prisma: any = { $transaction: jest.fn((callback) => callback({ vendorReview: { findFirst: jest.fn().mockResolvedValue(null) } })) };
    const service = new VendorReviewsService(prisma, {} as any);
    await expect(service.reply(vendor, 'review-other', 'Thanks')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('rejects a duplicate external review ID linked to another tenant', async () => {
    const prisma: any = {
      product: { findFirst: jest.fn().mockResolvedValue({ id: 'product-1' }) },
      $transaction: jest.fn((callback) => callback({ vendorReview: { findUnique: jest.fn().mockResolvedValue({ id: 'review-1', tenantId: 'tenant-2' }) } })),
    };
    const service = new VendorReviewsService(prisma, {} as any);
    await expect(service.ingest({ sub: 'admin-1', role: 'ADMIN' } as any, 'tenant-1', {
      source: 'MARKETPLACE', sourceReviewId: 'external-1', productId: 'product-1', rating: 5,
    })).rejects.toBeInstanceOf(ConflictException);
  });
});
