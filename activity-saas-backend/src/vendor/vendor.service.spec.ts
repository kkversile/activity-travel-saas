import { DocumentReviewStatus, FilePurpose, FileVisibility } from '@prisma/client';
import { documentKeyMap } from './vendor-document.dto';
import { detectDocumentType, VendorService } from './vendor.service';

describe('vendor document signatures', () => {
  it('maps every onboarding upload action to a persisted document type', () => {
    expect(documentKeyMap).toMatchObject({
      pan: 'PAN',
      gstin: 'GSTIN',
      bankProof: 'BANK_PROOF',
      tradeLicense: 'TRADE_LICENSE',
      tourismRegistration: 'TOURISM_REGISTRATION',
      vehiclePermit: 'VEHICLE_PERMIT',
      publicLiabilityInsurance: 'PUBLIC_LIABILITY_INSURANCE',
      boatLicense: 'BOAT_LICENSE',
      adventureWaterSportsLicense: 'ADVENTURE_WATER_SPORTS_LICENSE',
      fssaiLicense: 'FSSAI_LICENSE',
    });
  });

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
    let sequenceValue = 0;
    const identifiers = new Map<string, any>();
    const uploadedTypes: string[] = [];
    const tx: any = {
      publicIdentifier: {
        findUnique: jest.fn().mockImplementation(async ({ where }: any) => identifiers.get(where.entityType_entityId.entityId) || null),
        findMany: jest.fn().mockImplementation(async () => [...identifiers.values()].map(({ entityType, publicCode }) => ({ entityType, publicCode }))),
        upsert: jest.fn().mockImplementation(async ({ create }: any) => { identifiers.set(create.entityId, create); return create; }),
      },
      publicIdentifierSequence: { upsert: jest.fn().mockImplementation(async ({ create, update }: any) => { sequenceValue = sequenceValue ? sequenceValue + update.lastValue.increment : create.lastValue; return { lastValue: sequenceValue }; }) },
      fileAsset: { create: jest.fn().mockResolvedValue({ id: 'asset' }) },
      vendorDocument: { upsert: jest.fn().mockImplementation(async ({ where, update }: any) => { uploadedTypes.push(where.tenantId_type.type); currentStatus = update.currentStatus; return { id: 'doc-1' }; }) },
      vendorDocumentVersion: {
        findFirst: jest.fn().mockImplementation(async () => versionNumber ? { versionNumber } : null),
        create: jest.fn().mockImplementation(async ({ data }: any) => { versionNumber = data.versionNumber; return { id: `version-${versionNumber}`, vendorDocumentId: 'doc-1', versionNumber, status: data.status }; }),
      },
    };
    const prisma: any = {
      publicIdentifier: tx.publicIdentifier,
      vendorProfile: { findUnique: jest.fn().mockResolvedValue({ id: 'profile' }) },
      $transaction: jest.fn(async (callback: any) => callback(tx)),
    };
    const storage: any = { save: jest.fn().mockResolvedValue({ storageKey: 'private/doc.pdf', sizeBytes: 8 }), remove: jest.fn() };
    const audit: any = { write: jest.fn() };
    const outbox: any = { enqueue: jest.fn() };
    const service = new VendorService(prisma, storage, audit, outbox);
    const user: any = { sub: 'vendor-1', email: 'vendor@x', role: 'VENDOR', tenantId: 'tenant-a' };
    const file: any = { buffer: Buffer.from('%PDF-1.7\n'), mimetype: 'application/pdf', size: 8, originalname: 'tax.pdf' };

    await expect(service.uploadDocument(user, 'gstin', file, '2026-12-31')).resolves.toMatchObject({ publicCode: 'DOC-000001' });
    expect(tx.vendorDocumentVersion.create.mock.calls[0][0].data.expiresAt).toEqual(new Date('2026-12-31T23:59:59.999Z'));
    expect(currentStatus).toBe(DocumentReviewStatus.PENDING);
    await service.uploadDocument(user, 'gstin', file);
    expect(versionNumber).toBe(2);
    expect(sequenceValue).toBe(1);
    expect(tx.vendorDocumentVersion.create).toHaveBeenCalledTimes(2);
    expect(tx.fileAsset.create.mock.calls[0][0].data).toMatchObject({ visibility: FileVisibility.PRIVATE, purpose: FilePurpose.VENDOR_DOCUMENT });

    await service.uploadDocument(user, 'boatLicense', file);
    expect(uploadedTypes).toContain('BOAT_LICENSE');
  });
});
