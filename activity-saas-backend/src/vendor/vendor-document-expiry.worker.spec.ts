import { ProductStatus } from '@prisma/client';
import { VendorDocumentExpiryWorker } from './vendor-document-expiry.worker';

describe('VendorDocumentExpiryWorker', () => {
  const fixture = (vendorDocuments: unknown[], products: Array<{ id: string; status: ProductStatus }>, transitions: unknown[] = []) => {
    const tx: any = {
      product: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
      auditLog: { findFirst: jest.fn().mockResolvedValue(null) },
      $queryRaw: jest.fn().mockResolvedValue([]),
    };
    const prisma: any = {
      tenant: { findMany: jest.fn().mockResolvedValue([{ id: 'vendor-1', vendorDocuments, products }]) },
      auditLog: { findMany: jest.fn().mockResolvedValue(transitions) },
      vendorOnboardingApplication: { findMany: jest.fn().mockResolvedValue([]), findUnique: jest.fn().mockResolvedValue({ supplementalData: {} }) },
      vendorDocument: { findMany: jest.fn().mockResolvedValue([]), findUnique: jest.fn(), updateMany: jest.fn() },
      vendorDocumentVersion: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
      $transaction: jest.fn((callback: (client: any) => unknown) => callback(tx)),
    };
    const audit = { write: jest.fn().mockResolvedValue({}) };
    const outbox = { enqueue: jest.fn().mockResolvedValue({}) };
    return { worker: new VendorDocumentExpiryWorker(prisma, audit as any, outbox as any), prisma, tx, audit, outbox };
  };

  it('pauses live products when verified public liability insurance is missing or expired', async () => {
    const f = fixture([], [{ id: 'product-1', status: ProductStatus.LIVE }]);

    await expect(f.worker.syncRequiredDocumentProductStatus(new Date('2026-11-04T00:00:00Z'))).resolves.toEqual({ paused: 1, resumed: 0 });

    expect(f.tx.product.updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ status: ProductStatus.LIVE }), data: { status: ProductStatus.SUSPENDED } }));
    expect(f.audit.write).toHaveBeenCalledWith(f.tx, expect.objectContaining({ action: 'PRODUCT_AUTO_PAUSED_DOCUMENT_EXPIRY', entityId: 'product-1' }));
    expect(f.outbox.enqueue).toHaveBeenCalledWith(f.tx, expect.objectContaining({ eventType: 'PRODUCT_AUTO_PAUSED_DOCUMENT_EXPIRY' }));
  });

  it('resumes only products whose latest automated transition is an expiry pause', async () => {
    const f = fixture(
      [{ type: 'PUBLIC_LIABILITY_INSURANCE', currentStatus: 'VERIFIED', versions: [{ status: 'VERIFIED', expiresAt: new Date('2026-12-01T00:00:00Z') }] }],
      [{ id: 'product-1', status: ProductStatus.SUSPENDED }],
      [{ entityId: 'product-1', action: 'PRODUCT_AUTO_PAUSED_DOCUMENT_EXPIRY' }],
    );

    await expect(f.worker.syncRequiredDocumentProductStatus(new Date('2026-11-04T00:00:00Z'))).resolves.toEqual({ paused: 0, resumed: 1 });

    expect(f.tx.product.updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ status: ProductStatus.SUSPENDED }), data: { status: ProductStatus.LIVE } }));
    expect(f.audit.write).toHaveBeenCalledWith(f.tx, expect.objectContaining({ action: 'PRODUCT_AUTO_RESUMED_DOCUMENT_RENEWAL', entityId: 'product-1' }));
    expect(f.outbox.enqueue).toHaveBeenCalledWith(f.tx, expect.objectContaining({ eventType: 'PRODUCT_AUTO_RESUMED_DOCUMENT_RENEWAL' }));
  });

  it('queues one 30/15/3-day reminder per verified document version and records deduplication state', async () => {
    const f = fixture([], []);
    f.prisma.vendorDocument.findMany.mockResolvedValueOnce([{
      id: 'document-1', tenantId: 'vendor-1', type: 'PUBLIC_LIABILITY_INSURANCE',
      versions: [{ id: 'version-1', status: 'VERIFIED', expiresAt: new Date('2026-12-04T14:00:00Z') }],
    }]);

    await expect(f.worker.sendExpiryReminders(new Date('2026-11-04T12:00:00Z'))).resolves.toBe(1);

    expect(f.prisma.vendorDocument.findMany).toHaveBeenCalledTimes(3);
    expect(f.tx.$queryRaw).toHaveBeenCalledTimes(1);
    expect(f.tx.auditLog.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ action: 'VENDOR_DOCUMENT_EXPIRY_REMINDER_30', entityId: 'version-1' }) }));
    expect(f.audit.write).toHaveBeenCalledWith(f.tx, expect.objectContaining({ action: 'VENDOR_DOCUMENT_EXPIRY_REMINDER_30', entityId: 'version-1' }));
    expect(f.outbox.enqueue).toHaveBeenCalledWith(f.tx, expect.objectContaining({ eventType: 'VENDOR_DOCUMENT_EXPIRY_REMINDER_30', aggregateId: 'version-1' }));
  });

  it('does not enqueue a duplicate reminder for a document version', async () => {
    const f = fixture([], []);
    f.prisma.vendorDocument.findMany.mockResolvedValueOnce([{
      id: 'document-1', tenantId: 'vendor-1', type: 'PUBLIC_LIABILITY_INSURANCE',
      versions: [{ id: 'version-1', status: 'VERIFIED', expiresAt: new Date('2026-12-04T14:00:00Z') }],
    }]);
    f.tx.auditLog.findFirst.mockResolvedValue({ id: 'existing-reminder' });

    await expect(f.worker.sendExpiryReminders(new Date('2026-11-04T12:00:00Z'))).resolves.toBe(0);

    expect(f.audit.write).not.toHaveBeenCalled();
    expect(f.outbox.enqueue).not.toHaveBeenCalled();
  });

  it('backfills previously saved onboarding expiry dates into the latest document version', async () => {
    const f = fixture([], []);
    f.prisma.vendorOnboardingApplication.findMany.mockResolvedValue([{
      tenantId: 'vendor-1', supplementalData: { licences: [{ documentType: 'PUBLIC_LIABILITY_INSURANCE', validTill: '2026-12-31' }] },
    }]);
    f.prisma.vendorDocument.findUnique.mockResolvedValue({ versions: [{ id: 'version-1', expiresAt: null }] });

    await expect(f.worker.syncSavedExpiryDates()).resolves.toBe(1);

    expect(f.prisma.vendorDocumentVersion.updateMany).toHaveBeenCalledWith({ where: { id: 'version-1', expiresAt: null }, data: { expiresAt: new Date('2026-12-31T23:59:59.999Z') } });
  });
});
