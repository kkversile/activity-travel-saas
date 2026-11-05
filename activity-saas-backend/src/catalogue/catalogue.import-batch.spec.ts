import { UserRole } from '@prisma/client';
import { BadRequestException } from '@nestjs/common';
import { CatalogueService } from './catalogue.service';

const vendor = { sub: 'vendor-user', email: 'vendor@example.test', role: UserRole.VENDOR, tenantId: 'tenant-1' } as any;
const productImport = (key: string) => ({
  Basic_Info: [{ product_key: key, product_name: key }],
  Experience: [{}],
  Options: [{}],
  Rate_Plans: [{}],
  Availability: [{}],
});

function createService() {
  const prisma: any = { product: { findMany: jest.fn().mockResolvedValue([]), findFirst: jest.fn().mockResolvedValue(null) } };
  const service = new CatalogueService(prisma, {} as any, {} as any, {} as any);
  return { service, prisma };
}

describe('CatalogueService batch product import', () => {
  it('rejects a single JSON import above the 2,000-row API limit', async () => {
    const { service } = createService();
    const tooManyRows = productImport('LARGE');
    tooManyRows.Options = Array.from({ length: 1997 }, () => ({}));

    await expect(service.importJson(vendor, tooManyRows as any))
      .rejects.toMatchObject({ response: expect.objectContaining({ code: 'IMPORT_ROW_LIMIT_EXCEEDED' }) });
  });

  it('rejects duplicate product keys before preflight or writes', async () => {
    const { service } = createService();
    const importSpy = jest.spyOn(service, 'importJson').mockResolvedValue({ valid: true } as any);

    await expect(service.importBatch(vendor, { products: [productImport('DUP'), productImport('dup')] as any }))
      .rejects.toMatchObject({ response: expect.objectContaining({ code: 'IMPORT_BATCH_DUPLICATE_PRODUCT_KEY' }) });
    expect(importSpy).not.toHaveBeenCalled();
  });

  it('preflights every product and performs no writes if any validation fails', async () => {
    const { service, prisma } = createService();
    const importSpy = jest.spyOn(service, 'importJson').mockImplementation(async (_user, dto, _key, validateOnly) => {
      if (validateOnly && dto.Basic_Info?.[0]?.product_key === 'BAD') throw new BadRequestException({ issues: ['invalid rates'] });
      return validateOnly ? { valid: true } as any : { productId: 'unexpected-write' } as any;
    });

    await expect(service.importBatch(vendor, { products: [productImport('GOOD'), productImport('BAD')] as any }))
      .rejects.toMatchObject({ response: expect.objectContaining({ code: 'IMPORT_BATCH_VALIDATION_FAILED' }) });
    expect(importSpy).toHaveBeenCalledTimes(2);
    expect(importSpy.mock.calls.every((call) => call[3] === true)).toBe(true);
    expect(prisma.product.findMany).not.toHaveBeenCalled();
  });

  it('rejects batches above the 2,000-row prototype limit', async () => {
    const { service } = createService();
    const tooManyRows = productImport('LARGE');
    tooManyRows.Options = Array.from({ length: 1997 }, () => ({}));
    const importSpy = jest.spyOn(service, 'importJson').mockResolvedValue({ valid: true } as any);

    await expect(service.importBatch(vendor, { products: [tooManyRows] as any }))
      .rejects.toMatchObject({ response: expect.objectContaining({ code: 'IMPORT_BATCH_ROW_LIMIT_EXCEEDED' }) });
    expect(importSpy).not.toHaveBeenCalled();
  });

  it('writes valid products only after every item has completed preflight', async () => {
    const { service, prisma } = createService();
    const order: string[] = [];
    jest.spyOn(service, 'importJson').mockImplementation(async (_user, dto, _key, validateOnly) => {
      const key = String(dto.Basic_Info?.[0]?.product_key);
      order.push(`${validateOnly ? 'validate' : 'save'}:${key}`);
      return validateOnly ? { valid: true } as any : { productId: `id-${key}` } as any;
    });

    const result = await service.importBatch(vendor, { products: [productImport('ONE'), productImport('TWO')] as any });

    expect(result).toMatchObject({ status: 'COMPLETED', importedCount: 2 });
    expect(order).toEqual(['validate:ONE', 'validate:TWO', 'save:ONE', 'save:TWO']);
    expect(prisma.product.findMany).toHaveBeenCalledTimes(1);
    expect(prisma.product.findFirst).toHaveBeenCalledTimes(2);
  });
});

