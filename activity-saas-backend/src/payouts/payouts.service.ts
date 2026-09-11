import { Injectable } from '@nestjs/common';
import { AuthUser } from '../common/auth.types';
import { requireTenant } from '../common/tenant';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class PayoutsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(user: AuthUser) {
    const tenantId = requireTenant(user);
    const rows = await this.prisma.payout.findMany({ where: { tenantId }, orderBy: { dueDate: 'desc' } });
    return rows.map((p) => ({ ...p, amount: Number(p.amount) }));
  }
}
