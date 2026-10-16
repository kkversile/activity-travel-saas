import { DocumentReviewStatus, UserRole, VendorVerificationStatus } from '@prisma/client';
import { AdminService } from './admin.service';

const actor = { sub: 'admin-1', email: 'admin@voya.test', role: UserRole.SUPER_ADMIN, tenantId: null } as any;

describe('AdminService governance', () => {
  it('creates a vendor account with a hashed password and returns the one-time shareable password', async () => {
    const user = { id: 'vendor-user', email: 'vendor@example.com', fullName: 'Demo Vendor', role: UserRole.VENDOR, tenantId: 'tenant-1', active: true };
    const tx: any = { tenant: { create: jest.fn().mockResolvedValue({ id: 'tenant-1' }) }, user: { create: jest.fn().mockResolvedValue(user) }, vendorProfile: { create: jest.fn().mockResolvedValue({}) } };
    const prisma: any = { user: { findUnique: jest.fn().mockResolvedValue(null) }, $transaction: jest.fn((callback: any) => callback(tx)) };
    const service = new AdminService(prisma, { write: jest.fn() } as any, { enqueue: jest.fn() } as any);
    const result = await service.createVendor(actor, { vendorName: 'Demo Vendor', email: 'Vendor@example.com', password: 'ChangeMe@123' });
    expect(tx.user.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ email: 'vendor@example.com', role: UserRole.VENDOR, passwordHash: expect.not.stringMatching('ChangeMe@123'), mustChangePassword: true }) }));
    expect(result).toMatchObject({ email: 'vendor@example.com', temporaryPassword: 'ChangeMe@123', vendorName: 'Demo Vendor' });
  });

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