describe('CatalogueService bulk rate update import', () => {
  const rateRow = (optionCode = 'OPT-1') => ({ productCode: 'TA-GA-0318', optionCode, validFrom: '2026-12-01', validTo: '2027-01-01', adultSellInr: '750', mrpInr: '1000' });

  function rateService() {
    const prisma: any = { product: { findMany: jest.fn().mockResolvedValue([{ id: 'p1', productCode: 'TA-GA-0318' }]) } };
    const service = new CatalogueService(prisma, {} as any, {} as any, {} as any);
    jest.spyOn(service, 'activityPricesAvailability').mockResolvedValue({ options: [{ variantId: 'v1', variantCode: 'OPT-1', ratePlans: [{ editable: true, currency: 'INR', pricingUnit: 'PER_PERSON', minPax: 1, maxPax: 20, cancellationRules: [], versions: [{ versionNumber: 4, pricingUnit: 'PER_PERSON', currency: 'INR', supplierModel: 'NET_RATE', bookingMode: 'INSTANT', supplierBaseAmount: '500', travellerPrices: [{ travellerType: 'ADULT', amount: '500' }], sourcePayload: { pricingDays: ['MON', 'TUE'], mrpMode: 'YES', mrpAmount: '1000' } }] }] }] } as any);
    const preview = jest.spyOn(service, 'previewActivityPricesAvailability').mockResolvedValue({ valid: true } as any);
    const apply = jest.spyOn(service, 'applyActivityPricesAvailability').mockResolvedValue({ saved: true } as any);
    return { service, prisma, preview, apply };
  }

  it('maps product and option codes to editable versions and previews all updates before applying', async () => {
    const { service, preview, apply } = rateService();

    const result = await service.importRateBatch(vendor, { rows: [rateRow() as any] });

    expect(result).toMatchObject({ status: 'COMPLETED', updatedProductCount: 1 });
    expect(preview).toHaveBeenCalledWith(vendor, 'p1', expect.objectContaining({ options: [expect.objectContaining({ variantId: 'v1', expectedVersion: 4, mrpMode: 'YES', mrpAmount: '1000', travellerPrices: [{ travellerType: 'ADULT', amount: '750' }] })] }));
    expect(apply).toHaveBeenCalledWith(vendor, 'p1', expect.any(Object), expect.stringMatching(/^BULK-/));
  });

  it('does not apply any rate group when preview validation finds an invalid product', async () => {
    const { service, apply, preview } = rateService();
    preview.mockResolvedValue({ valid: false, errors: ['invalid selling price'] } as any);

    await expect(service.importRateBatch(vendor, { rows: [rateRow() as any] }))
      .rejects.toMatchObject({ response: expect.objectContaining({ code: 'RATE_IMPORT_VALIDATION_FAILED' }) });
    expect(apply).not.toHaveBeenCalled();
  });

  it('rejects duplicate product-option rows before reading or saving rates', async () => {
    const { service, prisma, apply } = rateService();

    await expect(service.importRateBatch(vendor, { rows: [rateRow() as any, rateRow('opt-1') as any] }))
      .rejects.toMatchObject({ response: expect.objectContaining({ code: 'RATE_IMPORT_VALIDATION_FAILED' }) });
    expect(prisma.product.findMany).not.toHaveBeenCalled();
    expect(apply).not.toHaveBeenCalled();
  });

  it('does not interpret INR template amounts as another currency', async () => {
    const { service, apply, preview } = rateService();
    jest.spyOn(service, 'activityPricesAvailability').mockResolvedValue({ options: [{ variantId: 'v1', variantCode: 'OPT-1', ratePlans: [{ editable: true, currency: 'USD', pricingUnit: 'PER_PERSON', versions: [{ versionNumber: 1, currency: 'USD', pricingUnit: 'PER_PERSON', travellerPrices: [{ travellerType: 'ADULT', amount: '20' }], sourcePayload: {} }] }] }] } as any);

    await expect(service.importRateBatch(vendor, { rows: [rateRow() as any] }))
      .rejects.toMatchObject({ response: expect.objectContaining({ code: 'RATE_IMPORT_VALIDATION_FAILED' }) });
    expect(preview).not.toHaveBeenCalled();
    expect(apply).not.toHaveBeenCalled();
  });
});
