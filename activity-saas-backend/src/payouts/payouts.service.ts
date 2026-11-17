import { Injectable } from '@nestjs/common';
import { AuthUser } from '../common/auth.types';
import { requireTenant } from '../common/tenant';
import { PrismaService } from '../prisma/prisma.service';
import { VendorOutletAccessService } from '../vendor-outlets/vendor-outlet-access.service';

@Injectable()
export class PayoutsService {
  constructor(private readonly prisma: PrismaService, private readonly outletAccess: VendorOutletAccessService) {}

  async list(user: AuthUser, outletId?: string) {
    const tenantId = requireTenant(user);
    const scope = await this.outletAccess.resolve(user, outletId, { aggregateRead: true });
    const rows = await this.prisma.payout.findMany({ where: { tenantId, ...(scope.outletIds ? { outletId: { in: scope.outletIds } } : {}) }, orderBy: { dueDate: 'desc' } });
    return rows.map((p) => ({ ...p, amount: Number(p.amount) }));
  }
}
