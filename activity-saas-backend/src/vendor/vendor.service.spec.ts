import { DocumentReviewStatus, FilePurpose, FileVisibility } from '@prisma/client';
import { detectDocumentType, VendorService } from './vendor.service';

describe('vendor document signatures', () => {
  it.each([
    ['application/pdf', Buffer.from('%PDF-1.7\n')],
    ['image/png', Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])],
    ['image/jpeg', Buffer.from([0xff, 0xd8, 0xff, 0xe0])],
  ])('detects %s fixtures', (mime, bytes) => {
    expect(detectDocumentType(bytes)).toBe(mime);
  });

  it('rejects spoofed PDF and JPEG content', () => {
    expect(detectDocumentType(Buffer.from('<html>not a pdf</html>'))).not.toBe('application/pdf');
    expect(detectDocumentType(Buffer.from('not a jpeg'))).not.toBe('image/jpeg');
  });

  it('resets current status to PENDING and retains the prior version on replacement', async () => {
    let versionNumber = 0;
    let currentStatus = DocumentReviewStatus.REJECTED;
    const tx: any = {
      fileAsset: { create: jest.fn().mockResolvedValue({ id: 'asset' }) },
      vendorDocument: { upsert: jest.fn().mockImplementation(async ({ update }: any) => { currentStatus = update.currentStatus; return { id: 'doc-1' }; }) },
      vendorDocumentVersion: {
        findFirst: jest.fn().mockImplementation(async () => versionNumber ? { versionNumber } : null),
        create: jest.fn().mockImplementation(async ({ data }: any) => { versionNumber = data.versionNumber; return { id: `version-${versionNumber}`, versionNumber, status: data.status }; }),
      },
    };
    const prisma: any = {
      vendorProfile: { findUnique: jest.fn().mockResolvedValue({ id: 'profile' }) },
      $transaction: jest.fn(async (callback: any) => callback(tx)),
    };
    const storage: any = { save: jest.fn().mockResolvedValue({ storageKey: 'private/doc.pdf', sizeBytes: 8 }), remove: jest.fn() };
    const audit: any = { write: jest.fn() };
    const outbox: any = { enqueue: jest.fn() };
    const service = new VendorService(prisma, storage, audit, outbox);
    const user: any = { sub: 'vendor-1', email: 'vendor@x', role: 'VENDOR', tenantId: 'tenant-a' };
    const file: any = { buffer: Buffer.from('%PDF-1.7\n'), mimetype: 'application/pdf', size: 8, originalname: 'tax.pdf' };

    await service.uploadDocument(user, 'gstin', file);
    expect(currentStatus).toBe(DocumentReviewStatus.PENDING);
    await service.uploadDocument(user, 'gstin', file);
    expect(versionNumber).toBe(2);
    expect(tx.vendorDocumentVersion.create).toHaveBeenCalledTimes(2);
    expect(tx.fileAsset.create.mock.calls[0][0].data).toMatchObject({ visibility: FileVisibility.PRIVATE, purpose: FilePurpose.VENDOR_DOCUMENT });
  });
});
