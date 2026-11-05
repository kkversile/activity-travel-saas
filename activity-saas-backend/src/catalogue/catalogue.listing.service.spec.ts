import { ProductStatus, UserRole } from '@prisma/client';
import { CatalogueService } from './catalogue.service';

const vendor = { sub: 'u1', email: 'vendor@test', role: UserRole.VENDOR, tenantId: 't1' } as any;

describe('CatalogueService listing projection', () => {
  it('scopes the draft filter to products displayed as Draft', async () => {
    const prisma: any = { product: { count: jest.fn().mockResolvedValue(0), findMany: jest.fn().mockResolvedValueOnce([]).mockResolvedValueOnce([]) } };
    const service = new CatalogueService(prisma, {} as any, {} as any, {} as any);

    await service.listing(vendor, { page: 1, limit: 25, status: 'DRAFT' });

    const where = prisma.product.count.mock.calls[0][0].where;
    expect(where.AND).toEqual(expect.arrayContaining([
      { status: ProductStatus.DRAFT },
      { revisions: { some: { status: 'DRAFT' } } },
      { revisions: { none: { status: 'UNDER_REVIEW' } } },
      { revisions: { none: { status: 'REJECTED' } } },
    ]));
  });

  it('returns typed table fields, active option count and overlapping summary counters', async () => {
    const product = { id: 'p1', tenantId: 't1', productCode: 'PRD-1', status: ProductStatus.LIVE, currentRevisionId: 'r-published', updatedAt: new Date('2026-01-02'), currentRevision: { id: 'r-published', versionNumber: 2, status: 'PUBLISHED', productName: 'Tea walk', cityName: 'Munnar', stateName: 'Kerala', countryName: 'India', updatedAt: new Date('2026-01-02') }, revisions: [{ id: 'r-draft', versionNumber: 3, status: 'DRAFT', productName: 'Tea walk v2', updatedAt: new Date('2026-01-03') }], variants: [{ id: 'v1' }] };
    const prisma: any = { product: { count: jest.fn().mockResolvedValue(1), findMany: jest.fn().mockResolvedValueOnce([product]).mockResolvedValueOnce([{ status: 'LIVE', currentRevision: { status: 'PUBLISHED' }, revisions: [{ status: 'DRAFT' }] }]) }, booking: { groupBy: jest.fn().mockResolvedValue([]) } };
    const service = new CatalogueService(prisma, {} as any, {} as any, {} as any);

    const result = await service.listing(vendor, { page: 1, limit: 25 });

    expect(result.pagination).toEqual({ page: 1, limit: 25, total: 1, totalPages: 1 });
    expect(result.summary).toEqual({ live: 1, review: 0, draft: 1 });
    expect(result.items[0]).toMatchObject({ productCode: 'PRD-1', experienceName: 'Tea walk', destination: 'Munnar, Kerala', optionCount: 1, displayStatus: 'PUBLISHED', action: 'OPEN', quality: { score: expect.any(Number), status: 'SCORED' } });
  });

  it('searches and displays the stable public product code', async () => {
    const product = { id: 'p1', tenantId: 't1', productCode: 'INTERNAL-1', status: ProductStatus.DRAFT, updatedAt: new Date(), revisions: [{ id: 'r1', versionNumber: 1, status: 'DRAFT', productName: 'Sunrise Trek' }], variants: [] };
    const publicIdentifier = { findMany: jest.fn().mockResolvedValueOnce([{ entityId: 'p1' }]), findUnique: jest.fn().mockResolvedValue({ publicCode: 'TA-KL-0017' }) };
    const prisma: any = { publicIdentifier, product: { count: jest.fn().mockResolvedValue(1), findMany: jest.fn().mockResolvedValueOnce([product]).mockResolvedValueOnce([]) }, booking: { groupBy: jest.fn().mockResolvedValue([]) } };
    const service = new CatalogueService(prisma, {} as any, {} as any, {} as any);

    const result = await service.listing(vendor, { page: 1, limit: 25, search: 'TA-KL-0017' });

    expect(prisma.product.count.mock.calls[0][0].where.OR).toEqual(expect.arrayContaining([{ id: { in: ['p1'] } }]));
    expect(result.items[0].productCode).toBe('TA-KL-0017');
  });
});
