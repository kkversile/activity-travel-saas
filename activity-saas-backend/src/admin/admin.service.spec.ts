import { DocumentReviewStatus, UserRole, VendorVerificationStatus } from '@prisma/client';
import { AdminService } from './admin.service';

const actor = { sub: 'admin-1', email: 'admin@voya.test', role: UserRole.ADMIN, tenantId: null } as any;

describe('AdminService governance', () => {
  it('rejects unsupported vendor verification transitions', async () => {
    const prisma: any = { vendorProfile: { findUnique: jest.fn() } };
    const service = new AdminService(prisma, {} as any, {} as any);
    await expect(service.verification(actor, 't1', VendorVerificationStatus.PENDING)).rejects.toMatchObject({ status: 409 });
  });

  it('reviews only the latest document version', async () => {
    const latest = { id: 'v2', versionNumber: 2 };
    const tx: any = { vendorDocumentVersion: { findFirst: jest.fn().mockResolvedValue({ id: 'v1', versionNumber: 1, status: DocumentReviewStatus.PENDING, vendorDocumentId: 'd1', vendorDocument: { versions: [latest] } }), updateMany: jest.fn().mockResolvedValue({ count: 1 }) }, vendorDocument: { update: jest.fn() } };
    const prisma: any = { $transaction: jest.fn(async (callback: any) => callback(tx)), tenant: { findFirst: jest.fn().mockResolvedValue({}) } };
    const service = new AdminService(prisma, { write: jest.fn() } as any, { enqueue: jest.fn() } as any);
    await expect(service.document(actor, 't1', 'v1', DocumentReviewStatus.VERIFIED)).rejects.toMatchObject({ status: 409 });
    tx.vendorDocumentVersion.findFirst.mockResolvedValue({ id: 'v2', versionNumber: 2, status: DocumentReviewStatus.PENDING, vendorDocumentId: 'd1', vendorDocument: { versions: [latest] } });
    await expect(service.document(actor, 't1', 'v2', DocumentReviewStatus.VERIFIED)).resolves.toBeDefined();
    expect(tx.vendorDocument.update).toHaveBeenCalledWith({ where: { id: 'd1' }, data: { currentStatus: DocumentReviewStatus.VERIFIED } });
  });
});
