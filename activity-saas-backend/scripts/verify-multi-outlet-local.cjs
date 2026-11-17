/* Disposable integration/demo fixture. Refuses every database except the
 * dedicated loopback rehearsal instance. Never run against a tunnel or demo. */
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { writeFileSync, mkdirSync } = require('node:fs');
const { execFileSync } = require('node:child_process');
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');
const request = require('supertest');
const { NestFactory } = require('@nestjs/core');
const { JwtService } = require('@nestjs/jwt');
const { ValidationPipe } = require('@nestjs/common');
const { SchedulerRegistry } = require('@nestjs/schedule');

const url = new URL(process.env.DATABASE_URL || 'invalid:');
assert(url.hostname === '127.0.0.1' && url.port === '55439' && url.pathname === '/voya_outlet_baseline', 'Requires the dedicated disposable database on 127.0.0.1:55439/voya_outlet_baseline');
process.env.JWT_SECRET = 'local-outlet-isolation-verification-secret-20261117';
process.env.SMTP_HOST = ''; process.env.SMTP_USER = ''; process.env.SMTP_PASSWORD = '';
process.env.SECRET_ENCRYPTION_KEY = '12'.repeat(32);
const { AppModule } = require('../dist/app.module');
const { FinanceService } = require('../dist/finance/finance.service');
const { VendorOutletsService } = require('../dist/vendor-outlets/vendor-outlets.service');
const { ensurePublicIdentifier, PublicEntity } = require('../dist/common/public-identifiers');
const { encryptSecret } = require('../dist/common/secret-crypto');
const prisma = new PrismaClient();
const checks = [];
let app;
async function check(name, fn) { await fn(); checks.push(name); console.log('PASS ' + name); }

