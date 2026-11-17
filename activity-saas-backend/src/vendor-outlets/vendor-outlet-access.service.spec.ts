import { BadRequestException, NotFoundException } from '@nestjs/common';
import { VendorOutletAccessService } from './vendor-outlet-access.service';

const employee = { sub: 'user-a', tenantId: 'tenant-1', role: 'VENDOR', organizationRole: 'OPERATIONS' } as any;
const owner = { sub: 'owner', tenantId: 'tenant-1', role: 'VENDOR', organizationRole: 'OWNER' } as any;

describe('VendorOutletAccessService', () => {
  it('allows owner aggregate reads across the tenant outlet set', async () => {
    const prisma: any = { vendorOutlet: { findMany: jest.fn() }, userOutletAccess: { findMany: jest.fn() } };
    const service = new VendorOutletAccessService(prisma);
    await expect(service.resolve(owner, undefined, { aggregateRead: true })).resolves.toEqual({ tenantId: 'tenant-1', outletIds: null, aggregate: true });
    expect(prisma.vendorOutlet.findMany).not.toHaveBeenCalled();
  });

  it('defaults an employee with one assignment to that outlet', async () => {
    const prisma: any = { userOutletAccess: { findMany: jest.fn().mockResolvedValue([{ outletId: 'outlet-a' }]) } };
    const scope = await new VendorOutletAccessService(prisma).resolve(employee);
    expect(scope).toEqual({ tenantId: 'tenant-1', outletIds: ['outlet-a'], aggregate: false });
  });

  it('requires explicit selection for multiple outlet grants and rejects a guessed unassigned ID', async () => {
    const prisma: any = { userOutletAccess: { findMany: jest.fn().mockResolvedValue([{ outletId: 'outlet-a' }, { outletId: 'outlet-c' }]) } };
    const service = new VendorOutletAccessService(prisma);
    await expect(service.resolve(employee)).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.resolve(employee, 'outlet-b')).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.resolve(employee, 'outlet-c')).resolves.toMatchObject({ outletIds: ['outlet-c'], aggregate: false });
  });

  it('allows inactive assigned outlets for reads but rejects them for mutations', async () => {
    const prisma: any = { userOutletAccess: { findMany: jest.fn().mockResolvedValue([{ outletId: 'outlet-a' }]) } };
    const service = new VendorOutletAccessService(prisma);
    await expect(service.resolve(employee, 'outlet-a')).resolves.toMatchObject({ outletIds: ['outlet-a'] });
    prisma.userOutletAccess.findMany.mockResolvedValue([]);
    await expect(service.resolve(employee, 'outlet-a', { mutation: true })).rejects.toThrow();
  });
});
