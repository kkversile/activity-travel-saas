import nodemailer from 'nodemailer';
import { VendorNotificationWorker } from './vendor-notification.worker';

jest.mock('nodemailer', () => ({ __esModule: true, default: { createTransport: jest.fn() } }));

describe('VendorNotificationWorker', () => {
  const env = { ...process.env };
  const sendMail = jest.fn();
  const prisma: any = {
    booking: { findUnique: jest.fn() },
    product: { findFirst: jest.fn() },
    productRevision: { findFirst: jest.fn() },
    outboxEvent: { update: jest.fn() },
    vendorDocumentVersion: { findFirst: jest.fn() },
    payout: { findFirst: jest.fn() },
    settlementBatch: { findFirst: jest.fn() },
    globalSetting: { findFirst: jest.fn() },
    user: { findMany: jest.fn() },
  };
  const outbox: any = {
    claimPending: jest.fn(), requeueExpiredProcessing: jest.fn(), markProcessed: jest.fn(), retryOrFail: jest.fn(),
  };
  let worker: VendorNotificationWorker;

  beforeEach(() => {
    jest.resetAllMocks();
    process.env.SMTP_HOST = 'smtp.test';
    process.env.SMTP_USER = 'sender@example.test';
    process.env.SMTP_PASSWORD = 'test-password';
    (nodemailer.createTransport as jest.Mock).mockReturnValue({ sendMail });
    prisma.booking.findUnique.mockResolvedValue({ vendorTenantId: 'vendor-1', bookingCode: 'BK-42', status: 'CONFIRMED', serviceDate: new Date('2026-11-07T00:00:00Z') });
    prisma.product.findFirst.mockResolvedValue({ productCode: 'TA-GA-0001', currentRevision: { productName: 'Sunrise Trek' } });
    prisma.vendorDocumentVersion.findFirst.mockResolvedValue({ expiresAt: new Date('2026-12-04T00:00:00Z'), vendorDocument: { type: 'PUBLIC_LIABILITY_INSURANCE' } });
    prisma.globalSetting.findFirst.mockResolvedValue({ value: { bookingEmail: true } });
    prisma.user.findMany.mockResolvedValue([{ email: 'owner@example.test', fullName: 'Vendor Owner', organizationRole: 'OWNER' }]);
    outbox.claimPending.mockResolvedValue([{ id: 'event-1', tenantId: 'vendor-1', eventType: 'BOOKING_CONFIRMED', aggregateType: 'Booking', aggregateId: 'booking-1', payload: { bookingCode: 'BK-42' }, attemptCount: 1 }]);
    sendMail.mockResolvedValue({ messageId: 'mail-1' });
    worker = new VendorNotificationWorker(prisma, outbox);
  });

  afterAll(() => { process.env = env; });

  it('leaves notification events pending until SMTP is configured', async () => {
    delete process.env.SMTP_HOST;
    await worker.dispatch();
    expect(outbox.claimPending).not.toHaveBeenCalled();
    expect(sendMail).not.toHaveBeenCalled();
  });

  it('sends a booking email to active vendor users and acknowledges the event', async () => {
    await worker.dispatch();
    expect(outbox.claimPending).toHaveBeenCalledWith(25, expect.arrayContaining(['BOOKING_CONFIRMED']), ['PRODUCT_REVIEW_EMAIL_REQUESTED']);
    expect(sendMail).toHaveBeenCalledWith(expect.objectContaining({ to: 'owner@example.test', subject: 'Booking update · BK-42' }));
    expect(outbox.markProcessed).toHaveBeenCalledWith('event-1');
  });

  it('limits booking notifications to the owner and active grants for the booking outlet', async () => {
    prisma.booking.findUnique.mockResolvedValue({ vendorTenantId: 'vendor-1', outletId: 'outlet-1', bookingCode: 'BK-42', status: 'CONFIRMED', serviceDate: new Date('2026-12-01') });
    await worker.dispatch();
    expect(prisma.user.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: {
      tenantId: 'vendor-1', role: 'VENDOR', active: true, OR: [
        { organizationRole: 'OWNER' },
        { outletAccess: { some: { tenantId: 'vendor-1', outletId: 'outlet-1', active: true } } },
      ],
    } }));
  });

  it('sends unattributed legacy notifications only to workspace owners', async () => {
    await worker.dispatch();
    expect(prisma.user.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ OR: [{ organizationRole: 'OWNER' }] }) }));
  });

  it('keeps payout emails behind the existing finance permission as well as outlet access', async () => {
    outbox.claimPending.mockResolvedValue([{ id: 'payout-event', tenantId: 'vendor-1', eventType: 'PAYOUT_RECONCILED', aggregateType: 'Payout', aggregateId: 'payout-1', payload: {}, attemptCount: 1 }]);
    prisma.payout.findFirst.mockResolvedValue({ outletId: 'outlet-1' });
    prisma.user.findMany.mockResolvedValue(['OWNER', 'FINANCE', 'OPERATIONS', 'CATALOGUE', 'VIEWER'].map((organizationRole) => ({ email: organizationRole.toLowerCase() + '@example.test', fullName: organizationRole, organizationRole })));
    await worker.dispatch();
    expect(sendMail.mock.calls.map(([mail]) => mail.to)).toEqual(['owner@example.test', 'finance@example.test']);
    expect(prisma.payout.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'payout-1', tenantId: 'vendor-1' } }));
  });

  it('honors a disabled booking email preference without sending', async () => {
    prisma.globalSetting.findFirst.mockResolvedValue({ value: { bookingEmail: false } });
    await worker.dispatch();
    expect(sendMail).not.toHaveBeenCalled();
    expect(outbox.markProcessed).toHaveBeenCalledWith('event-1');
  });

  it('notifies vendors when product sales pause because insurance needs renewal', async () => {
    outbox.claimPending.mockResolvedValue([{ id: 'event-2', tenantId: 'vendor-1', eventType: 'PRODUCT_AUTO_PAUSED_DOCUMENT_EXPIRY', aggregateType: 'Product', aggregateId: 'product-1', payload: { reason: 'Insurance expired' }, attemptCount: 1 }]);
    prisma.globalSetting.findFirst.mockResolvedValue({ value: { documentExpiryEmail: true } });

    await worker.dispatch();

    expect(outbox.claimPending).toHaveBeenCalledWith(25, expect.arrayContaining(['PRODUCT_AUTO_PAUSED_DOCUMENT_EXPIRY', 'PRODUCT_AUTO_RESUMED_DOCUMENT_RENEWAL']), ['PRODUCT_REVIEW_EMAIL_REQUESTED']);
    expect(prisma.product.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'product-1', tenantId: 'vendor-1' } }));
    expect(sendMail).toHaveBeenCalledWith(expect.objectContaining({ to: 'owner@example.test', subject: 'Product sales paused · documents need attention · TA-GA-0001' }));
    expect(outbox.markProcessed).toHaveBeenCalledWith('event-2');
  });

  it('sends the configured 30/15/3-day document expiry reminder through the email preference', async () => {
    outbox.claimPending.mockResolvedValue([{ id: 'event-3', tenantId: 'vendor-1', eventType: 'VENDOR_DOCUMENT_EXPIRY_REMINDER_30', aggregateType: 'VendorDocumentVersion', aggregateId: 'version-1', payload: { daysRemaining: 30 }, attemptCount: 1 }]);
    prisma.globalSetting.findFirst.mockResolvedValue({ value: { documentExpiryEmail: true } });

    await worker.dispatch();

    expect(outbox.claimPending).toHaveBeenCalledWith(25, expect.arrayContaining(['VENDOR_DOCUMENT_EXPIRY_REMINDER_30', 'VENDOR_DOCUMENT_EXPIRY_REMINDER_15', 'VENDOR_DOCUMENT_EXPIRY_REMINDER_3']), ['PRODUCT_REVIEW_EMAIL_REQUESTED']);
    expect(prisma.vendorDocumentVersion.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'version-1', vendorDocument: { tenantId: 'vendor-1' } } }));
    expect(sendMail).toHaveBeenCalledWith(expect.objectContaining({ to: 'owner@example.test', subject: 'Document expires in 30 days · PUBLIC LIABILITY INSURANCE' }));
    expect(outbox.markProcessed).toHaveBeenCalledWith('event-3');
  });

  it('requeues delivery errors with the outbox retry policy', async () => {
    sendMail.mockRejectedValue(new Error('smtp unavailable'));
    await worker.dispatch();
    expect(outbox.retryOrFail).toHaveBeenCalledWith(expect.objectContaining({ id: 'event-1' }), 'smtp unavailable');
  });

  function review(decision = 'APPROVED') {
    outbox.claimPending.mockResolvedValue([{ id: 'review-event', tenantId: 'vendor-1', eventType: 'PRODUCT_REVIEW_EMAIL_REQUESTED', aggregateType: 'ProductRevision', aggregateId: 'revision-1', payload: { productId: 'product-1', revisionId: 'revision-1', decision }, attemptCount: 1 }]);
    prisma.productRevision.findFirst.mockResolvedValue({ versionNumber: 3, productName: 'Sunrise Trek', rejectionReason: 'Please explain the meeting point.', product: { productCode: 'TA-1', outletId: 'outlet-1' } });
    prisma.globalSetting.findFirst.mockResolvedValue({ value: { reviewEmail: true } });
    prisma.user.findMany.mockResolvedValue(['OWNER','CATALOGUE','OPERATIONS','FINANCE','VIEWER'].map((organizationRole) => ({ id: organizationRole, email: organizationRole.toLowerCase()+'@example.test', fullName: organizationRole, organizationRole })));
  }

  it('delivers approved review revisions only to owners and authorized catalogue editors', async () => {
    review(); await worker.dispatch();
    expect(sendMail.mock.calls.map(([mail]) => mail.to)).toEqual(['owner@example.test','catalogue@example.test']);
    expect(sendMail).toHaveBeenCalledWith(expect.objectContaining({ subject: 'Product approved · TA-1 · v3', text: expect.stringContaining('revision v3 was approved') }));
    expect(prisma.productRevision.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ id: 'revision-1', productId: 'product-1', product: { tenantId: 'vendor-1', deletedAt: null } }) }));
    expect(prisma.user.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ tenantId: 'vendor-1', active: true, OR: [{ organizationRole: 'OWNER' }, { outletAccess: { some: { tenantId: 'vendor-1', outletId: 'outlet-1', active: true, outlet: { status: 'ACTIVE' } } } }] }) }));
    expect(outbox.markProcessed).toHaveBeenCalledWith('review-event');
    expect(outbox.claimPending.mock.calls[0][1]).not.toEqual(expect.arrayContaining(['PRODUCT_PUBLISHED','PRODUCT_REJECTED']));
  });

  it('includes the stored reviewer note and next steps for a rejected revision', async () => {
    review('REJECTED'); await worker.dispatch();
    expect(sendMail).toHaveBeenCalledWith(expect.objectContaining({ subject: 'Product changes requested · TA-1 · v3', text: expect.stringContaining('Reviewer note: Please explain the meeting point.') }));
  });

  it('honors the product-review opt-out without looking up recipients', async () => {
    review(); prisma.globalSetting.findFirst.mockResolvedValue({ value: { reviewEmail: false } }); await worker.dispatch();
    expect(sendMail).not.toHaveBeenCalled(); expect(prisma.user.findMany).not.toHaveBeenCalled(); expect(outbox.markProcessed).toHaveBeenCalledWith('review-event');
  });

  it('skips deleted, foreign-tenant or stale revisions rejected by the scoped lookup', async () => {
    review(); prisma.productRevision.findFirst.mockResolvedValue(null); await worker.dispatch();
    expect(sendMail).not.toHaveBeenCalled(); expect(outbox.markProcessed).toHaveBeenCalledWith('review-event');
  });

  it('rejects mismatched revision identifiers before loading review content', async () => {
    review(); const events = await outbox.claimPending(); events[0].payload.revisionId='foreign-revision'; outbox.claimPending.mockResolvedValue(events); await worker.dispatch();
    expect(prisma.productRevision.findFirst).not.toHaveBeenCalled(); expect(sendMail).not.toHaveBeenCalled();
  });

  it('retains delivered-recipient receipts across a partial SMTP failure', async () => {
    review(); const event = await outbox.claimPending();
    outbox.claimPending.mockResolvedValue(event); sendMail.mockResolvedValueOnce({ messageId: 'first' }).mockRejectedValueOnce(new Error('temporary SMTP failure'));
    await worker.dispatch();
    expect(outbox.retryOrFail).toHaveBeenCalledWith(expect.objectContaining({ id: 'review-event' }), 'temporary SMTP failure');
    const saved = prisma.outboxEvent.update.mock.calls[0][0].data.payload;
    expect(saved.reviewEmailReceipts).toHaveLength(1); expect(JSON.stringify(saved)).not.toContain('owner@example.test');
    event[0].payload=saved; sendMail.mockClear(); sendMail.mockResolvedValue({ messageId: 'second' });
    await worker.dispatch(); expect(sendMail).toHaveBeenCalledTimes(1); expect(sendMail).toHaveBeenCalledWith(expect.objectContaining({ to: 'catalogue@example.test' }));
    expect(outbox.markProcessed).toHaveBeenCalledWith('review-event');
  });

  it('reclaims only the new review-delivery event type after an expired lease', async () => {
    review(); await worker.dispatch(); expect(outbox.requeueExpiredProcessing).toHaveBeenCalledWith(['PRODUCT_REVIEW_EMAIL_REQUESTED']);
  });
});
