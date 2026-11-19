// SMTP integration confined to the synthetic database and an in-process loopback sink.
const assert = require('node:assert/strict');
const net = require('node:net');
const fs = require('node:fs');
const path = require('node:path');
const { PrismaClient } = require('@prisma/client');
const target = new URL(process.env.DATABASE_URL || 'invalid:');
assert(target.hostname === '127.0.0.1' && target.port === '55439' && ['/voya_readiness_fresh_20261119','/voya_readiness_clean_20261119'].includes(target.pathname) && target.username === 'voya_local');
const messages = [], sockets = new Set();
const server = net.createServer((socket) => {
  sockets.add(socket); socket.on('close', () => sockets.delete(socket));
  let buffer = '', data = false, message = [];
  socket.write('220 loopback.readiness.invalid SMTP sink\r\n');
  socket.on('data', (chunk) => {
    buffer += chunk.toString();
    while (buffer.includes('\r\n')) {
      const index = buffer.indexOf('\r\n'), line = buffer.slice(0, index); buffer = buffer.slice(index + 2);
      if (data) {
        if (line === '.') { messages.push(message.join('\r\n')); data = false; message = []; socket.write('250 captured locally\r\n'); }
        else message.push(line);
      } else if (/^EHLO/i.test(line)) socket.write('250-loopback.readiness.invalid\r\n250 AUTH PLAIN\r\n');
      else if (/^AUTH PLAIN/i.test(line)) socket.write('235 Authentication successful\r\n');
      else if (/^DATA/i.test(line)) { data = true; socket.write('354 End with dot\r\n'); }
      else if (/^QUIT/i.test(line)) socket.end('221 Bye\r\n');
      else socket.write('250 OK\r\n');
    }
  });
});
const prisma = new PrismaClient();
async function main() {
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  Object.assign(process.env, { SMTP_HOST: '127.0.0.1', SMTP_PORT: String(server.address().port), SMTP_SECURE: 'false', SMTP_USER: 'sender@readiness.invalid', SMTP_PASSWORD: 'loopback-only', SMTP_FROM_EMAIL: 'sender@readiness.invalid', VENDOR_REPORT_SCHEDULER_ENABLED: 'true' });
  const { OutboxService } = require('../dist/outbox/outbox.service');
  const { VendorNotificationWorker } = require('../dist/outbox/vendor-notification.worker');
  const { VendorToolsService } = require('../dist/vendor-tools/vendor-tools.service');
  const { VendorOutletAccessService } = require('../dist/vendor-outlets/vendor-outlet-access.service');
  const owner = await prisma.user.findUniqueOrThrow({ where: { email: 'vendor@voya.demo' } });
  const booking = await prisma.booking.findFirstOrThrow({ where: { idempotencyKey: 'readiness-baseline-booking' } });
  const outbox = new OutboxService(prisma), worker = new VendorNotificationWorker(prisma, outbox);
  const ids = [];
  for (const type of ['BOOKING_CONFIRMED', 'BOOKING_CANCELLED_VENDOR', 'PAYOUT_RECONCILED']) {
    const event = await outbox.enqueue(prisma, { tenantId: owner.tenantId, eventType: type, aggregateType: type.startsWith('BOOKING') ? 'Booking' : 'Payout', aggregateId: type.startsWith('BOOKING') ? booking.id : 'readiness-mail-only', payload: { currency: 'INR', amount: '1.00', reason: 'Synthetic SMTP capture, no transfer.' } }); ids.push(event.id);
  }
  for (let i = 0; i < 20; i++) {
    await worker.dispatch();
    if (await prisma.outboxEvent.count({ where: { id: { in: ids }, status: 'PROCESSED' } }) === ids.length) break;
  }
  assert.equal(await prisma.outboxEvent.count({ where: { id: { in: ids }, status: 'PROCESSED' } }), 3);
  const decoded = messages.map((mail) => mail.replace(/=\?UTF-8\?([BQ])\?([^?]+)\?=/gi, (_, encoding, value) => encoding.toUpperCase() === 'B' ? Buffer.from(value, 'base64').toString('utf8') : Buffer.from(value.replace(/_/g, ' ').replace(/=([0-9a-f]{2})/gi, (_, byte) => String.fromCharCode(parseInt(byte, 16))), 'binary').toString('utf8')));
  console.log('Captured notification messages:', messages.length, messages.map((mail) => mail.match(/^Subject:.*(?:\r\n[ \t].*)*/mi)?.[0]));
  assert(decoded.some((mail) => mail.includes('Booking update')));
  assert(decoded.some((mail) => mail.includes('Booking cancelled')));
  assert(decoded.some((mail) => mail.includes('Payout update')));
  const tools = new VendorToolsService(prisma, new VendorOutletAccessService(prisma));
  const auth = { sub: owner.id, tenantId: owner.tenantId, role: owner.role, organizationRole: owner.organizationRole };
  const time = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date());
  const schedule = await tools.createReportSchedule(auth, { reportName: 'Readiness booking report', reportType: 'BOOKINGS', frequency: 'DAILY', recipient: 'reports@readiness.invalid', runTime: time, outletId: booking.outletId });
  await tools.dispatchScheduledReports();
  const count = messages.length;
  await tools.dispatchScheduledReports();
  assert.equal(messages.length, count, 'Scheduled report is sent once per local day');
  assert((await prisma.reportSchedule.findUniqueOrThrow({ where: { id: schedule.id } })).lastRunAt);
  assert(messages.some((mail) => /Content-Type: text\/csv/i.test(mail) && /Content-Disposition: attachment/i.test(mail)), 'Real report CSV attached to SMTP message');
  await prisma.reportSchedule.delete({ where: { id: schedule.id } });
  fs.writeFileSync(path.resolve('../outputs/release-readiness-20261119/smtp-integration.json'), JSON.stringify({ checkedAt: new Date(), pass: true, transport: 'In-process authenticated loopback SMTP sink; no external delivery', booking: true, cancellation: true, payout: true, scheduledReportCsv: true, duplicateReportSuppressed: true, capturedMessages: messages.length }, null, 2));
  console.log('PASS booking, cancellation, payout and scheduled-report SMTP capture');
}
main().catch((error) => { console.error(error); process.exitCode = 1; }).finally(async () => { await prisma.$disconnect(); for (const socket of sockets) socket.destroy(); await new Promise((resolve) => server.close(resolve)); });
