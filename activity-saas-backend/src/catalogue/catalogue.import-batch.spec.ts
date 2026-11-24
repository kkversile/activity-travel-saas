import { UserRole } from '@prisma/client';
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { CatalogueService } from './catalogue.service';
import { attachCatalogueTestOutletAccess } from './catalogue-test-outlet-access';

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
  const service = attachCatalogueTestOutletAccess(new CatalogueService(prisma, {} as any, {} as any, {} as any));
  return { service, prisma };
}

describe('CatalogueService batch product import', () => {
  it('locates both normalized duplicate keys with their entered values and correction before reads or writes',async()=>{
    const {service,prisma}=createService();const spy=jest.spyOn(service,'importJson');
    await expect(service.importBatch(vendor,{products:[productImport(' DUP '),productImport('dup')]} as any,true)).rejects.toMatchObject({response:{productKeys:['DUP'],products:[
      {productIndex:1,productKey:'DUP',issues:[expect.objectContaining({field:'product_key',value:'DUP',correction:expect.stringContaining('unique product_key')})]},
      {productIndex:2,productKey:'DUP',issues:[expect.objectContaining({field:'product_key',value:'dup',correction:expect.stringContaining('unique product_key')})]},
    ]}});
    expect(spy).not.toHaveBeenCalled();expect(prisma.product.findMany).not.toHaveBeenCalled();
  });
  it('locates already imported products with an actionable edit/rate-update correction',async()=>{
    const {service,prisma}=createService();prisma.product.findMany.mockResolvedValue([{sourceImportKey:'ONE',importFingerprint:null}]);const spy=jest.spyOn(service,'importJson').mockResolvedValue({valid:true} as any);
    await expect(service.importBatch(vendor,{products:[productImport('ONE')]} as any,true)).rejects.toMatchObject({response:{code:'IMPORT_BATCH_PRODUCT_ALREADY_EXISTS',products:[{productIndex:1,productKey:'ONE',issues:[expect.objectContaining({section:'Basic_Info',row:3,field:'product_key',value:'ONE',correction:expect.stringContaining('Update rates on existing products')})]}]}});
    expect(spy.mock.calls.every(call=>call[3]===true)).toBe(true);
  });
  it('rejects a single JSON import above the 2,000-row API limit', async () => {
    const { service } = createService();
    const tooManyRows = productImport('LARGE');
    tooManyRows.Options = Array.from({ length: 1997 }, () => ({}));

    await expect(service.importJson(vendor, tooManyRows as any))
      .rejects.toMatchObject({ response: expect.objectContaining({ code: 'IMPORT_ROW_LIMIT_EXCEEDED' }) });
  });

  it('validates a batch without writing drafts', async () => {
    const { service } = createService();
    const spy = jest.spyOn(service, 'importJson').mockResolvedValue({ valid: true } as any);
    await expect(service.importBatch(vendor, { products: [productImport('ONE')] as any }, true)).resolves.toMatchObject({ valid: true, productCount: 1 });
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy.mock.calls[0][3]).toBe(true);
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

  it('rejects duplicate content under different codes during preflight and saving, without writes',async()=>{
    const {service,prisma}=createService();const spy=jest.spyOn(service,'importJson').mockResolvedValue({valid:true} as any);const first=productImport('ONE'),second=productImport('TWO');second.Basic_Info[0].product_name=first.Basic_Info[0].product_name;
    for(const validate of [true,false])await expect(service.importBatch(vendor,{products:[first,second]} as any,validate)).rejects.toMatchObject({response:{code:'IMPORT_BATCH_DUPLICATE_CONTENT',products:[expect.objectContaining({productIndex:2,issues:[expect.objectContaining({field:'product_name'})]})]}});
    expect(spy.mock.calls.every(call=>call[3]===true)).toBe(true);expect(prisma.product.findMany).not.toHaveBeenCalled();
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
    const prisma: any = { product: { findMany: jest.fn().mockResolvedValue([{ id: 'p1', productCode: 'TA-GA-0318' }]) }, activityPriceApplyRequest:{findUnique:jest.fn().mockResolvedValue(null)} };
    const service = attachCatalogueTestOutletAccess(new CatalogueService(prisma, {} as any, {} as any, {} as any));
    jest.spyOn(service, 'activityPricesAvailability').mockResolvedValue({ options: [{ variantId: 'v1', variantCode: 'OPT-1', ratePlans: [{ editable: true, currency: 'INR', pricingUnit: 'PER_PERSON', minPax: 1, maxPax: 20, cancellationRules: [], versions: [{ versionNumber: 4, pricingUnit: 'PER_PERSON', currency: 'INR', supplierModel: 'NET_RATE', bookingMode: 'INSTANT', supplierBaseAmount: '500', travellerPrices: [{ travellerType: 'ADULT', amount: '500' }], sourcePayload: { pricingDays: ['MON', 'TUE'], mrpMode: 'YES', mrpAmount: '1000' } }] }] }] } as any);
    const preview = jest.spyOn(service, 'previewActivityPricesAvailability').mockResolvedValue({ valid: true } as any);
    const apply = jest.spyOn(service, 'applyActivityPricesAvailability').mockResolvedValue({ saved: true } as any);
    return { service, prisma, preview, apply };
  }

  it.each([NotFoundException, ForbiddenException])('maps outlet denial to each supplied row before cached results or writes (%s)', async (Denied) => {
    const { service, prisma, apply } = rateService();
    jest.spyOn(service, 'activityPricesAvailability').mockRejectedValue(new Denied('Private outlet details'));
    for (const validateOnly of [true, false]) {
      await expect(service.importRateBatch(vendor, { rows: [rateRow(), rateRow('OPT-2')] }, validateOnly)).rejects.toMatchObject({ response: {
        code: 'RATE_IMPORT_VALIDATION_FAILED', issues: [2, 3].map(row => expect.objectContaining({ row, field: 'productCode', value: 'TA-GA-0318', correction: expect.stringContaining('authorized') })),
      } });
    }
    expect(prisma.activityPriceApplyRequest.findUnique).not.toHaveBeenCalled();
    expect(apply).not.toHaveBeenCalled();
  });

  it('does not apply an earlier valid group when a later group belongs to another outlet', async () => {
    const { service, prisma, apply } = rateService();
    const current = await service.activityPricesAvailability(vendor, 'p1');
    prisma.product.findMany.mockResolvedValue([{ id: 'p1', productCode: 'TA-GA-0318' }, { id: 'p2', productCode: 'OTHER-OUTLET' }]);
    jest.spyOn(service, 'activityPricesAvailability').mockImplementation(async (_user, id) => { if (id === 'p2') throw new NotFoundException(); return current; });
    await expect(service.importRateBatch(vendor, { rows: [rateRow(), { ...rateRow(), productCode: 'OTHER-OUTLET' }] })).rejects.toMatchObject({ response: { issues: [expect.objectContaining({ row: 3, productCode: 'OTHER-OUTLET', field: 'productCode' })] } });
    expect(apply).not.toHaveBeenCalled();
  });

  it('rejects a public/internal product-code collision before applying or replaying either product',async()=>{
    const {service,prisma,apply}=rateService();
    prisma.product.findMany.mockResolvedValue([{id:'p1',productCode:'TA-GA-0318'},{id:'p2',productCode:'PRD-TWO'}]);
    prisma.publicIdentifier={findMany:jest.fn().mockResolvedValue([{entityId:'p2',publicCode:'TA-GA-0318'}])};
    for(const validateOnly of [true,false]) await expect(service.importRateBatch(vendor,{rows:[rateRow()]},validateOnly)).rejects.toMatchObject({response:{issues:[expect.objectContaining({row:2,field:'productCode',value:'TA-GA-0318',correction:expect.stringContaining('unambiguous')})]}});
    expect(prisma.activityPriceApplyRequest.findUnique).not.toHaveBeenCalled();expect(apply).not.toHaveBeenCalled();
  });
  it('rejects ambiguous option aliases before a cached result can bypass identifier validation',async()=>{
    const {service,prisma,apply}=rateService();
    const current:any=await service.activityPricesAvailability(vendor,'p1');current.options.push({...current.options[0],variantId:'v2',variantCode:'OTHER'});
    prisma.publicIdentifier={findMany:jest.fn().mockImplementation(async args=>args.where.entityType==='VARIANT'?[{entityId:'v2',publicCode:'OPT-1'}]:[])};
    for(const validateOnly of [true,false])await expect(service.importRateBatch(vendor,{rows:[rateRow()]},validateOnly)).rejects.toMatchObject({response:{issues:[expect.objectContaining({field:'optionCode',value:'OPT-1',correction:expect.stringContaining('unambiguous')})]}});
    expect(prisma.activityPriceApplyRequest.findUnique).not.toHaveBeenCalled();expect(apply).not.toHaveBeenCalled();
  });
  it('allows a public code equal to the internal code of the same entity',async()=>{
    const {service,prisma,apply}=rateService();prisma.publicIdentifier={findMany:jest.fn().mockImplementation(async args=>args.where.entityType==='PRODUCT'?[{entityId:'p1',publicCode:'TA-GA-0318'}]:[{entityId:'v1',publicCode:'OPT-1'}])};
    await expect(service.importRateBatch(vendor,{rows:[rateRow()]})).resolves.toMatchObject({status:'COMPLETED'});expect(apply).toHaveBeenCalledTimes(1);
  });
  it.each(['adultSellInr','childSellInr','seniorSellInr','baseSellInr','mrpInr','supplierBaseAmount'])('rejects overflowing %s for internal callers before querying or saving products',async field=>{
    const {service,prisma,apply}=rateService();
    await expect(service.importRateBatch(vendor,{rows:[{...rateRow(),[field]:'100000000000000'}]} as any)).rejects.toMatchObject({response:{issues:expect.arrayContaining([expect.objectContaining({field,correction:expect.stringContaining('99999999999999.9999')})])}});
    expect(prisma.product.findMany).not.toHaveBeenCalled();expect(apply).not.toHaveBeenCalled();
  });
  it('keeps storage diagnostics out of a failed rate group and provides retry guidance',async()=>{
    const {service,apply}=rateService();apply.mockRejectedValue(new Error('Invalid prisma write: ConnectorError secret database details'));
    const result=await service.importRateBatch(vendor,{rows:[rateRow()]});
    expect(result).toMatchObject({status:'PARTIAL',updatedProductCount:0,completedProductCodes:[],error:{code:'RATE_IMPORT_SAVE_FAILED',message:expect.stringContaining('Validate the remaining rows')}});
    expect(JSON.stringify(result)).not.toMatch(/prisma|ConnectorError|secret/);
  });

  it('replays identical rows after version numbers change without applying again',async()=>{
    const {service,prisma,apply,preview}=rateService(); const dto:any={submissionId:'600d3b8f-282c-4ea2-b193-a846e649ae82',rows:[rateRow()]};
    apply.mockImplementation(async (_user,_product,_update,_key,context:any)=>{prisma.activityPriceApplyRequest.findUnique.mockResolvedValue({productId:'p1',payloadFingerprint:context.payloadFingerprint,responsePayload:{saved:true}});return {saved:true} as any;});
    await service.importRateBatch(vendor,dto);await service.importRateBatch(vendor,dto,true);const result=await service.importRateBatch(vendor,dto);
    expect(result).toMatchObject({status:'COMPLETED',updatedProductCount:1,products:[{replayed:true}]});expect(apply).toHaveBeenCalledTimes(1);expect(preview).toHaveBeenCalledTimes(1);
    await expect(service.importRateBatch(vendor,{...dto,rows:[{...rateRow(),adultSellInr:'800'}]})).rejects.toMatchObject({response:{code:'IDEMPOTENCY_KEY_REUSED'}});
  });
  it('allows an intentional new submission of the same rate rows',async()=>{
    const {service,apply}=rateService();await service.importRateBatch(vendor,{submissionId:'600d3b8f-282c-4ea2-b193-a846e649ae82',rows:[rateRow()]});await service.importRateBatch(vendor,{submissionId:'600d3b8f-282c-4ea2-b193-a846e649ae83',rows:[rateRow()]});
    expect(apply.mock.calls[0][3]).not.toBe(apply.mock.calls[1][3]);
  });
  it.each(['baseSellInr'])('rejects incompatible %s instead of silently ignoring the entered price',async field=>{
    const {service,apply}=rateService();await expect(service.importRateBatch(vendor,{rows:[{...rateRow(),adultSellInr:undefined,[field]:'800'}]} as any)).rejects.toMatchObject({response:{issues:expect.arrayContaining([expect.objectContaining({row:2,field,correction:expect.stringContaining('adult_sell_inr')})])}});expect(apply).not.toHaveBeenCalled();
  });
  it('reports missing product with its source row, field and correction',async()=>{
    const {service,prisma,apply}=rateService();prisma.product.findMany.mockResolvedValue([]);
    await expect(service.importRateBatch(vendor,{rows:[rateRow()]})).rejects.toMatchObject({response:{issues:[expect.objectContaining({row:2,field:'productCode',optionCode:'OPT-1',correction:expect.any(String)})]}});expect(apply).not.toHaveBeenCalled();
  });
  it.each(['2026-02-30','2026-12-01T00:00:00Z'])('rejects impossible or non-date-only API values %s without reads or writes',async date=>{
    const {service,prisma,apply}=rateService();await expect(service.importRateBatch(vendor,{rows:[{...rateRow(),validFrom:date}]})).rejects.toMatchObject({response:{issues:expect.arrayContaining([expect.objectContaining({field:'validFrom'})])}});expect(prisma.product.findMany).not.toHaveBeenCalled();expect(apply).not.toHaveBeenCalled();
  });

  it('validates rates without applying any prices', async () => {
    const { service, preview, apply } = rateService();
    await expect(service.importRateBatch(vendor, { rows: [rateRow() as any] }, true)).resolves.toMatchObject({ valid: true, productCount: 1 });
    expect(preview).toHaveBeenCalledTimes(1);
    expect(apply).not.toHaveBeenCalled();
  });

  function aliases(prisma:any){
    prisma.publicIdentifier={findMany:jest.fn().mockImplementation(async({where}:any)=>where.entityType==='PRODUCT'?[{entityId:'p1',publicCode:'TA-KL-0031'}]:[{entityId:'v1',publicCode:'OPT-KL-0031'}])};
  }
  it('accepts the public product and option codes shown in the vendor interface',async()=>{
    const {service,prisma,apply}=rateService();aliases(prisma);
    const result=await service.importRateBatch(vendor,{rows:[{...rateRow(),productCode:'ta-kl-0031',optionCode:'opt-kl-0031'}]});
    expect(result).toMatchObject({status:'COMPLETED',updatedProductCount:1,completedProductCodes:['TA-KL-0031']});expect(apply).toHaveBeenCalledWith(vendor,'p1',expect.objectContaining({options:[expect.objectContaining({variantId:'v1'})]}),expect.any(String),expect.any(Object));
    expect(prisma.product.findMany.mock.calls[0][0].where).toMatchObject({tenantId:'tenant-1',deletedAt:null,OR:expect.arrayContaining([{id:{in:['p1']}}])});
    expect(prisma.publicIdentifier.findMany.mock.calls[1][0].where).toMatchObject({entityType:'VARIANT',entityId:{in:['v1']}});
  });
  it('rejects duplicate rows using different aliases for the same product option',async()=>{
    const {service,prisma,apply}=rateService();aliases(prisma);
    await expect(service.importRateBatch(vendor,{rows:[rateRow(),{...rateRow(),productCode:'TA-KL-0031',optionCode:'OPT-KL-0031'}]})).rejects.toMatchObject({response:{issues:expect.arrayContaining([expect.objectContaining({field:'optionCode',message:expect.stringContaining('aliases')})])}});expect(apply).not.toHaveBeenCalled();
  });
  it('groups distinct options under public/internal aliases into one product save and reports both source codes',async()=>{
    const {service,prisma,apply}=rateService();aliases(prisma);
    const existing:any=await service.activityPricesAvailability(vendor,'p1');existing.options.push({...existing.options[0],variantId:'v2',variantCode:'OPT-2'});jest.spyOn(service,'activityPricesAvailability').mockResolvedValue(existing);
    await expect(service.importRateBatch(vendor,{rows:[rateRow(),{...rateRow('OPT-2'),productCode:'TA-KL-0031'}]},true)).resolves.toMatchObject({valid:true,productCount:1});
    const result=await service.importRateBatch(vendor,{rows:[rateRow(),{...rateRow('OPT-2'),productCode:'TA-KL-0031'}]});
    expect(result).toMatchObject({updatedProductCount:1,completedProductCodes:['TA-GA-0318','TA-KL-0031']});expect(apply).toHaveBeenCalledTimes(1);expect(apply.mock.calls[0][2].options).toHaveLength(2);
  });
  it('does not resolve another vendor product through a global public code',async()=>{
    const {service,prisma,apply}=rateService();aliases(prisma);prisma.product.findMany.mockResolvedValue([]);
    await expect(service.importRateBatch(vendor,{rows:[{...rateRow(),productCode:'TA-KL-0031'}]})).rejects.toMatchObject({response:{code:'RATE_IMPORT_VALIDATION_FAILED'}});expect(apply).not.toHaveBeenCalled();expect(prisma.activityPriceApplyRequest.findUnique).not.toHaveBeenCalled();
  });
  it('enforces outlet authorization before looking up cached results for a public code',async()=>{
    const {service,prisma,apply}=rateService();aliases(prisma);jest.spyOn(service,'activityPricesAvailability').mockRejectedValue(new BadRequestException('Outlet not authorized'));
    await expect(service.importRateBatch(vendor,{rows:[{...rateRow(),productCode:'TA-KL-0031'}]})).rejects.toThrow('Outlet not authorized');expect(prisma.activityPriceApplyRequest.findUnique).not.toHaveBeenCalled();expect(apply).not.toHaveBeenCalled();
  });

  it('maps product and option codes to editable versions and previews all updates before applying', async () => {
    const { service, preview, apply } = rateService();

    const result = await service.importRateBatch(vendor, { rows: [rateRow() as any] });

    expect(result).toMatchObject({ status: 'COMPLETED', updatedProductCount: 1 });
    expect(preview).toHaveBeenCalledWith(vendor, 'p1', expect.objectContaining({ options: [expect.objectContaining({ variantId: 'v1', expectedVersion: 4, mrpMode: 'YES', mrpAmount: '1000', travellerPrices: [{ travellerType: 'ADULT', amount: '750' }] })] }));
    expect(apply).toHaveBeenCalledWith(vendor, 'p1', expect.any(Object), expect.stringMatching(/^BULK-/), expect.objectContaining({payloadFingerprint:expect.any(String),rows:expect.any(Map)}));
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
