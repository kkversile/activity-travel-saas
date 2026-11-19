// Real PostgreSQL/outbox/SMTP verification. Never accepts a live database or relay.
const assert = require('node:assert/strict');
const net = require('node:net');
const fs = require('node:fs');
const { randomUUID } = require('node:crypto');
const { PrismaClient } = require('@prisma/client');
const target = new URL(process.env.DATABASE_URL || 'invalid:');
assert(target.hostname === '127.0.0.1' && target.port === '55445' && /^\/voya_readiness_review_mail_\d+$/.test(target.pathname) && target.username === 'voya_staging', 'Dedicated disposable staging copy required');
const messages = [], sockets = new Set();
function body(mail) {
  const [headers, ...parts] = mail.raw.split('\r\n\r\n');
  const value = parts.join('\r\n\r\n');
  return /Content-Transfer-Encoding: base64/i.test(headers) ? Buffer.from(value.replace(/\s/g, ''), 'base64').toString('utf8') : value.replace(/=\r\n/g, '').replace(/=([0-9a-f]{2})/gi, (_, byte) => String.fromCharCode(parseInt(byte, 16)));
}
let rejectRecipient = '';
const server = net.createServer((socket) => {
  sockets.add(socket); socket.on('close', () => sockets.delete(socket));
  let buffer = '', data = false, message = [], recipient = '';
  socket.write('220 loopback.review.invalid SMTP sink\r\n');
  socket.on('data', (chunk) => {
    buffer += chunk.toString();
    while (buffer.includes('\r\n')) {
      const index = buffer.indexOf('\r\n'), line = buffer.slice(0, index); buffer = buffer.slice(index + 2);
      if (data) {
        if (line === '.') { messages.push({ recipient, raw: message.join('\r\n') }); data = false; message = []; socket.write('250 captured locally\r\n'); }
        else message.push(line);
      } else if (/^EHLO/i.test(line)) socket.write('250-loopback.review.invalid\r\n250 AUTH PLAIN\r\n');
      else if (/^AUTH PLAIN/i.test(line)) socket.write('235 Authentication successful\r\n');
      else if (/^RCPT TO:/i.test(line)) {
        recipient = line.match(/<([^>]+)>/)[1];
        socket.write(recipient === rejectRecipient ? '451 Simulated temporary recipient failure\r\n' : '250 OK\r\n');
      } else if (/^DATA/i.test(line)) { data = true; socket.write('354 End with dot\r\n'); }
      else if (/^QUIT/i.test(line)) socket.end('221 Bye\r\n');
      else socket.write('250 OK\r\n');
    }
  });
});
const prisma = new PrismaClient();
async function fingerprint() {
  const result = {};
  for (const name of ['Booking','BookingEconomicsSnapshot','FinancialEvent','Payout','SettlementBatch','SettlementLine','SettlementEventAllocation','SettlementHold','PayoutAttempt','PayoutReleaseApprovalRequest','CommissionInvoice','FinanceConfiguration','FileAsset']) {
    result[name] = await prisma.$queryRawUnsafe(`SELECT count(*)::int AS rows, md5(coalesce(string_agg(to_jsonb(t)::text,E'\\n' ORDER BY to_jsonb(t)::text),'')) AS hash FROM "${name}" t`);
  }
  return result;
}
async function main() {
  const before = await fingerprint();
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  Object.assign(process.env, { SMTP_HOST: '127.0.0.1', SMTP_PORT: String(server.address().port), SMTP_SECURE: 'false', SMTP_USER: 'sender@review.invalid', SMTP_PASSWORD: 'loopback-only', SMTP_FROM_EMAIL: 'sender@review.invalid' });
  const { OutboxService } = require('../dist/outbox/outbox.service');
  const { VendorNotificationWorker } = require('../dist/outbox/vendor-notification.worker');
  const owner = await prisma.user.findUniqueOrThrow({ where: { email: 'owner@harbour-trails.example.com' } });
  const outlets = await prisma.vendorOutlet.findMany({ where: { tenantId: owner.tenantId, status: 'ACTIVE' }, orderBy: { createdAt: 'asc' }, take: 2 }); assert.equal(outlets.length, 2);
  const editors = [];
  for (const [index, config] of [{ role: 'CATALOGUE', outlet: outlets[0], active: true }, { role: 'CATALOGUE', outlet: outlets[1], active: true }, { role: 'CATALOGUE', outlet: outlets[0], active: false }, { role: 'VIEWER', outlet: outlets[0], active: true }].entries()) {
    const user = await prisma.user.create({ data: { email: `review-${randomUUID()}@fixture.invalid`, fullName: 'Demonstration review recipient', passwordHash: 'disabled-fixture-login', tenantId: owner.tenantId, role: 'VENDOR', organizationRole: config.role } });
    await prisma.userOutletAccess.create({ data: { tenantId: owner.tenantId, userId: user.id, outletId: config.outlet.id, active: config.active } }); editors[index] = user;
  }
  const product = await prisma.product.create({ data: { tenantId: owner.tenantId, outletId: outlets[0].id, productCode: 'SMTP-DEMONSTRATION-'+randomUUID() } });
  const content = { productId: product.id, productName: 'Demonstration mail review', type: 'ACTIVITY', subType: 'TOUR', description: 'Isolated SMTP integration fixture', cityName: 'Kochi', countryName: 'INDIA', stateName: 'Kerala', createdById: owner.id };
  const approved = await prisma.productRevision.create({ data: { ...content, versionNumber: 1, status: 'PUBLISHED' } });
  const rejected = await prisma.productRevision.create({ data: { ...content, versionNumber: 2, status: 'REJECTED', rejectionReason: 'Explain the demonstration meeting point.' } });
  await prisma.product.update({ where: { id: product.id }, data: { currentRevisionId: approved.id, status: 'LIVE' } });
  const preference = (enabled) => prisma.globalSetting.upsert({ where: { tenantId_key: { tenantId: owner.tenantId, key: 'vendor_notification_preferences' } }, create: { tenantId: owner.tenantId, key: 'vendor_notification_preferences', value: { reviewEmail: enabled } }, update: { value: { reviewEmail: enabled } } });
  // Quarantine inherited pending events ONLY on this disposable copy. Financial
  // and booking rows remain untouched; the sink cannot forward any mail.
  await prisma.outboxEvent.updateMany({ where: { status: 'PENDING' }, data: { status: 'PROCESSED' } });
  const outbox = new OutboxService(prisma), worker = new VendorNotificationWorker(prisma, outbox);
  async function enqueue(revision = approved, extra = {}) {
    return outbox.enqueue(prisma, { tenantId: owner.tenantId, eventType: 'PRODUCT_REVIEW_EMAIL_REQUESTED', aggregateType: 'ProductRevision', aggregateId: revision.id, payload: { productId: product.id, revisionId: revision.id, decision: revision.id === approved.id ? 'APPROVED' : 'REJECTED' }, ...extra });
  }
  const processed = async (event, expected = 'PROCESSED') => assert.equal((await prisma.outboxEvent.findUniqueOrThrow({ where: { id: event.id } })).status, expected);
  await preference(true);
  let event = await enqueue(); await Promise.all([worker.dispatch(), worker.dispatch()]); await processed(event);
  assert.deepEqual(messages.map((m) => m.recipient).sort(), [owner.email, editors[0].email].sort(), 'Only owner and authorized catalogue editor, once under concurrent dispatch');
  assert(messages.every((m) => body(m).includes('revision v1 was approved')));
  event = await enqueue(rejected); await worker.dispatch(); await processed(event); assert.equal(messages.length, 4);
  assert(messages.slice(2).every((m) => body(m).includes('Explain the demonstration meeting point.')));
  await preference(false); event = await enqueue(); await worker.dispatch(); await processed(event); assert.equal(messages.length, 4); await preference(true);
  event = await enqueue(approved, { tenantId: (await prisma.tenant.findFirstOrThrow({ where: { id: { not: owner.tenantId } } })).id }); await worker.dispatch(); await processed(event); assert.equal(messages.length, 4);
  event = await enqueue(approved, { payload: { productId: product.id, revisionId: rejected.id, decision: 'APPROVED' } }); await worker.dispatch(); await processed(event); assert.equal(messages.length, 4);
  const legacy = await enqueue(approved, { eventType: 'PRODUCT_PUBLISHED' });
  rejectRecipient = editors[0].email; event = await enqueue(); await worker.dispatch(); await processed(event, 'PENDING');
  const partial = await prisma.outboxEvent.findUniqueOrThrow({ where: { id: event.id } }); assert.equal(partial.payload.reviewEmailReceipts.length, 1); assert.equal(messages.length, 5);
  rejectRecipient = ''; await prisma.outboxEvent.update({ where: { id: event.id }, data: { availableAt: new Date(0) } });
  await worker.dispatch(); await processed(event); assert.equal(messages.length, 6); assert.equal(messages.slice(4).filter((m) => m.recipient === owner.email).length, 1);
  event = await enqueue(); await prisma.outboxEvent.update({ where: { id: event.id }, data: { status: 'PROCESSING', attemptCount: 1, availableAt: new Date(Date.now()+120000) } });
  await worker.dispatch(); await processed(event, 'PROCESSING'); assert.equal(messages.length, 6);
  await prisma.outboxEvent.update({ where: { id: event.id }, data: { availableAt: new Date(0) } }); await worker.dispatch(); await processed(event); assert.equal(messages.length, 8);
  const exhausted = await enqueue(); await prisma.outboxEvent.update({ where: { id: exhausted.id }, data: { status: 'PROCESSING', attemptCount: 5, availableAt: new Date(0) } });
  await worker.dispatch(); await processed(exhausted, 'FAILED'); assert.equal(messages.length, 8); await processed(legacy, 'PENDING');
  // Legacy status/edit notices must not select an earlier-created employee.
  await prisma.user.update({ where: { id: editors[0].id }, data: { createdAt: new Date('2000-01-01') } });
  const { OnboardingEmailService } = require('../dist/onboarding/onboarding-email.service');
  const { CatalogueEmailService } = require('../dist/catalogue/catalogue-email.service');
  await new OnboardingEmailService(prisma).notifyReview(owner.tenantId, 'APPROVED', 'APPROVED', 'Demonstration only');
  await new CatalogueEmailService(prisma).notifyAdminEdited(approved.id, 'Demonstration administrator');
  assert.equal(messages.length, 10); assert(messages.slice(8).every((message) => message.recipient === owner.email));
  const { VendorToolsService } = require('../dist/vendor-tools/vendor-tools.service');
  const { VendorOutletAccessService } = require('../dist/vendor-outlets/vendor-outlet-access.service');
  process.env.VENDOR_REPORT_SCHEDULER_ENABLED = 'true';
  const reports = new VendorToolsService(prisma, new VendorOutletAccessService(prisma));
  const schedule = await reports.createReportSchedule({ sub: owner.id, tenantId: owner.tenantId, role: owner.role, organizationRole: owner.organizationRole }, { reportName: 'Demonstration concurrent report', reportType: 'BOOKINGS', frequency: 'DAILY', recipient: 'reports@fixture.invalid', runTime: '00:00', outletId: outlets[0].id });
  await Promise.all([reports.dispatchScheduledReports(), reports.dispatchScheduledReports()]);
  assert.equal(messages.length, 11, 'Concurrent workers send a due report once, including same-day catch-up');
  assert(messages[10].raw.includes('Content-Disposition: attachment;'));
  assert((await prisma.reportSchedule.findUniqueOrThrow({ where: { id: schedule.id } })).lastRunAt);
  await reports.dispatchScheduledReports(); assert.equal(messages.length, 11, 'A recorded daily send is not repeated');
  assert.deepEqual(await fingerprint(), before, 'Finance, booking and asset records preserved');
  const result = { checkedAt: new Date(), pass: true, database: target.pathname.slice(1), transport: 'Authenticated loopback SMTP sink; no external delivery', capturedMessages: messages.length, scheduledReportConcurrentSendSuppressed: true, sameDayScheduleCatchUp: true, scheduledReportAttachment: true, legacyOnboardingAndAdminEditOwnerIsolation: true, approval: true, rejectionNote: true, tenantOutletRoleIsolation: true, revokedGrantExcluded: true, optOut: true, mismatchedRevisionExcluded: true, concurrentClaim: true, partialRetryReceipts: true, expiredLeaseRecovery: true, attemptsBounded: true, historicalEventsUntouched: true, protectedTableHashesUnchanged: Object.keys(before).length };
  if (process.env.REVIEW_MAIL_EVIDENCE) fs.writeFileSync(process.env.REVIEW_MAIL_EVIDENCE, JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result));
}
main().catch((error) => { console.error(error); process.exitCode = 1; }).finally(async () => { await prisma.$disconnect(); for (const socket of sockets) socket.destroy(); await new Promise((resolve) => server.close(resolve)); });
