import { FilePurpose, FileVisibility, OrganizationRole, UserRole } from '@prisma/client';
import { FilesService } from './files.service';

describe('FilesService tenant isolation', () => {
  it('denies a vendor access to another tenant private asset', async () => {
    const prisma = { fileAsset: { findUnique: jest.fn().mockResolvedValue({ id: 'f2', tenantId: 'tenant-b', visibility: FileVisibility.PRIVATE, purpose: FilePurpose.VENDOR_DOCUMENT, storageKey: 'private/x', originalName: 'x.pdf', mimeType: 'application/pdf' }) } };
    const storage = { read: jest.fn() };
    const service = new FilesService(prisma as any, storage as any);
    await expect(service.content({ sub: 'u1', email: 'a@x', role: UserRole.VENDOR, tenantId: 'tenant-a', organizationRole: OrganizationRole.OWNER }, 'f2')).rejects.toMatchObject({ status: 403 });
    expect(storage.read).not.toHaveBeenCalled();
  });

  it('requires a valid booking relationship for private vouchers', async () => {
    const prisma = { fileAsset: { findUnique: jest.fn().mockResolvedValue({ id: 'v1', tenantId: 'tenant-a', visibility: FileVisibility.PRIVATE, purpose: FilePurpose.BOOKING_VOUCHER, entityType: 'Booking', entityId: 'b1', storageKey: 'private/v', originalName: 'v.pdf', mimeType: 'application/pdf' }) }, booking: { findFirst: jest.fn().mockResolvedValue(null) } };
    const service = new FilesService(prisma as any, { read: jest.fn() } as any);
    await expect(service.content({ sub: 'u1', email: 'a@x', role: UserRole.VENDOR, tenantId: 'tenant-a', organizationRole: OrganizationRole.OWNER }, 'v1')).rejects.toMatchObject({ status: 403 });
  });

  it('denies anonymous, unknown-purpose and fulfilment private files', async () => {
    const storage = { read: jest.fn() };
    const service = new FilesService({ fileAsset: { findUnique: jest.fn().mockResolvedValue({ id: 'f', tenantId: 'tenant-a', visibility: FileVisibility.PRIVATE, purpose: FilePurpose.OTHER, storageKey: 'private/x', originalName: 'x', mimeType: 'application/octet-stream' }) } } as any, storage as any);
    await expect(service.content(undefined, 'f')).rejects.toMatchObject({ status: 403 });
    await expect(service.content({ sub: 'u1', email: 'a@x', role: UserRole.VENDOR, tenantId: 'tenant-a', organizationRole: OrganizationRole.OWNER }, 'f')).rejects.toMatchObject({ status: 403 });
    expect(storage.read).not.toHaveBeenCalled();
  });

  it('serves a public asset through the public path but not a private asset', async () => {
    const publicAsset = { id: 'p', tenantId: 'tenant-a', visibility: FileVisibility.PUBLIC, purpose: FilePurpose.PRODUCT_MEDIA, storageKey: 'public/p', originalName: 'p.png', mimeType: 'image/png' };
    const privateAsset = { ...publicAsset, id: 'q', visibility: FileVisibility.PRIVATE };
    const prisma: any = { fileAsset: { findUnique: jest.fn().mockResolvedValueOnce(publicAsset).mockResolvedValueOnce(privateAsset) } };
    const service = new FilesService(prisma, { read: jest.fn().mockResolvedValue(Buffer.from('ok')) } as any);
    await expect(service.content(undefined, 'p', true)).resolves.toMatchObject({ asset: publicAsset });
    await expect(service.content(undefined, 'q', true)).rejects.toMatchObject({ status: 404 });
  });
});
