import { DocumentReviewStatus, ProductStatus, TenantKind, UserRole, VendorVerificationStatus } from '@prisma/client';
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

  it('archives only live products and records the lifecycle event', async () => {
    const tx: any = { $queryRaw: jest.fn(), product: { findFirst: jest.fn().mockResolvedValue({ id: 'p1', tenantId: 't1', status: ProductStatus.LIVE, currentRevisionId: 'r1' }), update: jest.fn().mockResolvedValue({ id: 'p1', status: ProductStatus.ARCHIVED }) } };
    const prisma: any = { $transaction: jest.fn((callback: any) => callback(tx)) };
    const audit = { write: jest.fn() };
    const outbox = { enqueue: jest.fn() };
    const service = new AdminService(prisma, audit as any, outbox as any);
    await expect(service.archiveProduct(actor, 'p1')).resolves.toMatchObject({ status: ProductStatus.ARCHIVED });
    expect(tx.product.update).toHaveBeenCalledWith({ where: { id: 'p1' }, data: { status: ProductStatus.ARCHIVED } });
    expect(audit.write).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ action: 'PRODUCT_ARCHIVED' }));
    expect(outbox.enqueue).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ eventType: 'PRODUCT_ARCHIVED' }));
  });
  it('filters vendors by profile state, onboarding state or current product state', async () => {
    const prisma: any = { tenant: { findMany: jest.fn().mockResolvedValue([]) } };
    const service = new AdminService(prisma, {} as any, {} as any);

    await service.vendors(' Kerala ');
    expect(prisma.tenant.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        kind: TenantKind.VENDOR,
        OR: [
          { vendorProfile: { is: { operatingRegion: { equals: 'Kerala', mode: 'insensitive' } } } },
          { vendorOnboarding: { is: { state: { equals: 'Kerala', mode: 'insensitive' } } } },
          { products: { some: { deletedAt: null, currentRevision: { is: { stateName: { equals: 'Kerala', mode: 'insensitive' } } } } } },
        ],
      },
    }));

    await service.vendors();
    expect(prisma.tenant.findMany).toHaveBeenLastCalledWith(expect.objectContaining({
      where: { kind: TenantKind.VENDOR },
    }));
  });

  it('lists distinct real states across vendor profiles, applications and current products', async () => {
    const prisma: any = {
      vendorProfile: { findMany: jest.fn().mockResolvedValue([{ operatingRegion: 'Kerala' }, { operatingRegion: 'Not set' }]) },
      vendorOnboardingApplication: { findMany: jest.fn().mockResolvedValue([{ state: ' kerala ' }, { state: 'Tamil Nadu' }]) },
      productRevision: { findMany: jest.fn().mockResolvedValue([{ stateName: 'Goa' }]) },
    };
    const service = new AdminService(prisma, {} as any, {} as any);
    await expect(service.vendorStates()).resolves.toEqual(['Goa', 'Kerala', 'Tamil Nadu']);
    expect(prisma.productRevision.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { currentForProducts: { some: { deletedAt: null, tenant: { kind: TenantKind.VENDOR } } } },
    }));
  });

});