async function main() {
  const passwordHash = await bcrypt.hash('LocalOutlet@123', 10);
  const vendor = await prisma.tenant.upsert({ where: { slug: 'abc-adventures-outlet-local' }, update: {}, create: { slug: 'abc-adventures-outlet-local', name: 'ABC Adventures', kind: 'VENDOR' } });
  await prisma.vendorOnboardingApplication.upsert({ where: { tenantId: vendor.id }, update: { status: 'APPROVED' }, create: { tenantId: vendor.id, status: 'APPROVED', currentStep: 8, businessDisplayName: 'ABC Adventures', legalBusinessName: 'ABC Adventures' } });
  const other = await prisma.tenant.upsert({ where: { slug: 'separate-legal-entity-local' }, update: {}, create: { slug: 'separate-legal-entity-local', name: 'Separate Legal Entity', kind: 'VENDOR' } });
  await prisma.publicIdentifier.updateMany({ where: { entityType: PublicEntity.VENDOR, entityId: vendor.id, publicCode: 'VEN-LOCAL-ABC' }, data: { publicCode: 'SUP-9901' } });
  await ensurePublicIdentifier(prisma, PublicEntity.VENDOR, vendor.id, 'SUP-9901');
  await prisma.vendorProfile.upsert({ where: { tenantId: vendor.id }, update: {}, create: { tenantId: vendor.id, legalBusinessName: 'ABC Adventures', operatingCity: 'Munnar', operatingRegion: 'Kerala', voucherShortCode: 'ABCL', verificationStatus: 'VERIFIED', readinessScore: 100 } });
  async function user(email, role, organizationRole, tenantId = vendor.id) {
    return prisma.user.upsert({ where: { email }, update: { passwordHash, active: true, organizationRole }, create: { email, role, organizationRole, tenantId, passwordHash, fullName: email.split('@')[0] } });
  }
  const owner = await user('owner@abc.local', 'VENDOR', 'OWNER');
  const admin = await user('maker@platform.local', 'SUPER_ADMIN', null, null);
  const checker = await user('checker@platform.local', 'SUPER_ADMIN', null, null);
  const legacy = await prisma.product.upsert({ where: { tenantId_productCode: { tenantId: vendor.id, productCode: 'LEGACY' } }, update: {}, create: { tenantId: vendor.id, productCode: 'LEGACY' } });
  // Apply and repeat the actual backfill, asserting idempotency rather than
  // reproducing its algorithm in a test.
  const backfill = () => execFileSync(process.execPath, [require.resolve('tsx/cli'), 'scripts/backfill-multi-outlet.ts', '--apply'], { env: process.env, encoding: 'utf8' });
  console.log(backfill());
  const counts = async () => Promise.all([prisma.vendorOutlet.count(), prisma.userOutletAccess.count(), prisma.product.count()]);
  const before = await counts(); console.log(backfill()); assert.deepEqual(await counts(), before);
  assert((await prisma.product.findUnique({ where: { id: legacy.id } })).outletId);
  await check('pre-migration legacy IDs, amounts, ledger snapshots and grants survive expansion', async () => {
    const booking = await prisma.booking.findUniqueOrThrow({ where: { id: '11111111-1111-4111-a111-111111111114' } });
    const event = await prisma.financialEvent.findUniqueOrThrow({ where: { id: '11111111-1111-4111-a111-111111111115' } });
    const payout = await prisma.payout.findUniqueOrThrow({ where: { id: '11111111-1111-4111-a111-111111111116' } });
    assert.equal(booking.bookingCode, 'LEGACY-PRESERVE'); assert.equal(booking.amount.toString(), '1234.56'); assert(booking.outletId);
    assert.equal(event.vendorAmount.toString(), '1000.01'); assert.deepEqual(event.components, { immutableEconomics: true }); assert.equal(event.outletId, booking.outletId);
    assert.equal(payout.status, 'PAID'); assert.equal(payout.amount.toString(), '1000.01'); assert.equal(payout.bankAccountId,null);
    assert.equal(await prisma.userOutletAccess.count({ where: { userId: '11111111-1111-4111-a111-111111111112', active: true } }),1);
  });
  checks.push('default outlet backfill twice preserves counts and legacy attribution');
  const mainOutlet = await prisma.vendorOutlet.findFirst({ where: { tenantId: vendor.id, isDefault: true } });
  if (mainOutlet.outletCode === 'MAIN') await prisma.vendorOutlet.update({ where: { id: mainOutlet.id }, data: { outletCode: 'A', name: 'Outlet A' } });
  const outlets = [];
  for (const code of ['A', 'B', 'C', 'D']) outlets.push(await prisma.vendorOutlet.upsert({ where: { tenantId_outletCode: { tenantId: vendor.id, outletCode: code } }, update: { status: 'ACTIVE' }, create: { tenantId: vendor.id, outletCode: code, name: `Outlet ${code}` } }));
  const employee = await user('a@abc.local', 'VENDOR', 'CATALOGUE');
  const ops = await user('operations-a@abc.local', 'VENDOR', 'OPERATIONS');
  const multi = await user('ac@abc.local', 'VENDOR', 'OPERATIONS');
  await prisma.userOutletAccess.updateMany({ where: { userId: { in: [employee.id, ops.id, multi.id] } }, data: { active: false } });
  for (const [member, list] of [[employee, [outlets[0]]], [ops, [outlets[0]]], [multi, [outlets[0], outlets[2]]]]) for (const outlet of list) await prisma.userOutletAccess.upsert({ where: { userId_outletId: { userId: member.id, outletId: outlet.id } }, update: { active: true }, create: { tenantId: vendor.id, userId: member.id, outletId: outlet.id } });
  const products = [], bookings = [], resources = [], schedules = [], sessions = [];
  for (const outlet of outlets) {
    const product = await prisma.product.upsert({ where: { tenantId_productCode: { tenantId: vendor.id, productCode: `ABC-${outlet.outletCode}` } }, update: {}, create: { tenantId: vendor.id, outletId: outlet.id, productCode: `ABC-${outlet.outletCode}` } }); products.push(product);
    const revision = await prisma.productRevision.upsert({ where: { productId_versionNumber: { productId: product.id, versionNumber: 1 } }, update: {}, create: { productId: product.id, versionNumber: 1, productName: `ABC Adventures ${outlet.name}`, type: 'ACTIVITY', subType: 'TOUR', description: 'Illustrative local outlet excursion', cityName: 'Munnar', stateName: 'Kerala', countryName: 'India', createdById: owner.id } });
    await prisma.product.update({ where: { id: product.id }, data: { currentRevisionId: revision.id } });
    const variant = await prisma.productVariant.upsert({ where: { productId_revisionId_variantCode: { productId: product.id, revisionId: revision.id, variantCode: 'STANDARD' } }, update: {}, create: { productId: product.id, revisionId: revision.id, variantCode: 'STANDARD', name: 'Standard excursion' } });
    const rate = await prisma.ratePlan.upsert({ where: { variantId_ratePlanCode: { variantId: variant.id, ratePlanCode: 'STANDARD' } }, update: {}, create: { variantId: variant.id, ratePlanCode: 'STANDARD', name: 'Standard rate', validFrom: new Date('2026-01-01'), validTo: new Date('2028-01-01') } });
    const commercial = await prisma.ratePlanCommercialVersion.upsert({ where: { ratePlanId_versionNumber: { ratePlanId: rate.id, versionNumber: 1 } }, update: {}, create: { ratePlanId: rate.id, versionNumber: 1, effectiveFrom: new Date('2026-01-01'), createdById: owner.id, supplierModel: 'NET_RATE', pricingUnit: 'PER_PERSON', bookingMode: 'INSTANT', supplierBaseAmount: 1000 } });
    const schedule = await prisma.scheduleTemplate.upsert({ where: { variantId_scheduleCode: { variantId: variant.id, scheduleCode: 'DAILY' } }, update: {}, create: { variantId: variant.id, scheduleCode: 'DAILY', name: 'Daily capacity', timezone: 'Asia/Kolkata', effectiveFrom: new Date('2026-01-01'), capacityUnit: 'PERSON', operatingModel: 'DATE_CAPACITY', operatingDays: ['MON','TUE','WED','THU','FRI','SAT','SUN'], defaultCapacity: 10, status: 'ACTIVE' } }); schedules.push(schedule);
    const serviceDate = new Date(new Date().toISOString().slice(0,10));
    const session = await prisma.serviceSession.upsert({ where: { scheduleTemplateId_serviceDate_sessionKey: { scheduleTemplateId: schedule.id, serviceDate, sessionKey: 'DAILY' } }, update: {}, create: { scheduleTemplateId: schedule.id, serviceDate, sessionKey: 'DAILY', status: 'OPEN' } }); sessions.push(session);
    await prisma.inventoryState.upsert({ where: { sessionId: session.id }, update: {}, create: { sessionId: session.id, totalCapacity: 10 } });
    const booking = await prisma.booking.upsert({ where: { bookingCode: `ABC-LOCAL-${outlet.outletCode}` }, update: {}, create: { productId: product.id, vendorTenantId: vendor.id, outletId: outlet.id, bookingCode: `ABC-LOCAL-${outlet.outletCode}`, channel: 'VOYA_AGENT', serviceDate: new Date(), pax: 1, amount: 1000, customerName: 'Illustrative visitor', status: 'CONFIRMED', confirmedAt: new Date(Date.now() - 86400000) } }); bookings.push(booking);
    await prisma.bookingEconomicsSnapshot.upsert({ where: { bookingId: booking.id }, update: {}, create: { bookingId: booking.id, ratePlanCommercialVersionId: commercial.id, currency: 'INR', pricingUnit: 'PER_PERSON', supplierCommercialModel: 'NET_RATE', supplierGrossBasis: 1000, supplierCommission: 0, vendorPayable: 1000, voyaRevenue: 0, agentFacingAmount: 1000, agentCommission: 0, taxMode: 'NONE', taxAmount: 0, taxContext: {}, promotionAmount: 0, promotionContext: {}, focAmount: 0, focContext: {}, finalAmount: 1000, commercialEligibility: {}, calculationInputs: {}, calculationOutputs: {}, ruleTrace: [] } });
    resources.push(await prisma.resource.upsert({ where: { tenantId_outletId_resourceCode: { tenantId: vendor.id, outletId: outlet.id, resourceCode: 'BOAT' } }, update: {}, create: { tenantId: vendor.id, outletId: outlet.id, resourceCode: 'BOAT', name: `Boat ${outlet.outletCode}`, type: 'VEHICLE', allocationMode: 'EXCLUSIVE' } }));
    await prisma.financialEvent.upsert({ where: { eventKey: `local:${booking.id}:confirmed` }, update: {}, create: { eventKey: `local:${booking.id}:confirmed`, bookingId: booking.id, vendorTenantId: vendor.id, outletId: outlet.id, type: 'BOOKING_CONFIRMED', status: 'POSTED', currency: 'INR', amount: 1000, vendorAmount: 1000, components: {}, occurredAt: new Date(Date.now() - 86400000) } });
  }
  app = await NestFactory.create(AppModule, { logger: ['error'] });
  app.use((req, res, next) => new (require('../dist/common/correlation-id.middleware').CorrelationIdMiddleware)(app.get(require('../dist/common/request-context.service').RequestContextService)).use(req, res, next));
  app.setGlobalPrefix('api'); app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true })); await app.init();
  for (const name of app.get(SchedulerRegistry).getCronJobs().keys()) app.get(SchedulerRegistry).deleteCronJob(name);
  const jwt = app.get(JwtService);
  const token = (u) => jwt.sign({ sub: u.id, email: u.email, role: u.role, tenantId: u.tenantId, organizationRole: u.organizationRole });
  const api = (u, method, path) => request(app.getHttpServer())[method]('/api' + path).set('Authorization', 'Bearer ' + token(u));
  const actor = (u) => ({ sub: u.id, role: u.role, tenantId: u.tenantId, organizationRole: u.organizationRole, email: u.email });
  await check('legacy single-outlet finance login retains historical paid payout access', async () => {
    // The original fixture represents a finance employee. Update older local
    // rehearsal versions of this fixture to that functional role only.
    const legacyFinance = await prisma.user.update({ where: { id: '11111111-1111-4111-a111-111111111112' }, data: { organizationRole: 'FINANCE' } });
    const settlements = await api(legacyFinance, 'get', '/settlements').expect(200);
    assert(settlements.body.legacyPayouts.some((payout) => payout.id === '11111111-1111-4111-a111-111111111116' && Number(payout.amount) === 1000.01));
  });
  await check('owner can aggregate and employee sees only assigned outlets', async () => {
    const all = await api(owner, 'get', '/vendor/outlets').expect(200); assert(all.body.outlets.length >= 4);
    const assigned = await api(employee, 'get', '/vendor/outlets').expect(200); assert.deepEqual(assigned.body.outlets.map((o) => o.id), [outlets[0].id]);
    await api(multi, 'get', '/vendor/bookings').expect(400);
    await api(multi, 'get', `/vendor/bookings?outletId=${outlets[2].id}`).expect(200);
    await api(multi, 'get', `/products/${products[2].id}?outletId=${outlets[0].id}`).expect(404);
  });
  await check('A cannot list B resources or read/confirm/export B bookings', async () => {
    await api(employee, 'get', `/resources?outletId=${outlets[1].id}`).expect(404);
    await api(employee, 'get', `/vendor/bookings/${bookings[1].id}`).expect(404);
    await api(ops, 'post', `/vendor/bookings/${bookings[1].id}/confirm`).expect(404);
    await prisma.bookingFulfilment.upsert({ where: { bookingId: bookings[1].id }, update: {}, create: { bookingId: bookings[1].id, mode: Object.values(require('@prisma/client').FulfilmentMode)[0] } });
    await api(ops, 'post', `/vendor/fulfilment/${bookings[1].id}/evidence/pnr`).send({ referenceValue: 'UNAUTHORIZED' }).expect(404);
    const exportResponse = await api(employee, 'get', `/vendor/bookings/export.csv?outletId=${outlets[1].id}`); assert([403,404].includes(exportResponse.status));
  });
  await check('A cannot mutate B product revisions or guessed resource IDs', async () => {
    await api(ops, 'patch', `/resources/${resources[1].id}`).send({ name: 'Unauthorized', expectedVersion: 1 }).expect(404);
    await api(employee, 'get', `/products/${products[1].id}`).expect(404);
  });
  await check('A cannot read or mutate B commercial pricing, private files, or reviews', async () => {
    const variant = await prisma.productVariant.findFirst({ where: { productId: products[1].id } });
    const plan = await prisma.ratePlan.findFirst({ where: { variantId: variant.id } });
    const version = await prisma.ratePlanCommercialVersion.findFirst({ where: { ratePlanId: plan.id } });
    await api(employee, 'get', `/rate-plans/${plan.id}/commercial`).expect(404);
    await api(employee, 'patch', `/rate-plan-commercial-versions/${version.id}`).send({ supplierBaseAmount: '1' }).expect(404);
    const revision = await prisma.productRevision.findFirst({ where: { productId: products[1].id } });
    await api(employee, 'patch', `/product-revisions/${revision.id}`).send({ description: 'Unauthorized' }).expect(404);
    const file = await prisma.fileAsset.create({ data: { tenantId: vendor.id, visibility: 'PRIVATE', purpose: 'OTHER', entityType: 'ProductRateProof', entityId: revision.id, storageKey: `never-read-cross-outlet-${randomUUID()}`, originalName: 'proof.pdf', mimeType: 'application/pdf', sizeBytes: 1 } });
    await api(employee, 'get', `/files/${file.id}/content`).expect(404);
    const review = await prisma.vendorReview.create({ data: { tenantId: vendor.id, productId: products[1].id, source: 'LOCAL', sourceReviewId: randomUUID(), rating: 5, reviewedAt: new Date(), status: 'PUBLISHED' } });
    await api(employee, 'patch', `/vendor/reviews/${review.id}/reply`).send({ vendorReply: 'Unauthorized' }).expect(404);
    const reviews = await api(employee, 'get', '/vendor/reviews').expect(200); assert(!reviews.body.some((row) => row.productId === products[1].id));
  });
  await check('selected query scope drives resource creation and inventory preview/apply', async () => {
    const created = await api(multi, 'post', `/resources?outletId=${outlets[2].id}`).send({ resourceCode: `GUIDE-${randomUUID().slice(0,8)}`, name: 'Illustrative local guide', type: 'GUIDE', allocationMode: 'EXCLUSIVE' }).expect(201); assert.equal(created.body.outletId, outlets[2].id);
    const date = sessions[2].serviceDate.toISOString().slice(0,10);
    const data = { scheduleTemplateId: schedules[2].id, dateFrom: date, dateTo: date, proposal: { newTotalCapacity: 12 } };
    await api(multi, 'post', `/inventory/bulk/preview?outletId=${outlets[0].id}`).send(data).expect(404);
    const preview = await api(multi, 'post', `/inventory/bulk/preview?outletId=${outlets[2].id}`).send(data).expect(201); assert.equal(preview.body.affected.length,1);
    await api(multi, 'post', `/inventory/bulk/apply?outletId=${outlets[2].id}`).send({ scheduleTemplateId: schedules[2].id, rows: preview.body.affected.map((row) => ({ sessionId: row.sessionId, expectedInventoryVersion: row.inventoryVersion, newTotalCapacity: 12 })) }).expect(201);
    assert.equal((await prisma.inventoryState.findUnique({ where: { sessionId: sessions[2].id } })).totalCapacity,12);
  });
  await check('owner access controls expose checked grants and revoke/regrant through APIs', async () => {
    const team = await api(owner, 'get', '/vendor/team').expect(200);
    const member = team.body.members.find((row) => row.id === employee.id);
    assert(member.outletAccess.some((grant) => grant.outletId === outlets[0].id && grant.active === true));
    await api(owner, 'put', `/vendor/outlets/${outlets[0].id}/members/${employee.id}`).send({ active: false }).expect(200);
    await api(employee, 'get', '/vendor/bookings').expect(403);
    const revoked = await api(owner, 'get', '/vendor/team').expect(200);
    assert(!revoked.body.members.find((row) => row.id === employee.id).outletAccess.some((grant) => grant.outletId === outlets[0].id));
    await api(owner, 'put', `/vendor/outlets/${outlets[0].id}/members/${employee.id}`).send({ active: true }).expect(200);
    await api(employee, 'get', '/vendor/bookings').expect(200);
  });
  await check('live membership revocation overrides previously signed JWT', async () => {
    await prisma.userOutletAccess.updateMany({ where: { userId: employee.id }, data: { active: false } });
    await api(employee, 'get', '/vendor/bookings').expect(403);
    await prisma.userOutletAccess.updateMany({ where: { userId: employee.id, outletId: outlets[0].id }, data: { active: true } });
  });
  await check('invitation acceptance commits requested grants and cannot self-upgrade', async () => {
    const email = `invited-${randomUUID()}@abc.local`;
    const invite = await api(owner, 'post', '/vendor/team/invitations').send({ email, role: 'OPERATIONS', outletIds: [outlets[0].id, outlets[2].id] }).expect(201);
    const accepted = await request(app.getHttpServer()).post('/api/auth/register').send({ email, fullName: 'Invited operator', password: 'LocalOutlet@123', acceptedTerms: true, teamInviteToken: invite.body.inviteToken, organizationRole: 'OWNER', outletIds: [outlets[1].id] }).expect(201);
    const saved = await prisma.user.findUnique({ where: { email }, include: { outletAccess: true } });
    assert.equal(saved.organizationRole, 'OPERATIONS'); assert.deepEqual(saved.outletAccess.map((g) => g.outletId).sort(), [outlets[0].id, outlets[2].id].sort());
    await request(app.getHttpServer()).post('/api/auth/register').send({ email, fullName: 'Replay', password: 'LocalOutlet@123', acceptedTerms: true, teamInviteToken: invite.body.inviteToken }).expect(409);
  });
  const outletService = app.get(VendorOutletsService);
  const banks = [];
  for (const code of ['X', 'Y']) {
    let bank = await prisma.vendorBankAccount.findFirst({ where: { tenantId: vendor.id, bankName: `Illustrative Bank ${code}` } });
    if (!bank) bank = await prisma.vendorBankAccount.create({ data: { tenantId: vendor.id, bankName: `Illustrative Bank ${code}`, accountHolder: 'ABC Adventures', accountNumberCiphertext: encryptSecret(`000000000${code === 'X' ? '111' : '222'}`), accountNumberMasked: `•••• ${code === 'X' ? '0111' : '0222'}`, ifsc: 'HDFC0001234', accountType: 'CURRENT', verificationStatus: 'PENDING' } });
    const { PDFDocument, StandardFonts } = require('pdf-lib'); const pdf = await PDFDocument.create(); const page = pdf.addPage(); const font = await pdf.embedFont(StandardFonts.Helvetica); page.drawText('DEMONSTRATION MATERIAL - NOT A REAL BANK ACCOUNT', { x: 25, y: 750, size: 12, font });
    const storage = app.get(require('../dist/storage/storage.service').StorageService); const saved = await storage.save(Buffer.from(await pdf.save()), 'VENDOR_DOCUMENT', '.pdf');
    const doc = await prisma.vendorDocument.upsert({ where: { tenantId_type: { tenantId: vendor.id, type: 'BANK_PROOF' } }, update: {}, create: { tenantId: vendor.id, type: 'BANK_PROOF' } });
    const proof = await prisma.fileAsset.create({ data: { tenantId: vendor.id, storageKey: saved.storageKey, originalName: `illustrative-bank-${code}.pdf`, mimeType: 'application/pdf', sizeBytes: saved.sizeBytes, visibility: 'PRIVATE', purpose: 'VENDOR_DOCUMENT', entityType: 'VendorDocument', entityId: doc.id } });
    await prisma.vendorBankAccount.update({ where: { id: bank.id }, data: { proofDocumentId: proof.id } });
    await outletService.reviewBankAccount(actor(admin), bank.id, { status: 'VERIFIED', note: 'Disposable local demonstration evidence; illustrative account only, no real verification or transfer.' }); banks.push(bank);
  }
  await check('bank proof upload creates a pending account without exposing account secrets', async () => {
    const { PDFDocument, StandardFonts } = require('pdf-lib'); const pdf = await PDFDocument.create(); const font = await pdf.embedFont(StandardFonts.Helvetica); pdf.addPage().drawText('DEMONSTRATION MATERIAL - NOT A REAL BANK ACCOUNT', { x: 25, y: 750, size: 12, font });
    const proof = await api(owner, 'post', '/vendor/documents/bankProof').attach('file', Buffer.from(await pdf.save()), { filename: 'illustrative-bank-proof.pdf', contentType: 'application/pdf' }).expect(201);
    assert(proof.body.fileAssetId);
    const pending = await api(owner, 'post', '/vendor/bank-accounts').send({ bankName: 'Illustrative Bank Z', accountHolder: 'ABC Adventures', accountNumber: '000000000333', ifsc: 'HDFC0001234', accountType: 'CURRENT', proofDocumentId: proof.body.fileAssetId }).expect(201);
    assert.equal(pending.body.verificationStatus, 'PENDING'); assert(!JSON.stringify(pending.body).includes('000000000333')); assert(!('accountNumberCiphertext' in pending.body));
    await api(owner, 'patch', `/vendor/outlets/${outlets[0].id}/bank-account`).send({ bankAccountId: pending.body.id }).expect(400);
  });
  await check('shared verified bank assignment and cross-tenant rejection', async () => {
    for (let i=0; i<4; i++) await outletService.assignBank(actor(owner), outlets[i].id, { bankAccountId: banks[i%2].id });
    const foreign = await prisma.vendorOutlet.findFirst({ where: { tenantId: other.id } });
    await assert.rejects(() => outletService.assignBank(actor(owner), foreign.id, { bankAccountId: banks[0].id }));
  });
  await prisma.financeConfiguration.upsert({ where: { id: 'default' }, update: { paymentCollectionMode: 'VOYA_COLLECTS' }, create: { paymentCollectionMode: 'VOYA_COLLECTS' } });
  await prisma.vendorSettlementPolicy.upsert({ where: { vendorTenantId: vendor.id }, update: { active: true, reviewRequired: false, eligibilityTrigger: 'BOOKING_CONFIRMED' }, create: { vendorTenantId: vendor.id, active: true, reviewRequired: false, eligibilityTrigger: 'BOOKING_CONFIRMED' } });
  const finance = app.get(FinanceService);
  const batches=[];
  await check('different outlets settle separately in same week with shared banks', async () => {
    for (const outlet of outlets) {
      const existing = await prisma.settlementBatch.findFirst({ where: { vendorTenantId: vendor.id, outletId: outlet.id }, include: { payout: true } });
      if (existing) { batches.push(existing); continue; }
      const preview = await finance.preview(actor(admin), { vendorTenantId: vendor.id, outletId: outlet.id, currency: 'INR' });
      const dto = { vendorTenantId: vendor.id, outletId: outlet.id, currency: 'INR', expectedPreviewFingerprint: preview.previewFingerprint };
      if (outlet.id === outlets[0].id) {
        const attempts = await Promise.allSettled([finance.createBatch(actor(admin), dto), finance.createBatch(actor(admin), dto)]);
        assert.equal(attempts.filter((r) => r.status === 'fulfilled').length, 1);
        batches.push(attempts.find((r) => r.status === 'fulfilled').value);
        checks.push('concurrent initial A settlement creates one weekly payout');
      } else batches.push(await finance.createBatch(actor(admin), dto));
    }
    const payouts = await prisma.payout.findMany({ where: { tenantId: vendor.id, outletId: { in: outlets.map((o) => o.id) } } });
    assert.equal(payouts.length,4); assert.equal(new Set(payouts.map((p) => p.bankAccountId)).size,2); assert.equal(new Set(payouts.map((p) => p.outletId)).size,4);
  });
  await check('bank reassignment preserves issued payout snapshot and revoked bank blocks release', async () => {
    const payout = await prisma.payout.findFirst({ where: { tenantId: vendor.id, outletId: outlets[0].id } }); const snapshot = payout.beneficiarySnapshot;
    await outletService.assignBank(actor(owner), outlets[0].id, { bankAccountId: banks[1].id });
    assert.deepEqual((await prisma.payout.findUnique({ where: { id: payout.id } })).beneficiarySnapshot, snapshot);
    await prisma.vendorBankAccount.update({ where: { id: payout.bankAccountId }, data: { verificationStatus: 'REJECTED' } });
    await assert.rejects(() => finance.requestRelease(actor(admin), payout.id, { externalReference: 'illustrative-only' }), /BANK_ACCOUNT_NOT_VERIFIED/);
    await prisma.vendorBankAccount.update({ where: { id: payout.bankAccountId }, data: { verificationStatus: 'VERIFIED' } });
    await outletService.assignBank(actor(owner), outlets[0].id, { bankAccountId: banks[0].id });
  });
  await check('deactivation preserves existing booking history', async () => {
    await outletService.update(actor(owner), outlets[0].id, { status: 'INACTIVE' });
    await api(employee, 'get', '/vendor/bookings').expect(200);
    await prisma.booking.update({ where: { id: bookings[0].id }, data: { recordType: 'CANONICAL', status: 'REDEEMED' } });
    await api(ops, 'post', `/vendor/manifest/bookings/${bookings[0].id}/complete`).send({ reason: 'Illustrative existing obligation completed after outlet deactivation.' }).expect(201);
    assert.equal((await prisma.booking.findUnique({ where: { id: bookings[0].id } })).status, 'COMPLETED');
    await outletService.update(actor(owner), outlets[0].id, { status: 'ACTIVE' });
    const defaults = await prisma.vendorOutlet.count({ where: { tenantId: vendor.id, isDefault: true } }); assert.equal(defaults,1);
  });
  await check('cancellation liability keeps outlet attribution and reduces future settlement', async () => {
    const booking = bookings[3];
    const cancellation = await prisma.bookingCancellation.upsert({ where: { bookingId: booking.id }, update: {}, create: { bookingId: booking.id, initiator: 'ADMIN', reasonCategory: 'OTHER', reason: 'Illustrative cancellation', cancelledAt: new Date(), serviceTimezone: 'Asia/Kolkata', serviceDateLocal: '2026-11-17', cancellationDateLocal: '2026-11-17', daysBeforeService: 0, bookingAmount: 1000, currency: 'INR', cancellationCharge: 0, refundEntitlement: 1000, financialState: 'REFUNDED', calculationSnapshot: {} } });
    await finance.resolveCancellation(actor(admin), cancellation.id, { finalVendorPayable: '0', reason: 'Illustrative local cancellation', reference: 'LOCAL-CANCELLATION' });
    const event = await prisma.financialEvent.findUnique({ where: { eventKey: `cancellation-vendor-adjustment:${cancellation.id}` } });
    assert.equal(event.outletId, outlets[3].id); assert.equal(event.vendorAmount.toString(), '-1000');
    const preview = await finance.preview(actor(admin), { vendorTenantId: vendor.id, outletId: outlets[3].id, currency: 'INR' });
    assert(preview.eligibleLines.some((line) => line.sourceEventIds.includes(event.id))); assert.equal(preview.totals.netPayable, '-1000');
    assert.equal((await prisma.bookingEconomicsSnapshot.findUnique({ where: { bookingId: booking.id } })).vendorPayable.toString(), '1000');
  });
  await check('bank revocation between maker request and checker approval blocks release', async () => {
    const payout = await prisma.payout.findFirst({ where: { tenantId: vendor.id, outletId: outlets[1].id } });
    let pending = await prisma.payoutReleaseApprovalRequest.findFirst({ where: { payoutId: payout.id, status: 'PENDING' } });
    if (!pending) pending = await finance.requestRelease(actor(admin), payout.id, { externalReference: 'LOCAL-ILLUSTRATIVE-NO-TRANSFER' });
    await outletService.reviewBankAccount(actor(admin), payout.bankAccountId, { status: 'REJECTED', note: 'Illustrative revocation for release isolation verification.' });
    await assert.rejects(() => finance.approveRelease(actor(checker), pending.id), /BANK_ACCOUNT_NOT_VERIFIED/);
    assert.equal((await prisma.payout.findUnique({ where: { id: payout.id } })).status, 'READY_TO_RELEASE');
    await outletService.reviewBankAccount(actor(admin), payout.bankAccountId, { status: 'VERIFIED', note: 'Disposable illustrative account restored after negative verification check; no real bank verification or transfer.' });
  });
  await check('concurrent deactivation retains exactly one active/default outlet', async () => {
    const foreignOwner = await user('owner@separate.local', 'VENDOR', 'OWNER', other.id);
    const first = await prisma.vendorOutlet.findUnique({ where: { tenantId_outletCode: { tenantId: other.id, outletCode: 'MAIN' } } });
    await prisma.vendorOutlet.updateMany({ where: { tenantId: other.id }, data: { isDefault: false } });
    await prisma.vendorOutlet.update({ where: { id: first.id }, data: { isDefault: true } });
    const second = await prisma.vendorOutlet.upsert({ where: { tenantId_outletCode: { tenantId: other.id, outletCode: 'SECOND' } }, update: { status: 'ACTIVE' }, create: { tenantId: other.id, outletCode: 'SECOND', name: 'Second' } });
    await prisma.vendorOutlet.update({ where: { id: first.id }, data: { status: 'ACTIVE' } });
    await prisma.vendorOutlet.updateMany({ where: { tenantId: other.id, id: { notIn: [first.id, second.id] } }, data: { status: 'INACTIVE', isDefault: false } });
    const attempts = await Promise.allSettled([outletService.update(actor(foreignOwner), first.id, { status: 'INACTIVE' }), outletService.update(actor(foreignOwner), second.id, { status: 'INACTIVE' })]);
    assert.equal(attempts.filter((r) => r.status === 'fulfilled').length,1);
    assert.equal(await prisma.vendorOutlet.count({ where: { tenantId: other.id, status: 'ACTIVE' } }),1);
    assert.equal(await prisma.vendorOutlet.count({ where: { tenantId: other.id, isDefault: true } }),1);
  });
  await check('two concurrent same-outlet batch requests preserve one weekly payout', async () => {
    const outlet = await prisma.vendorOutlet.create({ data: { tenantId: other.id, outletCode: `RACE-${randomUUID().slice(0,8)}`, name: 'Concurrent settlement verification' } });
    await ensurePublicIdentifier(prisma, PublicEntity.VENDOR, other.id, 'SUP-9902');
    const doc = await prisma.vendorDocument.upsert({ where: { tenantId_type: { tenantId: other.id, type: 'BANK_PROOF' } }, update: {}, create: { tenantId: other.id, type: 'BANK_PROOF' } });
    const { PDFDocument } = require('pdf-lib'); const pdf = await PDFDocument.create(); pdf.addPage().drawText('DEMONSTRATION MATERIAL - CONCURRENCY FIXTURE'); const saved = await app.get(require('../dist/storage/storage.service').StorageService).save(Buffer.from(await pdf.save()), 'VENDOR_DOCUMENT', '.pdf');
    const proof = await prisma.fileAsset.create({ data: { tenantId: other.id, storageKey: saved.storageKey, originalName: 'illustrative-proof.pdf', mimeType: 'application/pdf', sizeBytes: saved.sizeBytes, visibility: 'PRIVATE', purpose: 'VENDOR_DOCUMENT', entityType: 'VendorDocument', entityId: doc.id } });
    const bank = await prisma.vendorBankAccount.create({ data: { tenantId: other.id, accountNumberCiphertext: encryptSecret('000000000444'), accountNumberMasked: '•••• 0444', bankName: 'Illustrative Concurrency Bank', accountHolder: 'Separate Legal Entity', accountType: 'CURRENT', ifsc: 'HDFC0001234', proofDocumentId: proof.id } });
    await outletService.reviewBankAccount(actor(admin), bank.id, { status: 'VERIFIED', note: 'Disposable concurrency fixture; illustrative verification only, no transfer.' });
    const foreignOwner = await user('owner@separate.local', 'VENDOR', 'OWNER', other.id);
    await outletService.assignBank(actor(foreignOwner), outlet.id, { bankAccountId: bank.id });
    await prisma.vendorSettlementPolicy.upsert({ where: { vendorTenantId: other.id }, update: { active: true, reviewRequired: false }, create: { vendorTenantId: other.id, active: true, reviewRequired: false } });
    await finance.adjustment(actor(admin), { vendorTenantId: other.id, outletId: outlet.id, currency: 'INR', signedAmount: '100', reason: 'Disposable concurrency fixture', reference: 'LOCAL-CONCURRENT-ONLY' });
    const preview = await finance.preview(actor(admin), { vendorTenantId: other.id, outletId: outlet.id, currency: 'INR' });
    const dto = { vendorTenantId: other.id, outletId: outlet.id, currency: 'INR', expectedPreviewFingerprint: preview.previewFingerprint };
    const results = await Promise.allSettled([finance.createBatch(actor(admin), dto), finance.createBatch(actor(admin), dto)]);
    assert.equal(results.filter((r) => r.status === 'fulfilled').length,1);
    assert.equal(await prisma.payout.count({ where: { tenantId: other.id, outletId: outlet.id, recordType: 'CANONICAL' } }),1);
    mkdirSync('../docs/multi-outlet-evidence', { recursive: true });
    writeFileSync('../docs/multi-outlet-evidence/concurrency-proof.json', JSON.stringify({ checkedAt: new Date(), results: results.map((r) => ({ status: r.status, rejection: r.status === 'rejected' ? r.reason.message : undefined })), payoutCount: 1, outletId: outlet.id }, null, 2));
  });
  mkdirSync('../docs/multi-outlet-evidence', { recursive: true });
  writeFileSync('../docs/multi-outlet-evidence/local-integration.json', JSON.stringify({ checkedAt: new Date(), checks, vendorId: vendor.id, outlets: outlets.map((o)=>({id:o.id,name:o.name})), bookings:bookings.map((b)=>({id:b.id,code:b.bookingCode})), ownerEmail: owner.email, employeeEmail: employee.email, password: 'LocalOutlet@123', database: '127.0.0.1:55439/voya_outlet_baseline', note: 'All accounts, documents and settlements are illustrative local records. No real transfers.' }, null, 2));
}
main().catch((error) => { console.error(error); process.exitCode=1; }).finally(async () => { if (app && !process.argv.includes('--serve')) await app.close(); await prisma.$disconnect(); if (app && process.argv.includes('--serve') && !process.exitCode) { await app.listen(4007, '127.0.0.1'); console.log('Local outlet demo API: http://127.0.0.1:4007/api'); } });
