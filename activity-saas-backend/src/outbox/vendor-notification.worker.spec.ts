import nodemailer from 'nodemailer';
import { VendorNotificationWorker } from './vendor-notification.worker';

jest.mock('nodemailer', () => ({ __esModule: true, default: { createTransport: jest.fn() } }));

describe('VendorNotificationWorker', () => {
  const env = { ...process.env };
  const sendMail = jest.fn();
  const prisma: any = {
    booking: { findUnique: jest.fn() },
    product: { findFirst: jest.fn() },
    vendorDocumentVersion: { findFirst: jest.fn() },
    globalSetting: { findFirst: jest.fn() },
    user: { findMany: jest.fn() },
  };
  const outbox: any = {
    claimPending: jest.fn(), markProcessed: jest.fn(), retryOrFail: jest.fn(),
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
    prisma.user.findMany.mockResolvedValue([{ email: 'owner@example.test', fullName: 'Vendor Owner' }]);
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
    expect(outbox.claimPending).toHaveBeenCalledWith(25, expect.arrayContaining(['BOOKING_CONFIRMED']));
    expect(sendMail).toHaveBeenCalledWith(expect.objectContaining({ to: 'owner@example.test', subject: 'Booking update · BK-42' }));
    expect(outbox.markProcessed).toHaveBeenCalledWith('event-1');
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

    expect(outbox.claimPending).toHaveBeenCalledWith(25, expect.arrayContaining(['PRODUCT_AUTO_PAUSED_DOCUMENT_EXPIRY', 'PRODUCT_AUTO_RESUMED_DOCUMENT_RENEWAL']));
    expect(prisma.product.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'product-1', tenantId: 'vendor-1' } }));
    expect(sendMail).toHaveBeenCalledWith(expect.objectContaining({ to: 'owner@example.test', subject: 'Product sales paused · documents need attention · TA-GA-0001' }));
    expect(outbox.markProcessed).toHaveBeenCalledWith('event-2');
  });

  it('sends the configured 30/15/3-day document expiry reminder through the email preference', async () => {
    outbox.claimPending.mockResolvedValue([{ id: 'event-3', tenantId: 'vendor-1', eventType: 'VENDOR_DOCUMENT_EXPIRY_REMINDER_30', aggregateType: 'VendorDocumentVersion', aggregateId: 'version-1', payload: { daysRemaining: 30 }, attemptCount: 1 }]);
    prisma.globalSetting.findFirst.mockResolvedValue({ value: { documentExpiryEmail: true } });

    await worker.dispatch();

    expect(outbox.claimPending).toHaveBeenCalledWith(25, expect.arrayContaining(['VENDOR_DOCUMENT_EXPIRY_REMINDER_30', 'VENDOR_DOCUMENT_EXPIRY_REMINDER_15', 'VENDOR_DOCUMENT_EXPIRY_REMINDER_3']));
    expect(prisma.vendorDocumentVersion.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'version-1', vendorDocument: { tenantId: 'vendor-1' } } }));
    expect(sendMail).toHaveBeenCalledWith(expect.objectContaining({ to: 'owner@example.test', subject: 'Document expires in 30 days · PUBLIC LIABILITY INSURANCE' }));
    expect(outbox.markProcessed).toHaveBeenCalledWith('event-3');
  });

  it('requeues delivery errors with the outbox retry policy', async () => {
    sendMail.mockRejectedValue(new Error('smtp unavailable'));
    await worker.dispatch();
    expect(outbox.retryOrFail).toHaveBeenCalledWith(expect.objectContaining({ id: 'event-1' }), 'smtp unavailable');
  });
});
