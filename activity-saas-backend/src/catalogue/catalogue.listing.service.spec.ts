import { ProductStatus, UserRole } from '@prisma/client';
import { CatalogueService } from './catalogue.service';
import { attachCatalogueTestOutletAccess } from './catalogue-test-outlet-access';

const vendor = { sub: 'u1', email: 'vendor@test', role: UserRole.VENDOR, tenantId: 't1' } as any;

describe('CatalogueService listing projection', () => {
  const ratePlan = (currency: string | undefined, amounts: unknown[]) => ({
    currency: 'INR',
    commercialVersions: [{ currency, travellerPrices: amounts.map(amount => ({ amount })) }],
  });
  async function listingWithVariants(variants: any[], revisions?: any) {
    const product = { id: 'p1', tenantId: 't1', productCode: 'PRD-1', status: ProductStatus.DRAFT, updatedAt: new Date('2026-11-26'), revisions: [{ id: 'r1', versionNumber: 1, status: 'DRAFT', productName: 'Harbour walk' }], variants, ...revisions };
    const prisma: any = { product: { count: jest.fn().mockResolvedValue(1), findMany: jest.fn().mockResolvedValueOnce([product]).mockResolvedValueOnce([]) }, booking: { groupBy: jest.fn().mockResolvedValue([]) } };
    const service = attachCatalogueTestOutletAccess(new CatalogueService(prisma, {} as any, {} as any, {} as any));
    const result = await service.listing(vendor, { page: 1, limit: 25 });
    return { item: result.items[0], prisma };
  }

  it.each([
    ['USD', ['175.50', '90.25'], 90.25],
    ['INR', ['1800', '900'], 900],
    ['EUR', ['140.10', '80'], 80],
    ['USD', ['175.50', '0'], 0],
    ['USD', [null, undefined, '', 'NaN', 'Infinity', '175.50'], 175.5],
    ['usd', ['175.50'], 175.5],
    ['P9X', ['175.50'], 175.5],
  ])('pairs the %s minimum with its source currency (%j)', async (currency, amounts, expected) => {
    const { item, prisma } = await listingWithVariants([{ id: 'v1', revisionId: 'r1', ratePlans: [ratePlan(currency, amounts)] }]);
    const code = currency.toUpperCase();
    expect(item).toMatchObject({ startingPrice: expected, startingPriceCurrency: code, startingPrices: [{ currency: code, amount: expected }] });
    expect(prisma.product.findMany.mock.calls[0][0].include.variants.select.ratePlans.select.currency).toBe(true);
  });

  it('selects the minimum across options without borrowing another option currency', async () => {
    const { item } = await listingWithVariants([
      { id: 'v1', revisionId: 'r1', ratePlans: [ratePlan('USD', ['175'])] },
      { id: 'v2', revisionId: 'r1', ratePlans: [ratePlan('USD', ['90'])] },
    ]);
    expect(item).toMatchObject({ startingPrice: 90, startingPriceCurrency: 'USD', startingPrices: [{ currency: 'USD', amount: 90 }] });
  });

  it('keeps independent minima for mixed currencies instead of comparing their raw amounts', async () => {
    const { item } = await listingWithVariants([
      { id: 'v1', revisionId: 'r1', ratePlans: [ratePlan('USD', ['50', '90'])] },
      { id: 'v2', revisionId: 'r1', ratePlans: [ratePlan('INR', ['900', '1200'])] },
      { id: 'v3', revisionId: 'r1', ratePlans: [ratePlan('USD', ['45'])] },
    ]);
    expect(item).toMatchObject({ startingPrice: null, startingPriceCurrency: null, startingPrices: [{ currency: 'INR', amount: 900 }, { currency: 'USD', amount: 45 }] });
  });

  it('uses the rate-plan currency for legacy commercial versions without a currency', async () => {
    const legacy = { ...ratePlan(undefined, ['90']), currency: 'EUR' };
    const { item } = await listingWithVariants([{ id: 'v1', revisionId: 'r1', ratePlans: [legacy] }]);
    expect(item).toMatchObject({ startingPrice: 90, startingPriceCurrency: 'EUR' });
  });

  it.each([
    { ratePlans: [] },
    { ratePlans: [ratePlan('USD', [])] },
    { ratePlans: [ratePlan('USD', [null, '', 'NaN'])] },
  ])('does not invent a currency or price when no price exists (%j)', async ({ ratePlans }) => {
    const { item } = await listingWithVariants([{ id: 'v1', revisionId: 'r1', ratePlans }]);
    expect(item).toMatchObject({ startingPrice: null, startingPriceCurrency: null, startingPrices: [] });
  });

  it('takes the currency from the selected latest commercial version, not an older version', async () => {
    const latest = ratePlan('USD', ['90']);
    latest.commercialVersions.push(ratePlan('INR', ['10']).commercialVersions[0]);
    const { item } = await listingWithVariants([{ id: 'v1', revisionId: 'r1', ratePlans: [latest] }]);
    expect(item).toMatchObject({ startingPrice: 90, startingPriceCurrency: 'USD' });
  });

  it('keeps working-revision currency separate from the published revision', async () => {
    const { item } = await listingWithVariants([
      { id: 'v1', revisionId: 'r-published', ratePlans: [ratePlan('INR', ['900'])] },
      { id: 'v2', revisionId: 'r1', ratePlans: [ratePlan('USD', ['90'])] },
    ], { status: ProductStatus.LIVE, currentRevisionId: 'r-published', currentRevision: { id: 'r-published', status: 'PUBLISHED', productName: 'Published harbour walk' } });
    expect(item).toMatchObject({ startingPrice: 90, startingPriceCurrency: 'USD', optionCount: 1, displayStatus: 'PUBLISHED' });
  });

  it('scopes the draft filter to products displayed as Draft', async () => {
    const prisma: any = { product: { count: jest.fn().mockResolvedValue(0), findMany: jest.fn().mockResolvedValueOnce([]).mockResolvedValueOnce([]) } };
    const service = attachCatalogueTestOutletAccess(new CatalogueService(prisma, {} as any, {} as any, {} as any));

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
    const service = attachCatalogueTestOutletAccess(new CatalogueService(prisma, {} as any, {} as any, {} as any));

    const result = await service.listing(vendor, { page: 1, limit: 25 });

    expect(result.pagination).toEqual({ page: 1, limit: 25, total: 1, totalPages: 1 });
    expect(result.summary).toEqual({ live: 1, review: 0, draft: 1 });
    expect(result.items[0]).toMatchObject({ productCode: 'PRD-1', experienceName: 'Tea walk', destination: 'Munnar, Kerala', optionCount: 1, displayStatus: 'PUBLISHED', action: 'OPEN', quality: { score: expect.any(Number), status: 'SCORED' } });
  });

  it('searches and displays the stable public product code', async () => {
    const product = { id: 'p1', tenantId: 't1', productCode: 'INTERNAL-1', status: ProductStatus.DRAFT, updatedAt: new Date(), revisions: [{ id: 'r1', versionNumber: 1, status: 'DRAFT', productName: 'Sunrise Trek' }], variants: [] };
    const publicIdentifier = { findMany: jest.fn().mockResolvedValueOnce([{ entityId: 'p1' }]), findUnique: jest.fn().mockResolvedValue({ publicCode: 'TA-KL-0017' }) };
    const prisma: any = { publicIdentifier, product: { count: jest.fn().mockResolvedValue(1), findMany: jest.fn().mockResolvedValueOnce([product]).mockResolvedValueOnce([]) }, booking: { groupBy: jest.fn().mockResolvedValue([]) } };
    const service = attachCatalogueTestOutletAccess(new CatalogueService(prisma, {} as any, {} as any, {} as any));

    const result = await service.listing(vendor, { page: 1, limit: 25, search: 'TA-KL-0017' });

    expect(prisma.product.count.mock.calls[0][0].where.OR).toEqual(expect.arrayContaining([{ id: { in: ['p1'] } }]));
    expect(result.items[0].productCode).toBe('TA-KL-0017');
  });
});
