// Additional regressions and browser fixtures. The runner supplies a disposable
// loopback database and disables external delivery before loading this module.
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');

module.exports = async ({ check, request, db, owner, outlet, tag, sample, parsing, XLSX, evidence, hashFinance }) => {
  const target = new URL(process.env.BULK_IMPORT_STAGING_DATABASE_URL);
  assert(target.hostname === '127.0.0.1' && target.port === '55445' && /^\/voya_import_fixes_\d+$/.test(target.pathname));
  const financeBefore = await hashFinance(), key = 'EDITOR-SIX-' + tag;
  const input = sample(key);
  input.Basic_Info[0].product_name = 'Demonstration Harbour pricing continuity ' + tag;
  for (const rate of input.Rate_Plans) { rate.valid_from = '2026-12-01'; rate.valid_to = '2027-03-01'; }
  for (const availability of input.Availability) { availability.effective_from = '2026-12-01'; availability.effective_to = '2026-12-07'; }
  const imported = await request(owner, '/products/import/json?outletId=' + outlet.id, input);
  assert.equal(imported.status, 201, JSON.stringify(imported));
  const product = await db.product.findUniqueOrThrow({ where: { id: imported.body.productId } });
  const current = await request(owner, '/products/' + product.id + '/prices-availability');
  const person = current.body.options.find(option => option.variantCode === 'SUNRISE-SHARED');
  const group = current.body.options.find(option => option.variantCode === 'PRIVATE-SPICE-WALK');
  const expectedVersion = option => Math.max(...option.ratePlans.find(plan => plan.editable).versions.map(version => version.versionNumber));
  const amounts = { ADULT: '1800', CHILD: '900', SENIOR: '1400', INFANT: '0', YOUTH: '1200.1234', GROUP: '2000' };
  const visitorPrices = Object.entries(amounts).map(([travellerType, indian]) => ({ travellerType, indian, foreign: travellerType === 'INFANT' ? '0' : travellerType === 'CHILD' ? '1500' : '2600' }));
  const common = { currency: 'INR', supplierModel: 'NET_RATE', bookingMode: 'INSTANT', effectiveFrom: '2026-12-01', effectiveTo: '2027-03-01', mrpMode: 'YES' };
  const dto = { hasDifferentialVisitorPricing: true, options: [
    { ...common, variantId: person.variantId, expectedVersion: expectedVersion(person), pricingUnit: 'PER_PERSON', supplierBaseAmount: '500', mrpAmount: '3000', travellerPrices: Object.entries(amounts).map(([travellerType, amount]) => ({ travellerType, amount })), visitorPrices, visitorEligibilityBasis: 'NATIONALITY', visitorVerificationMode: 'DOCUMENT_AT_BOOKING' },
    { ...common, variantId: group.variantId, expectedVersion: expectedVersion(group), pricingUnit: 'GROUP', supplierBaseAmount: '7200', mrpAmount: '8500' },
  ] };
  const approved = () => db.ratePlanCommercialVersion.findMany({ where: { ratePlan: { variantId: { in: [person.variantId, group.variantId] } }, status: 'ACTIVE' }, include: { travellerPrices: { orderBy: { travellerType: 'asc' } } }, orderBy: { id: 'asc' } });
  const activeBefore = await approved();
  await check('editor fixes: mixed traveller/group visitor prices preview and save without altering approved versions', async () => {
    for (const pricingUnit of ['GROUP', 'PER_BOOKING', 'PER_UNIT']) {
      const previewDto = structuredClone(dto); Object.assign(previewDto.options[1], { pricingUnit, ...(pricingUnit === 'PER_UNIT' ? { maxPassengersPerResource: 6 } : {}) });
      const preview = await request(owner, '/products/' + product.id + '/prices-availability/preview', previewDto);
      assert.equal(preview.status, 201, JSON.stringify(preview)); assert.equal(preview.body.valid, true, JSON.stringify(preview.body));
    }
    const applied = await request(owner, '/products/' + product.id + '/prices-availability/apply', dto, { 'Idempotency-Key': 'EDITOR-SIX-' + crypto.randomUUID() });
    assert.equal(applied.status, 201, JSON.stringify(applied));
    const saved = await db.ratePlanCommercialVersion.findFirstOrThrow({ where: { ratePlan: { variantId: person.variantId }, status: 'DRAFT' }, include: { travellerPrices: true }, orderBy: { versionNumber: 'desc' } });
    assert.deepEqual(Object.fromEntries(saved.travellerPrices.map(price => [price.travellerType, String(price.amount)])), amounts);
    assert.deepEqual(saved.sourcePayload.visitorPrices, visitorPrices);
    assert.deepEqual(await approved(), activeBefore);
  });
  const publicProduct = await db.publicIdentifier.findUniqueOrThrow({ where: { entityType_entityId: { entityType: 'PRODUCT', entityId: product.id } } });
  await check('editor fixes: price-only saves retain visitor policies when hidden settings are omitted', async () => {
    const state = await request(owner, '/products/' + product.id + '/prices-availability');
    const changed = structuredClone(dto);
    for (const option of changed.options) option.expectedVersion = expectedVersion(state.body.options.find(item => item.variantId === option.variantId));
    delete changed.options[0].visitorEligibilityBasis; delete changed.options[0].visitorVerificationMode;
    const result = await request(owner, '/products/' + product.id + '/prices-availability/apply', changed, { 'Idempotency-Key': 'EDITOR-HIDDEN-' + crypto.randomUUID() });
    assert.equal(result.status, 201, JSON.stringify(result));
    const saved = await db.ratePlanCommercialVersion.findFirstOrThrow({ where: { ratePlan: { variantId: person.variantId }, status: 'DRAFT' }, orderBy: { versionNumber: 'desc' } });
    assert.equal(saved.sourcePayload.visitorEligibilityBasis, 'NATIONALITY'); assert.equal(saved.sourcePayload.visitorVerificationMode, 'DOCUMENT_AT_BOOKING');
    assert.deepEqual(await approved(), activeBefore);
  });
  const rows = [
    { productCode: publicProduct.publicCode, optionCode: person.variantCode, validFrom: '2026-12-01', validTo: '2027-03-01', adultSellInr: '2000' },
    { productCode: product.productCode, optionCode: group.variantCode, validFrom: '2026-12-01', validTo: '2027-03-01', baseSellInr: '7300' },
  ];
  await check('editor fixes: server preview resolves distinct public/internal aliases to one actual product group', async () => {
    const result = await request(owner, '/products/rates/import/batch/validate?outletId=' + outlet.id, { rows });
    assert.equal(result.status, 201, JSON.stringify(result)); assert.equal(result.body.productCount, 1);
  });
  const otherProduct = await db.product.findFirstOrThrow({ where: { tenantId: owner.tenantId, outletId: { not: outlet.id }, sourceImportKey: { startsWith: 'REVIEW-' }, deletedAt: null } });
  const otherVariant = await db.productVariant.findFirstOrThrow({ where: { productId: otherProduct.id } });
  const wrongRows = [rows[0], { ...rows[0], productCode: otherProduct.productCode, optionCode: otherVariant.variantCode }];
  const headers = ['product_code', 'option_code', 'valid_from', 'valid_to', 'adult_sell_inr', 'child_sell_inr', 'senior_sell_inr', 'base_sell_inr', 'mrp_inr'];
  const fields = ['productCode', 'optionCode', 'validFrom', 'validTo', 'adultSellInr', 'childSellInr', 'seniorSellInr', 'baseSellInr', 'mrpInr'];
  const csv = values => [headers.join(','), ...values.map(row => fields.map(field => row[field] ?? '').join(','))].join('\r\n');
  const wrongCsv = csv(wrongRows).replace('\r\n', '\r\n\r\n');
  await check('editor fixes: wrong-outlet row reports its physical source cell and blocks all groups before saves', async () => {
    const counts = [await db.ratePlanCommercialVersion.count(), await db.activityPriceApplyRequest.count()];
    for (const endpoint of ['/products/rates/import/batch/validate', '/products/rates/import/batch']) {
      const result = await request(owner, endpoint + '?outletId=' + outlet.id, { rows: wrongRows, submissionId: crypto.randomUUID() });
      assert.equal(result.status, 400, JSON.stringify(result));
      const issue = result.body.issues.find(issue => issue.productCode === otherProduct.productCode);
      assert.equal(issue.row, 3); assert.equal(issue.field, 'productCode'); assert(issue.correction.includes('authorized'));
      const shown = parsing.serverImportIssues(result.body.issues, [], parsing.parseRateUpdateCsv(wrongCsv, true).rows);
      assert(shown.some(issue => issue.cell === 'A4' && issue.correction.includes('authorized')));
    }
    assert.deepEqual([await db.ratePlanCommercialVersion.count(), await db.activityPriceApplyRequest.count()], counts);
    assert.deepEqual(await approved(), activeBefore);
  });
  await check('editor fixes: impossible calendar dates do not blame valid end dates in CSV or Excel', async () => {
    const invalid = { ...rows[0], validFrom: '2027-02-30', validTo: '2027-03-01' };
    const sheet = XLSX.utils.aoa_to_sheet([headers, fields.map(field => invalid[field] ?? '')]), book = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(book, sheet, 'Rates');
    for (const parsed of [parsing.parseRateUpdateCsv(csv([invalid]), true), parsing.parseRateUpdateWorkbook(XLSX.write(book, { type: 'array', bookType: 'xlsx' }), true)]) {
      assert(parsed.issues.some(issue => issue.field === 'valid_from'));
      assert(!parsed.issues.some(issue => issue.field === 'valid_to'));
    }
    fs.writeFileSync(path.join(evidence, 'editor-calendar-error.csv'), csv([invalid]));
  });
  fs.writeFileSync(path.join(evidence, 'editor-alias-rates.csv'), csv(rows));
  fs.writeFileSync(path.join(evidence, 'editor-wrong-outlet.csv'), wrongCsv);
  fs.writeFileSync(path.join(evidence, 'editor-empty.csv'), '');
  const childRows = [{ ...rows[0], adultSellInr: undefined, childSellInr: '0' }];
  const childBook = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(childBook, XLSX.utils.aoa_to_sheet([headers, fields.map(field => childRows[0][field] ?? '')]), 'Rates');
  fs.writeFileSync(path.join(evidence, 'editor-child-zero.xlsx'), Buffer.from(XLSX.write(childBook, { type: 'buffer', bookType: 'xlsx' })));
  const editor = { productId: product.id, productCode: product.productCode, publicCode: publicProduct.publicCode, personVariantId: person.variantId, groupVariantId: group.variantId, outletId: outlet.id, email: owner.email, amounts, visitorPrices, activeBefore };
  fs.writeFileSync(path.join(evidence, 'editor-browser-fixtures.json'), JSON.stringify(editor, null, 2));
  const prefix = 'BROWSER-EDITOR-' + tag;
  function workbook(suffix) {
    const book = parsing.createSampleWorkbook();
    for (const sheet of book.SheetNames) book.Sheets[sheet] = XLSX.utils.json_to_sheet(XLSX.utils.sheet_to_json(book.Sheets[sheet], { defval: '' }).map(row => ({
      ...row, product_code: prefix + '-' + suffix,
      ...(sheet === 'Products' ? { product_name: 'Demonstration Harbour staging ' + suffix + ' ' + tag } : {}),
      ...(sheet === 'Rates' ? { valid_from: '2026-12-01', valid_to: '2027-03-01' } : {}),
      ...(sheet === 'Time slots' ? { effective_from: '2026-12-01', effective_to: '2026-12-07' } : {}),
    })));
    return book;
  }
  const bytes = book => Buffer.from(XLSX.write(book, { type: 'buffer', bookType: 'xlsx' }));
  const single = parsing.parseProductWorkbook(bytes(workbook('JSON'))); assert.deepEqual(single.issues, []);
  const model = single.models[0];
  fs.writeFileSync(path.join(evidence, 'editor-product.json'), JSON.stringify({ Basic_Info: [model.basic], Experience: [model.experience], Options: model.options, Ticket_Types: model.ticketTypes, Rate_Plans: model.ratePlans, Availability: model.availability, Media: [], Booking_Questions: [], Fulfilment: [] }, null, 2));
  const csvBook = workbook('CSV'), productCsv = XLSX.utils.sheet_to_csv(XLSX.utils.json_to_sheet(csvBook.SheetNames.flatMap(section => XLSX.utils.sheet_to_json(csvBook.Sheets[section], { defval: '' }).map(row => ({ section, ...row })))));
  assert.deepEqual(parsing.parseProductCsv(productCsv).issues, []); fs.writeFileSync(path.join(evidence, 'editor-product.csv'), productCsv);
  const first = workbook('A'), second = workbook('B');
  for (const sheet of first.SheetNames) XLSX.utils.sheet_add_json(first.Sheets[sheet], XLSX.utils.sheet_to_json(second.Sheets[sheet], { defval: '' }), { origin: -1, skipHeader: true });
  assert.equal(parsing.parseProductWorkbook(bytes(first)).models.length, 2); fs.writeFileSync(path.join(evidence, 'editor-products.xlsx'), bytes(first));
  fs.writeFileSync(path.join(evidence, 'editor-browser-session-fixtures.json'), JSON.stringify({ prefix, editor, importKeys: ['JSON', 'CSV', 'A', 'B'].map(suffix => prefix + '-' + suffix) }, null, 2));
  await check('editor fixes: all protected booking and financial hashes are unchanged', async () => assert.deepEqual(await hashFinance(), financeBefore));
};
