// Additional acceptance cases run only inside the disposable local staging harness.
const assert = require('node:assert/strict'), crypto = require('node:crypto'), fs = require('node:fs'), path = require('node:path');

module.exports = async ({ check, request, db, owner, employee, foreign, outlet, tag, sample, parsing, XLSX, evidence, hashFinance }) => {
  const target = new URL(process.env.BULK_IMPORT_STAGING_DATABASE_URL);
  assert(target.hostname === '127.0.0.1' && target.port === '55445' && /^\/voya_import_fixes_\d+$/.test(target.pathname));
  const prefix = 'EDITOR-FIVE-' + tag, beforeFinance = await hashFinance();
  const input = (key, currency = 'INR') => {
    const model = sample(key);
    model.Basic_Info[0].product_name = 'Demonstration Harbour ' + key;
    model.Basic_Info[0].currency = currency;
    for (const rate of model.Rate_Plans) Object.assign(rate, { currency, valid_from: '2026-12-01', valid_to: '2027-03-01' });
    for (const availability of model.Availability) Object.assign(availability, { effective_from: '2026-12-01', effective_to: '2026-12-07' });
    return model;
  };
  const created = await request(owner, '/products/import/json?outletId=' + outlet.id, input(prefix));
  assert.equal(created.status, 201, JSON.stringify(created));
  const productId = created.body.productId, route = '/products/' + productId + '/prices-availability';
  const read = async () => { const r = await request(owner, route); assert.equal(r.status, 200); return r.body; };
  const first = await read(), person = first.options.find(o => o.variantCode === 'SUNRISE-SHARED'), group = first.options.find(o => o.variantCode === 'PRIVATE-SPICE-WALK');
  const max = option => Math.max(...option.ratePlans.find(p => p.editable).versions.map(v => v.versionNumber));
  async function body(options) {
    const state = await read();
    return { hasDifferentialVisitorPricing: true, options: options.map(o => ({ ...o, expectedVersion: max(state.options.find(v => v.variantId === o.variantId)) })) };
  }
  async function apply(options) {
    const result = await request(owner, route + '/apply', await body(options), { 'Idempotency-Key': crypto.randomUUID() });
    assert.equal(result.status, 201, JSON.stringify(result)); return result.body;
  }
  const amounts = late => ({ ADULT: late ? '1900' : '1800', CHILD: late ? '950' : '900', SENIOR: '1400', INFANT: late ? '100' : '0', YOUTH: late ? '1300.1234' : '1200.1234', GROUP: late ? '2100' : '2000' });
  const cancellation = (days, charge) => [{ minDaysBefore: days, chargeValue: String(charge), chargeType: 'PERCENTAGE' }];
  const personOption = late => ({ variantId: person.variantId, pricingUnit: 'PER_PERSON', currency: 'INR', supplierModel: 'NET_RATE', supplierBaseAmount: '500', bookingMode: 'INSTANT',
    effectiveFrom: late ? '2027-01-01' : '2026-12-01', effectiveTo: late ? '2027-03-01' : '2027-01-01',
    pricingDays: ['MON','TUE','WED','THU','FRI','SAT','SUN'], timezone: 'Asia/Kolkata', pricingSlotCodes: [], ratePeriods: [], mrpMode: 'YES', mrpAmount: '3000',
    cancellationRules: late ? cancellation(3, 25) : cancellation(7, 0),
    travellerPrices: Object.entries(amounts(late)).map(([travellerType, amount]) => ({ travellerType, amount })),
    visitorPrices: Object.entries(amounts(late)).map(([travellerType, indian]) => ({ travellerType, indian, foreign: travellerType === 'INFANT' ? '200' : '2600' })),
    visitorEligibilityBasis: 'NATIONALITY', visitorVerificationMode: 'DOCUMENT_AT_BOOKING' });
  const groupOption = () => ({ variantId: group.variantId, pricingUnit: 'GROUP', currency: 'INR', supplierModel: 'NET_RATE', supplierBaseAmount: '7200', bookingMode: 'INSTANT',
    effectiveFrom: '2026-12-01', effectiveTo: '2027-03-01', mrpMode: 'YES', mrpAmount: '8500', cancellationRules: cancellation(0, 100),
    timezone: 'Asia/Dubai', pricingDays: ['SAT','SUN'], pricingSlotCodes: ['06:00'], ratePeriods: [{ name: 'Private weekend premium', from: '2027-02-01', to: '2027-02-15', days: 'WEEKENDS', adjustmentType: 'FLAT', adjustmentValue: '100' }] });
  const seed = async () => { await apply([personOption(false), groupOption()]); await apply([personOption(true)]); };
  const patch = (id, fields = {}) => ({ updateMode: 'PATCH', variantId: id, effectiveFrom: '2026-12-10', effectiveTo: '2027-02-01', ...fields });
  const at = (state, id, day) => state.options.find(o => o.variantId === id).ratePlans.find(p => p.editable).versions
    .filter(v => ['DRAFT','ACTIVE'].includes(v.status) && v.effectiveFrom.slice(0, 10) <= day && (!v.effectiveTo || v.effectiveTo.slice(0, 10) > day)).sort((a,b) => b.versionNumber - a.versionNumber)[0];
  const active = () => db.ratePlanCommercialVersion.findMany({ where: { ratePlan: { variantId: { in: [person.variantId, group.variantId] } }, status: 'ACTIVE' }, include: { travellerPrices: { orderBy: { travellerType: 'asc' } } }, orderBy: { id: 'asc' } });
  const approvedBefore = await active();
  await seed();

  await check('five fixes: confirmation-only edit preserves distinct option and date-specific cancellation policies', async () => {
    await apply([patch(person.variantId, { bookingMode: 'MANUAL_ON_REQUEST', confirmationSlaMinutes: 60 }), patch(group.variantId, { bookingMode: 'MANUAL_ON_REQUEST', confirmationSlaMinutes: 60 })]);
    const state = await read();
    for (const day of ['2026-12-15','2027-01-15']) {
      const v = at(state, person.variantId, day), g = at(state, group.variantId, day);
      assert.equal(v.bookingMode, 'MANUAL_ON_REQUEST'); assert.equal(v.confirmationSlaMinutes, 60);
      assert.deepEqual(v.sourcePayload.bookingRules.cancellationRules, day < '2027-01-01' ? cancellation(7, 0) : cancellation(3, 25));
      assert.deepEqual(g.sourcePayload.bookingRules.cancellationRules, cancellation(0, 100));
      assert.equal(g.sourcePayload.pricingTimezone, 'Asia/Dubai'); assert.deepEqual(g.sourcePayload.pricingSlotCodes, ['06:00']);
    }
    const plan = await db.ratePlan.findUniqueOrThrow({ where: { id: group.ratePlans.find(p => p.editable).id }, include: { cancellationRules: true } });
    assert.equal(String(plan.cancellationRules[0].chargeValue), '100');
  });
  await check('five fixes: SLA-only update does not change booking mode, prices or cancellation', async () => {
    const before = await read(); await apply([patch(person.variantId, { confirmationSlaMinutes: 90 })]);
    const after = await read();
    for (const day of ['2026-12-15','2027-01-15']) {
      const b = at(before, person.variantId, day), a = at(after, person.variantId, day);
      assert.equal(a.confirmationSlaMinutes, 90); assert.equal(a.bookingMode, b.bookingMode);
      assert.deepEqual(a.travellerPrices.map(p => [p.travellerType,p.amount]), b.travellerPrices.map(p => [p.travellerType,p.amount]));
      assert.deepEqual(a.sourcePayload.bookingRules.cancellationRules, b.sourcePayload.bookingRules.cancellationRules);
    }
  });
  await check('five fixes: cancellation-only edit preserves separate confirmation modes and SLAs', async () => {
    await apply([patch(person.variantId, { effectiveTo: '2027-01-01', bookingMode: 'VENDOR_CONFIRMATION', confirmationSlaMinutes: 120 })]);
    const before = await read(); await apply([patch(person.variantId, { cancellationRules: cancellation(2, 50) })]);
    const after = await read();
    for (const day of ['2026-12-15','2027-01-15']) {
      const b = at(before, person.variantId, day), a = at(after, person.variantId, day);
      assert.equal(a.bookingMode, b.bookingMode); assert.equal(a.confirmationSlaMinutes, b.confirmationSlaMinutes);
      assert.deepEqual(a.sourcePayload.bookingRules.cancellationRules, cancellation(2, 50));
    }
  });
  await check('five fixes: clearing a configured child price blocks preview and atomically rejects all option writes', async () => {
    const state = await read(), counts = [await db.ratePlanCommercialVersion.count(), await db.activityPriceApplyRequest.count()];
    const dto = await body([patch(group.variantId, { supplierBaseAmount: '7300' }), patch(person.variantId, { removeTravellerTypes: ['CHILD'] })]);
    const preview = await request(owner, route + '/preview', dto);
    assert.equal(preview.body.valid, false); assert(preview.body.errors.some(e => e.includes('enter 0 for free admission')));
    const result = await request(owner, route + '/apply', dto, { 'Idempotency-Key': crypto.randomUUID() }); assert.equal(result.status, 400, JSON.stringify(result));
    assert.deepEqual(await read(), state); assert.deepEqual([await db.ratePlanCommercialVersion.count(), await db.activityPriceApplyRequest.count()], counts);
  });
  await check('five fixes: zero child price retains enabled rules and passes missing-price readiness and calculation checks', async () => {
    await apply([patch(person.variantId, { effectiveFrom: '2026-12-01', effectiveTo: '2027-01-01', travellerPrices: [{ travellerType: 'CHILD', amount: '0' }] })]);
    const state = await read(), v = at(state, person.variantId, '2026-12-15');
    assert.equal(v.travellerPrices.find(p => p.travellerType === 'CHILD').amount, '0');
    const plan = await db.ratePlan.findUniqueOrThrow({ where: { id: person.ratePlans.find(p => p.editable).id }, include: { travellerRules: true } });
    assert(plan.travellerRules.some(r => r.type === 'CHILD' && r.maxCount > 0));
    const { CommercialService } = require('../dist/commercial/commercial.service');
    const { CommercialCalculatorService } = require('../dist/commercial/commercial-calculator.service');
    assert(!CommercialService.prototype.structuralReadinessReasons.call({}, plan, v, []).includes('TRAVELLER_PRICE_MISSING'));
    const quote = new CommercialCalculatorService().calculate({ ratePlanId: plan.id, serviceDate: new Date('2026-12-15'), units: 1, travellers: [{ travellerType: 'ADULT', quantity: 1 }, { travellerType: 'CHILD', quantity: 1 }] }, v, []);
    assert(!quote.reasonCodes.includes('TRAVELLER_PRICE_MISSING'));
    assert.equal(at(state, person.variantId, '2027-01-15').travellerPrices.find(p => p.travellerType === 'CHILD').amount, '950');
  });
  await check('five fixes: patch permissions remain enforced for a different tenant', async () => {
    const dto = await body([patch(person.variantId, { travellerPrices: [{ travellerType: 'ADULT', amount: '1999' }] })]);
    for (const suffix of ['/preview','/apply']) {
      const result = await request(foreign, route + suffix, dto, { 'Idempotency-Key': crypto.randomUUID() });
      assert([403,404].includes(result.status), JSON.stringify(result));
    }
  });
  await check('five fixes: USD advanced edits retain currency and mixed-currency bulk upload fails before saving INR rows', async () => {
    const result = await request(owner, '/products/import/json?outletId=' + outlet.id, input(prefix + '-USD', 'USD')); assert.equal(result.status, 201);
    const usdProduct = await db.product.findUniqueOrThrow({ where: { id: result.body.productId } });
    const usdRoute = '/products/' + usdProduct.id + '/prices-availability', usd = (await request(owner, usdRoute)).body;
    const option = usd.options.find(o => o.variantCode === 'SUNRISE-SHARED'); assert.equal(option.ratePlans[0].currency, 'USD');
    const edited = await request(owner, usdRoute + '/apply', { options: [{ ...patch(option.variantId, { travellerPrices: [{ travellerType: 'ADULT', amount: '1950' }] }), expectedVersion: max(option) }] }, { 'Idempotency-Key': crypto.randomUUID() });
    assert.equal(edited.status, 201, JSON.stringify(edited));
    const saved = (await request(owner, usdRoute)).body;
    assert.equal(at(saved, option.variantId, '2027-01-15').currency, 'USD');
    const product = await db.product.findUniqueOrThrow({ where: { id: productId } }), before = await read();
    const row = { productCode: product.productCode, optionCode: person.variantCode, validFrom: '2026-12-01', validTo: '2027-01-01', adultSellInr: '1920' };
    const rows = [row, { ...row, productCode: usdProduct.productCode }];
    const rejected = await request(owner, '/products/rates/import/batch', { submissionId: crypto.randomUUID(), rows });
    assert.equal(rejected.status, 400, JSON.stringify(rejected)); assert.deepEqual(await read(), before);
  });
  await seed();
  await check('five fixes: approved versions and all protected financial tables remain unchanged', async () => {
    assert.deepEqual(await active(), approvedBefore); assert.deepEqual(await hashFinance(), beforeFinance);
  });

  // Browser-only create fixtures use new names/codes so UI creation is verified independently.
  const browserPrefix = 'BROWSER-FIVE-' + tag;
  fs.writeFileSync(path.join(evidence, 'five-products-inr.json'), JSON.stringify(input(browserPrefix + '-INR'), null, 2));
  fs.writeFileSync(path.join(evidence, 'five-products-usd.json'), JSON.stringify(input(browserPrefix + '-USD', 'USD'), null, 2));
  const renameBook = (suffix, legacy = false) => {
    const book = parsing.createSampleWorkbook();
    if (legacy) book.Workbook = { WBProps: { date1904: true } };
    const serial = day => (Date.parse(day + 'T00:00:00Z') - Date.UTC(1904,0,1)) / 86400000;
    for (const sheet of book.SheetNames) book.Sheets[sheet] = XLSX.utils.json_to_sheet(XLSX.utils.sheet_to_json(book.Sheets[sheet], { defval: '' }).map(row => ({ ...row,
      product_code: browserPrefix + suffix,
      ...(sheet === 'Products' ? { product_name: 'Demonstration Harbour ' + suffix + ' ' + tag, duration_unit: 'hOuR' } : {}),
      ...(sheet === 'Rates' ? { valid_from: legacy ? serial('2026-12-01') : '2026-12-01', valid_to: legacy ? serial('2027-03-01') : '2027-03-01' } : {}),
      ...(sheet === 'Time slots' ? { effective_from: legacy ? serial('2026-12-01') : '2026-12-01', effective_to: legacy ? serial('2026-12-07') : '2026-12-07' } : {}),
    })));
    return book;
  };
  const book = renameBook('-XLSX-A'), second = renameBook('-XLSX-B');
  for (const sheet of book.SheetNames) book.Sheets[sheet] = XLSX.utils.json_to_sheet([...XLSX.utils.sheet_to_json(book.Sheets[sheet], { defval: '' }), ...XLSX.utils.sheet_to_json(second.Sheets[sheet], { defval: '' })]);
  fs.writeFileSync(path.join(evidence, 'five-products-two.xlsx'), Buffer.from(XLSX.write(book, { type: 'buffer', bookType: 'xlsx' })));
  fs.writeFileSync(path.join(evidence, 'five-products-legacy.xls'), Buffer.from(XLSX.write(renameBook('-XLS', true), { type: 'buffer', bookType: 'biff8' })));
  const csvBook = renameBook('-CSV');
  const productCsv = XLSX.utils.sheet_to_csv(XLSX.utils.json_to_sheet(csvBook.SheetNames.flatMap(section =>
    XLSX.utils.sheet_to_json(csvBook.Sheets[section], { defval: '' }).map(row => ({ section, ...row })))));
  assert.deepEqual(parsing.parseProductCsv(productCsv).issues, []);
  fs.writeFileSync(path.join(evidence, 'five-products.csv'), productCsv);
  fs.writeFileSync(path.join(evidence, 'five-empty.csv'), '');
  const product = await db.product.findUniqueOrThrow({ where: { id: productId } });
  const headers = ['product_code','option_code','valid_from','valid_to','adult_sell_inr','child_sell_inr','senior_sell_inr','base_sell_inr','mrp_inr'];
  const csvRows = [[product.productCode, person.variantCode,'2026-12-01','2027-01-01','1920','','','',''], [product.productCode,group.variantCode,'2026-12-01','2027-03-01','','','','7300','']];
  fs.writeFileSync(path.join(evidence, 'five-rates.csv'), [headers,...csvRows].map(r => r.join(',')).join('\r\n'));
  fs.writeFileSync(path.join(evidence, 'five-rates-invalid.csv'), [headers,csvRows[0],['MISSING-PRODUCT','OPTION','2026-12-01','2027-01-01','1900','','','','']].map(r => r.join(',')).join('\r\n'));
  fs.writeFileSync(path.join(evidence, 'five-rates-overflow.csv'), [headers,[product.productCode,person.variantCode,'2026-12-01','2027-01-01','100000000000000','','','','']].map(r => r.join(',')).join('\r\n'));
  fs.writeFileSync(path.join(evidence, 'five-rates-outlet.csv'), [headers,...csvRows].map(r => r.join(',')).join('\r\n'));
  const rateBook = XLSX.utils.book_new(); rateBook.Workbook = { WBProps: { date1904: true } };
  const serial = day => (Date.parse(day + 'T00:00:00Z') - Date.UTC(1904,0,1)) / 86400000;
  XLSX.utils.book_append_sheet(rateBook, XLSX.utils.aoa_to_sheet([headers,[product.productCode,person.variantCode,serial('2026-12-01'),serial('2027-01-01'),'','0','','','']]), 'Rates');
  fs.writeFileSync(path.join(evidence, 'five-rates-zero.xlsx'), Buffer.from(XLSX.write(rateBook, { type: 'buffer', bookType: 'xlsx' })));
  fs.writeFileSync(path.join(evidence, 'five-browser-fixtures.json'), JSON.stringify({ prefix, browserPrefix, email: owner.email, outletId: outlet.id,
    productId, productCode: product.productCode, personVariantId: person.variantId, groupVariantId: group.variantId,
    reference: { december: amounts(false), january: amounts(true), decemberCancellation: cancellation(7,0), januaryCancellation: cancellation(3,25), groupCancellation: cancellation(0,100) } }, null, 2));
};
