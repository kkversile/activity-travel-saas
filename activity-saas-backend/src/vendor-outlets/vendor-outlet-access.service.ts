import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { VendorOutletStatus } from '@prisma/client';
import { AuthUser } from '../common/auth.types';
import { requireTenant } from '../common/tenant';
import { PrismaService } from '../prisma/prisma.service';
import { RequestContextService } from '../common/request-context.service';

export type OutletScope = { tenantId: string; outletIds: string[] | null; aggregate: boolean };

@Injectable()
export class VendorOutletAccessService {
  constructor(private readonly prisma: PrismaService, private readonly context?: RequestContextService) {}

  isOwner(user: AuthUser) { return user.role === 'VENDOR' && user.organizationRole === 'OWNER'; }

  async list(user: AuthUser) {
    const tenantId = requireTenant(user);
    if (user.role !== 'VENDOR') throw new ForbiddenException('A vendor account is required');
    if (this.isOwner(user)) {
      const outlets = await this.prisma.vendorOutlet.findMany({ where: { tenantId }, orderBy: [{ isDefault: 'desc' }, { name: 'asc' }], include: { bankAccount: { select: { id: true, accountNumberMasked: true, bankName: true, verificationStatus: true, active: true } } } });
      return { access: 'ALL' as const, outlets };
    }
    const grants = await this.prisma.userOutletAccess.findMany({
      where: { tenantId, userId: user.sub, active: true },
      orderBy: { outlet: { name: 'asc' } },
      include: { outlet: { include: { bankAccount: { select: { id: true, accountNumberMasked: true, bankName: true, verificationStatus: true, active: true } } } } },
    });
    return { access: 'ASSIGNED' as const, outlets: grants.map((grant) => grant.outlet) };
  }

  async resolve(user: AuthUser, outletId?: string | null, options: { aggregateRead?: boolean; mutation?: boolean; existingObligation?: boolean } = {}): Promise<OutletScope> {
    const tenantId = requireTenant(user);
    if (user.role !== 'VENDOR') throw new ForbiddenException('A vendor account is required');
    const selected = this.context?.outletSelection;
    if (selected !== undefined && (typeof selected !== 'string' || !/^[0-9a-f-]{36}$/i.test(selected))) throw new BadRequestException('Provide one valid outletId.');
    if (selected && outletId && selected !== outletId) throw new NotFoundException('Record not found in the selected outlet.');
    if (this.isOwner(user)) {
      if (!outletId && options.aggregateRead && !options.mutation) return { tenantId, outletIds: null, aggregate: true };
      const outlets = await this.prisma.vendorOutlet.findMany({ where: { tenantId, ...(options.mutation && !options.existingObligation ? { status: VendorOutletStatus.ACTIVE } : {}) }, select: { id: true } });
      if (!outletId) {
        if (outlets.length === 1) return { tenantId, outletIds: [outlets[0].id], aggregate: false };
        throw new BadRequestException('Select an outlet for this request.');
      }
      const valid = outlets.some((outlet) => outlet.id === outletId);
      if (!valid) throw new NotFoundException('Outlet not found in this vendor workspace.');
      return { tenantId, outletIds: [outletId], aggregate: false };
    }

    const grants = await this.prisma.userOutletAccess.findMany({ where: { tenantId, userId: user.sub, active: true, ...(options.mutation && !options.existingObligation ? { outlet: { status: VendorOutletStatus.ACTIVE } } : {}) }, select: { outletId: true } });
    const allowed = grants.map((grant) => grant.outletId);
    if (!allowed.length) throw new ForbiddenException('No active outlet access is assigned to this account.');
    if (outletId) {
      if (!allowed.includes(outletId)) throw new NotFoundException('Outlet not found in this vendor workspace.');
      return { tenantId, outletIds: [outletId], aggregate: false };
    }
    if (allowed.length === 1) return { tenantId, outletIds: allowed, aggregate: false };
    throw new BadRequestException('Select one of your assigned outlets for this request.');
  }

  async requireOwner(user: AuthUser) {
    if (!this.isOwner(user)) throw new ForbiddenException('Only the vendor owner can manage outlets, bank accounts, and outlet access.');
    return requireTenant(user);
  }
}
