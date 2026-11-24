// Runs only inside the guarded disposable PostgreSQL/NestJS staging harness.
const assert = require('node:assert/strict'), crypto = require('node:crypto'), fs = require('node:fs'), path = require('node:path');

module.exports = async ({ check, request, db, owner, employee, foreign, outlet, tag, sample, parsing, XLSX, evidence, hashFinance }) => {
  const target = new URL(process.env.BULK_IMPORT_STAGING_DATABASE_URL);
  assert(target.hostname === '127.0.0.1' && target.port === '55445' && /^\/voya_import_fixes_\d+$/.test(target.pathname));
  const beforeFinance = await hashFinance(), prefix = 'EDITOR-FOUR-' + tag;
  const input = sample(prefix + '-API'); input.Basic_Info[0].product_name = 'Demonstration Harbour segmented pricing ' + tag;
  for (const rate of input.Rate_Plans) Object.assign(rate, { valid_from: '2026-12-01', valid_to: '2027-03-01' });
  for (const availability of input.Availability) Object.assign(availability, { effective_from: '2026-12-01', effective_to: '2026-12-07' });
  const imported = await request(owner, '/products/import/json?outletId=' + outlet.id, input); assert.equal(imported.status, 201, JSON.stringify(imported));
  const productId = imported.body.productId, route = '/products/' + productId + '/prices-availability';
  const read = async () => { const result = await request(owner, route); assert.equal(result.status, 200); return result.body; };
  const initial = await read(), person = initial.options.find(option => option.variantCode === 'SUNRISE-SHARED'), group = initial.options.find(option => option.variantCode === 'PRIVATE-SPICE-WALK');
  const expected = option => Math.max(...option.ratePlans.find(plan => plan.editable).versions.map(version => version.versionNumber));
  const active = () => db.ratePlanCommercialVersion.findMany({ where: { ratePlan: { variantId: { in: [person.variantId, group.variantId] } }, status: 'ACTIVE' }, include: { travellerPrices: { orderBy: { travellerType: 'asc' } } }, orderBy: { id: 'asc' } });
  const approvedBefore = await active();
  const days = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'];
  const amounts = late => ({ ADULT: late ? '1900' : '1800', CHILD: late ? '950' : '900', SENIOR: '1400', INFANT: late ? '100' : '0', YOUTH: late ? '1300.1234' : '1200.1234', GROUP: late ? '2100' : '2000' });
  const personOption = late => ({ variantId: person.variantId, pricingUnit: 'PER_PERSON', effectiveFrom: late ? '2027-01-01' : '2026-12-01', effectiveTo: late ? '2027-03-01' : '2027-01-01', currency: 'INR', supplierModel: 'NET_RATE', supplierBaseAmount: '500', bookingMode: 'INSTANT', timezone: 'Asia/Kolkata', pricingDays: days, pricingSlotCodes: [], ratePeriods: [], mrpMode: 'YES', mrpAmount: '3000',
    travellerPrices: Object.entries(amounts(late)).map(([travellerType, amount]) => ({ travellerType, amount })),
    visitorPrices: Object.entries(amounts(late)).map(([travellerType, indian]) => ({ travellerType, indian, foreign: travellerType === 'INFANT' ? '200' : '2600' })), visitorEligibilityBasis: 'NATIONALITY', visitorVerificationMode: 'DOCUMENT_AT_BOOKING' });
  const groupRules = { pricingDays: ['SAT', 'SUN'], pricingTimezone: 'Asia/Dubai', pricingSlotCodes: ['06:00'], ratePeriods: [{ name: 'Private weekend premium', from: '2027-02-01', to: '2027-02-15', days: 'WEEKENDS', adjustmentType: 'FLAT', adjustmentValue: '100' }] };
  const groupOption = { variantId: group.variantId, pricingUnit: 'GROUP', effectiveFrom: '2026-12-01', effectiveTo: '2027-03-01', currency: 'INR', supplierModel: 'NET_RATE', supplierBaseAmount: '7200', mrpMode: 'YES', mrpAmount: '8500', bookingMode: 'INSTANT', timezone: groupRules.pricingTimezone, pricingDays: groupRules.pricingDays, pricingSlotCodes: groupRules.pricingSlotCodes, ratePeriods: groupRules.ratePeriods };
  async function apply(options, root = {}) {
    const state = await read(); for (const option of options) option.expectedVersion = expected(state.options.find(saved => saved.variantId === option.variantId));
    const dto = { hasDifferentialVisitorPricing: true, ...root, options }, result = await request(owner, route + '/apply', dto, { 'Idempotency-Key': crypto.randomUUID() });
    assert.equal(result.status, 201, JSON.stringify(result)); return { result, dto };
  }
  const seed = async () => { await apply([personOption(false), structuredClone(groupOption)]); await apply([personOption(true)]); };
  await seed();
  function at(state, id, day) { return state.options.find(option => option.variantId === id).ratePlans.find(plan => plan.editable).versions.filter(version => ['DRAFT', 'ACTIVE'].includes(version.status) && version.effectiveFrom.slice(0, 10) <= day && (!version.effectiveTo || version.effectiveTo.slice(0, 10) > day)).sort((a, b) => b.versionNumber - a.versionNumber)[0]; }
  const prices = version => Object.fromEntries(version.travellerPrices.map(price => [price.travellerType, String(price.amount)]));
  const patch = (id, fields = {}) => ({ updateMode: 'PATCH', variantId: id, effectiveFrom: '2026-12-10', effectiveTo: '2027-02-01', ...fields });

  await check('four fixes: multi-option save retains distinct calendar, timezone, slot and seasonal rules', async () => {
    await apply([patch(person.variantId, { travellerPrices: [{ travellerType: 'ADULT', amount: '1950' }] }), patch(group.variantId)]);
    const state = await read();
    for (const day of ['2026-12-15', '2027-01-15']) { const payload = at(state, group.variantId, day).sourcePayload; for (const [key, value] of Object.entries(groupRules)) assert.deepEqual(payload[key], value); }
    assert.deepEqual(await active(), approvedBefore);
  });
  await check('four fixes: adult-only patch retains every period-specific hidden traveller and visitor price', async () => {
    const state = await read();
    for (const [day, late] of [['2026-12-15', false], ['2027-01-15', true]]) {
      const version = at(state, person.variantId, day); assert.deepEqual(prices(version), { ...amounts(late), ADULT: '1950' });
      assert.equal(version.sourcePayload.visitorPrices.find(price => price.travellerType === 'INFANT').indian, late ? '100' : '0');
      assert.equal(version.sourcePayload.visitorPrices.find(price => price.travellerType === 'ADULT').indian, '1950');
      assert.equal(version.sourcePayload.visitorEligibilityBasis, 'NATIONALITY'); assert.equal(version.sourcePayload.visitorVerificationMode, 'DOCUMENT_AT_BOOKING');
    }
    assert.equal(prices(at(state, person.variantId, '2026-12-05')).ADULT, '1800'); assert.equal(prices(at(state, person.variantId, '2027-02-15')).ADULT, '1900');
  });
  await check('four fixes: repeated no-price save preserves segmented prices and all traveller rules', async () => {
    const before = await read(), travellerRules = await db.travellerRule.findMany({ where: { ratePlan: { variantId: person.variantId } }, orderBy: { type: 'asc' } });
    await apply([patch(person.variantId)]); const state = await read();
    for (const day of ['2026-12-05', '2026-12-15', '2027-01-15', '2027-02-15']) assert.deepEqual(prices(at(state, person.variantId, day)), prices(at(before, person.variantId, day)));
    assert.deepEqual(await db.travellerRule.findMany({ where: { ratePlan: { variantId: person.variantId } }, orderBy: { type: 'asc' } }), travellerRules);
  });
  await check('four fixes: explicit shared overrides can clear selected slots and seasonal adjustments', async () => {
    await apply([patch(group.variantId, { timezone: 'UTC', pricingDays: ['FRI'], pricingSlotCodes: [], ratePeriods: [] })]);
    const payload = at(await read(), group.variantId, '2027-01-15').sourcePayload;
    assert.deepEqual([payload.pricingTimezone, payload.pricingDays, payload.pricingSlotCodes, payload.ratePeriods], ['UTC', ['FRI'], [], []]);
  });
  await check('four fixes: invalid inherited MRP rolls back every option and request-cache write', async () => {
    const state = await read(), before = [await db.ratePlanCommercialVersion.count(), await db.activityPriceApplyRequest.count()];
    const options = [patch(group.variantId, { supplierBaseAmount: '7300' }), patch(person.variantId, { travellerPrices: [{ travellerType: 'ADULT', amount: '3001' }] })];
    options.forEach(option => option.expectedVersion = expected(state.options.find(saved => saved.variantId === option.variantId)));
    const dto = { hasDifferentialVisitorPricing: true, options }, preview = await request(owner, route + '/preview', dto); assert.equal(preview.body.valid, false);
    const result = await request(owner, route + '/apply', dto, { 'Idempotency-Key': crypto.randomUUID() }); assert.equal(result.status, 400, JSON.stringify(result));
    assert.deepEqual(await read(), state); assert.deepEqual([await db.ratePlanCommercialVersion.count(), await db.activityPriceApplyRequest.count()], before);
  });
  await check('four fixes: stale edits conflict while identical patch retries remain idempotent', async () => {
    const { dto } = await apply([patch(person.variantId, { travellerPrices: [{ travellerType: 'ADULT', amount: '1960' }] })]);
    const stale = await request(owner, route + '/apply', dto, { 'Idempotency-Key': crypto.randomUUID() }); assert.equal(stale.status, 409);
    const state = await read(); dto.options[0].expectedVersion = expected(state.options.find(option => option.variantId === person.variantId));
    const key = crypto.randomUUID(), first = await request(owner, route + '/apply', dto, { 'Idempotency-Key': key }), count = await db.ratePlanCommercialVersion.count();
    const retry = await request(owner, route + '/apply', dto, { 'Idempotency-Key': key }); assert.equal(first.status, 201); assert.equal(retry.status, 201); assert.deepEqual(retry.body, first.body); assert.equal(await db.ratePlanCommercialVersion.count(), count);
  });
  await check('four fixes: foreign tenant owner cannot patch this draft', async () => {
    const state = await read(), dto = { options: [patch(person.variantId, { expectedVersion: expected(state.options.find(option => option.variantId === person.variantId)) })] };
    // The foreign owner belongs to another tenant. The outlet employee is
    // checked against a different, unauthorized outlet by the main harness.
    const result = await request(foreign, route + '/apply', dto, { 'Idempotency-Key': crypto.randomUUID() }); assert([403, 404].includes(result.status));
  });
  await check('four fixes: untouched legacy Indian visitor amounts are preserved in an adult-only patch', async () => {
    const setup = personOption(false); setup.visitorPrices.find(price => price.travellerType === 'CHILD').indian = '880';
    await apply([setup]); await apply([patch(person.variantId, { effectiveTo: '2026-12-20', travellerPrices: [{ travellerType: 'ADULT', amount: '1950' }] })]);
    const version = at(await read(), person.variantId, '2026-12-15');
    assert.equal(version.sourcePayload.visitorPrices.find(price => price.travellerType === 'CHILD').indian, '880');
    assert.equal(prices(version).CHILD, '900');
  });
  await check('four fixes: zero group price validates and persists without altering approved prices', async () => {
    await apply([patch(group.variantId, { supplierBaseAmount: '0' })]);
    assert.equal(String(at(await read(), group.variantId, '2027-01-15').supplierBaseAmount), '0');
    assert.deepEqual(await active(), approvedBefore);
  });
  await seed();
  await check('four fixes: approved prices and protected financial hashes remain unchanged', async () => { assert.deepEqual(await active(), approvedBefore); assert.deepEqual(await hashFinance(), beforeFinance); });

  // Independent browser cases use this restored new draft and fresh imports.
  const product = await db.product.findUniqueOrThrow({ where: { id: productId } });
  const metadata = { prefix, productId, productCode: product.productCode, personVariantId: person.variantId, groupVariantId: group.variantId, outletId: outlet.id, email: owner.email, groupRules, amounts: { december: amounts(false), january: amounts(true) } };
  fs.writeFileSync(path.join(evidence, 'four-browser-fixtures.json'), JSON.stringify(metadata, null, 2));
  const book = parsing.createSampleWorkbook(); book.Workbook = { WBProps: { date1904: true } };
  const serial = date => (Date.parse(date + 'T00:00:00Z') - Date.UTC(1904, 0, 1)) / 86400000;
  for (const sheet of book.SheetNames) book.Sheets[sheet] = XLSX.utils.json_to_sheet(XLSX.utils.sheet_to_json(book.Sheets[sheet], { defval: '' }).map(row => ({ ...row, product_code: prefix + '-XLS', ...(sheet === 'Products' ? { product_name: 'Demonstration legacy Harbour ' + tag, duration_unit: 'hOuR' } : {}), ...(sheet === 'Rates' ? { valid_from: serial('2026-12-01'), valid_to: serial('2027-03-01') } : {}), ...(sheet === 'Time slots' ? { effective_from: serial('2026-12-01'), effective_to: serial('2026-12-07') } : {}) })));
  fs.writeFileSync(path.join(evidence, 'four-legacy-1904.xls'), Buffer.from(XLSX.write(book, { type: 'buffer', bookType: 'biff8' })));
  const headers = ['product_code', 'option_code', 'valid_from', 'valid_to', 'adult_sell_inr', 'child_sell_inr', 'senior_sell_inr', 'base_sell_inr', 'mrp_inr'];
  const rows = [[product.productCode, person.variantCode, '2026-12-01', '2027-01-01', '1850.4321', '', '', '', ''], [product.productCode, group.variantCode, '2026-12-01', '2027-03-01', '', '', '', '7300', '']];
  fs.writeFileSync(path.join(evidence, 'four-rates.csv'), [headers, ...rows].map(row => row.join(',')).join('\r\n'));
  const rateBook = XLSX.utils.book_new(); rateBook.Workbook = { WBProps: { date1904: true } };
  XLSX.utils.book_append_sheet(rateBook, XLSX.utils.aoa_to_sheet([headers, [product.productCode, person.variantCode, serial('2026-12-01'), serial('2027-01-01'), '', '0', '', '', '']]), 'Rates');
  fs.writeFileSync(path.join(evidence, 'four-rates-1904.xlsx'), Buffer.from(XLSX.write(rateBook, { type: 'buffer', bookType: 'xlsx' })));
};
