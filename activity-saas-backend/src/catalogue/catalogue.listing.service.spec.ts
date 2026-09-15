import { ProductStatus, UserRole } from '@prisma/client';
import { CatalogueService } from './catalogue.service';

const vendor = { sub: 'u1', email: 'vendor@test', role: UserRole.VENDOR, tenantId: 't1' } as any;

describe('CatalogueService listing projection', () => {
  it('returns typed table fields, active option count and overlapping summary counters', async () => {
    const product = { id: 'p1', tenantId: 't1', productCode: 'PRD-1', status: ProductStatus.LIVE, currentRevisionId: 'r-published', updatedAt: new Date('2026-01-02'), currentRevision: { id: 'r-published', versionNumber: 2, status: 'PUBLISHED', productName: 'Tea walk', cityName: 'Munnar', stateName: 'Kerala', countryName: 'India', updatedAt: new Date('2026-01-02') }, revisions: [{ id: 'r-draft', versionNumber: 3, status: 'DRAFT', productName: 'Tea walk v2', updatedAt: new Date('2026-01-03') }], variants: [{ id: 'v1' }] };
    const prisma: any = { product: { count: jest.fn().mockResolvedValue(1), findMany: jest.fn().mockResolvedValueOnce([product]).mockResolvedValueOnce([{ status: 'LIVE', currentRevision: { status: 'PUBLISHED' }, revisions: [{ status: 'DRAFT' }] }]) } };
    const service = new CatalogueService(prisma, {} as any, {} as any, {} as any);

    const result = await service.listing(vendor, { page: 1, limit: 25 });

    expect(result.pagination).toEqual({ page: 1, limit: 25, total: 1, totalPages: 1 });
    expect(result.summary).toEqual({ live: 1, review: 0, draft: 1 });
    expect(result.items[0]).toMatchObject({ productCode: 'PRD-1', experienceName: 'Tea walk', destination: 'Munnar, Kerala', optionCount: 1, displayStatus: 'PUBLISHED', action: 'OPEN', quality: { score: null, status: 'NOT_SCORED' } });
  });
});
