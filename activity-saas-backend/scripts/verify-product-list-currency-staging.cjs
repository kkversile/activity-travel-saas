// Invoked only by the guarded disposable-local-database staging harness.
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path');

module.exports = async ({ check, request, db, owner, employee, foreign, outlet, tag, sample, evidence, hashFinance }) => {
  const target = new URL(process.env.BULK_IMPORT_STAGING_DATABASE_URL);
  assert(target.hostname === '127.0.0.1' && target.port === '55445' && target.username === 'voya_staging' && /^\/voya_import_fixes_\d+$/.test(target.pathname));
  const before = await hashFinance(), prefix = 'LIST-CURRENCY-' + tag, products = {};
  for (const suffix of ['USD', 'INR', 'MIXED', 'ZERO']) {
    const fixture = sample(prefix + '-' + suffix);
    fixture.Basic_Info[0].product_name = 'Demonstration currency ' + suffix + ' ' + tag;
    for (const row of fixture.Rate_Plans) Object.assign(row, { currency: suffix === 'INR' ? 'INR' : 'USD', valid_from: '2026-12-01', valid_to: '2027-03-01' });
    const shared = fixture.Rate_Plans.find(row => row.option_code === 'SUNRISE-SHARED');
    Object.assign(shared, suffix === 'INR' ? { adult_price: 1800, child_price: 900, senior_price: 1400 } : { adult_price: 175.5, child_price: suffix === 'ZERO' ? 0 : 90.25, senior_price: 140 });
    if (suffix === 'MIXED') fixture.Rate_Plans.push({ ...shared, rate_plan_code: 'RP-SHARED-INR', rate_plan_name: 'Shared INR rate', currency: 'INR', adult_price: 1800, child_price: 900, senior_price: 1400 });
    for (const row of fixture.Availability) Object.assign(row, { effective_from: '2026-12-01', effective_to: '2026-12-07', materialize: false });
    const created = await request(owner, '/products/import/json?outletId=' + outlet.id, fixture);
    assert.equal(created.status, 201, JSON.stringify(created));
    const product = await db.product.findUniqueOrThrow({ where: { id: created.body.productId } });
    assert.equal(product.status, 'DRAFT');
    products[suffix] = { id: product.id, name: fixture.Basic_Info[0].product_name, sourceImportKey: product.sourceImportKey };
  }
  const state = async () => db.$transaction(async tx => {
    await tx.$executeRawUnsafe('SET TRANSACTION READ ONLY');
    const result = {};
    for (const table of ['Product', 'ProductRevision', 'ProductVariant', 'RatePlan', 'RatePlanCommercialVersion', 'RatePlanTravellerPrice']) result[table] = (await tx.$queryRawUnsafe(`SELECT count(*)::int AS rows,md5(coalesce(string_agg(to_jsonb(t)::text,E'\\n' ORDER BY to_jsonb(t)::text),'')) AS hash FROM "${table}" t`))[0];
    return result;
  });
  const catalogueBefore = await state();
  const list = async (actor, search = prefix, outletId = outlet.id) => {
    const response = await request(actor, '/products/listing?limit=100&search=' + encodeURIComponent(search) + '&outletId=' + outletId);
    assert.equal(response.status, 200, JSON.stringify(response));
    return response.body.items;
  };
  // Search uses product names; the source key is deliberately not a listing filter.
  const items = await list(owner, 'Demonstration currency');
  const row = suffix => items.find(item => item.id === products[suffix].id);
  await check('list currency: USD minimum carries USD from its commercial version', async () => {
    assert.equal(row('USD').startingPrice, 90.25); assert.equal(row('USD').startingPriceCurrency, 'USD');
    assert.deepEqual(row('USD').startingPrices, [{ currency: 'USD', amount: 90.25 }]);
  });
  await check('list currency: INR retains its existing minimum and currency', async () => {
    assert.equal(row('INR').startingPrice, 900); assert.equal(row('INR').startingPriceCurrency, 'INR');
    assert.deepEqual(row('INR').startingPrices, [{ currency: 'INR', amount: 900 }]);
  });
  await check('list currency: mixed currencies keep separate minima without a false common minimum', async () => {
    assert.equal(row('MIXED').startingPrice, null); assert.equal(row('MIXED').startingPriceCurrency, null);
    assert.deepEqual(row('MIXED').startingPrices, [{ currency: 'INR', amount: 900 }, { currency: 'USD', amount: 90.25 }]);
  });
  await check('list currency: free child price is zero USD rather than missing or INR', async () => {
    assert.equal(row('ZERO').startingPrice, 0); assert.equal(row('ZERO').startingPriceCurrency, 'USD');
    assert.deepEqual(row('ZERO').startingPrices, [{ currency: 'USD', amount: 0 }]);
  });
  await check('list currency: search and authorized outlet employee preserve currency projection', async () => {
    const found = await list(employee, products.USD.name);
    assert.equal(found.length, 1); assert.equal(found[0].id, products.USD.id); assert.equal(found[0].startingPriceCurrency, 'USD');
    products.USD.productCode = found[0].productCode;
    const byCode = await list(owner, found[0].productCode);
    assert.equal(byCode.length, 1); assert.equal(byCode[0].id, products.USD.id); assert.equal(byCode[0].startingPrice, 90.25);
  });
  await check('list currency: another tenant cannot list the currency fixtures', async () => {
    const response = await request(foreign, '/products/listing?search=' + encodeURIComponent(products.USD.name));
    assert.equal(response.status, 200); assert.equal(response.body.items.length, 0);
  });
  await check('list currency: repeated reads leave catalogue and finance unchanged', async () => {
    assert.deepEqual(await state(), catalogueBefore); assert.deepEqual(await hashFinance(), before);
  });
  fs.writeFileSync(path.join(evidence, 'currency-browser-fixtures.json'), JSON.stringify({ outletId: outlet.id, products, items: Object.fromEntries(Object.keys(products).map(suffix => [suffix, row(suffix)])), catalogueBefore, financeBefore: before }, null, 2));
};
