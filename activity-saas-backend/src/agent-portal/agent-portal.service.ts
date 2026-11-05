import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { BookingRecordType, BookingStatus, TenantKind, UserRole } from '@prisma/client';
import { createHash, randomBytes } from 'crypto';
import { AuthUser } from '../common/auth.types';
import { PrismaService } from '../prisma/prisma.service';

const openStatuses: BookingStatus[] = [BookingStatus.NEW, BookingStatus.PENDING_VENDOR_CONFIRMATION, BookingStatus.PENDING_MANUAL_REVIEW, BookingStatus.CONFIRMED];

@Injectable()
export class AgentPortalService {
  constructor(private readonly prisma: PrismaService) {}

  private tenantId(user: AuthUser) {
    if (user.role !== UserRole.TRAVEL_AGENT || !user.tenantId) throw new ForbiddenException('Travel Agent access required');
    return user.tenantId;
  }

  private async assertTenant(tenantId: string) {
    const tenant = await this.prisma.tenant.findFirst({ where: { id: tenantId, kind: TenantKind.TRAVEL_AGENT }, select: { id: true } });
    if (!tenant) throw new ForbiddenException('Travel Agent workspace not found');
  }

  private async requireOwner(user: AuthUser) {
    const tenantId = this.tenantId(user);
    await this.assertTenant(tenantId);
    if (user.organizationRole !== 'OWNER') throw new ForbiddenException('Only the Agent workspace owner can manage this setting');
    return tenantId;
  }

  private bookingWhere(tenantId: string, from?: string, to?: string) {
    return {
      agentTenantId: tenantId,
      recordType: BookingRecordType.CANONICAL,
      ...((from || to) ? { createdAt: { ...(from ? { gte: new Date(`${from}T00:00:00.000Z`) } : {}), ...(to ? { lte: new Date(`${to}T23:59:59.999Z`) } : {}) } } : {}),
    };
  }

  private bookingSelect = {
    id: true, bookingCode: true, customerName: true, status: true, bookingMode: true, serviceDate: true,
    amount: true, currency: true, createdAt: true,
    operationalSnapshot: { select: { productSnapshot: true, variantSnapshot: true } },
    economicsSnapshot: { select: { agentFacingAmount: true, agentCommission: true, currency: true } },
  } as const;

  async dashboard(user: AuthUser) {
    const tenantId = this.tenantId(user); await this.assertTenant(tenantId);
    const now = new Date(); const today = new Date(now); today.setUTCHours(0, 0, 0, 0);
    const nextWeek = new Date(today); nextWeek.setUTCDate(nextWeek.getUTCDate() + 7);
    const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    const base = { agentTenantId: tenantId, recordType: BookingRecordType.CANONICAL };
    const [total, open, upcoming, monthRows, recent, upcomingRows] = await Promise.all([
      this.prisma.booking.count({ where: base }),
      this.prisma.booking.count({ where: { ...base, status: { in: [BookingStatus.NEW, BookingStatus.PENDING_VENDOR_CONFIRMATION, BookingStatus.PENDING_MANUAL_REVIEW] } } }),
      this.prisma.booking.count({ where: { ...base, status: { in: openStatuses }, serviceDate: { gte: today, lt: nextWeek } } }),
      this.prisma.booking.findMany({ where: { ...base, createdAt: { gte: monthStart } }, select: { currency: true, amount: true, economicsSnapshot: { select: { agentCommission: true, currency: true } } } }),
      this.prisma.booking.findMany({ where: base, select: this.bookingSelect, orderBy: { createdAt: 'desc' }, take: 6 }),
      this.prisma.booking.findMany({ where: { ...base, status: { in: openStatuses }, serviceDate: { gte: today } }, select: this.bookingSelect, orderBy: { serviceDate: 'asc' }, take: 6 }),
    ]);
    const totalsByCurrency: Record<string, { bookings: number; bookingValue: number; commission: number }> = {};
    for (const row of monthRows) {
      const code = row.economicsSnapshot?.currency || row.currency;
      const bucket = totalsByCurrency[code] ??= { bookings: 0, bookingValue: 0, commission: 0 };
      bucket.bookings += 1; bucket.bookingValue += Number(row.amount); bucket.commission += Number(row.economicsSnapshot?.agentCommission ?? 0);
    }
    return { totalBookings: total, awaitingAction: open, upcomingNext7Days: upcoming, monthToDate: totalsByCurrency, recentBookings: recent, upcomingBookings: upcomingRows };
  }

  async finance(user: AuthUser) {
    const tenantId = this.tenantId(user); await this.assertTenant(tenantId);
    const [profile, ledger] = await Promise.all([
      this.prisma.agentCommercialProfile.findUnique({ where: { tenantId }, select: { tier: true, commissionPercent: true, creditLimit: true, creditDays: true, walletBalance: true, creditOutstanding: true, markupAllowedPercent: true, updatedAt: true } }),
      this.prisma.agentWalletLedger.findMany({ where: { agentTenantId: tenantId }, orderBy: { createdAt: 'desc' }, take: 100, select: { id: true, entryType: true, paymentMethod: true, amount: true, balanceAfter: true, reference: true, reason: true, createdAt: true } }),
    ]);
    return { profile, ledger };
  }

  async reports(user: AuthUser, from?: string, to?: string) {
    const tenantId = this.tenantId(user); await this.assertTenant(tenantId);
    if ((from && Number.isNaN(Date.parse(from))) || (to && Number.isNaN(Date.parse(to)))) throw new BadRequestException('Report dates must be valid dates.');
    const rows = await this.prisma.booking.findMany({ where: this.bookingWhere(tenantId, from, to), select: { bookingCode: true, status: true, serviceDate: true, createdAt: true, customerName: true, currency: true, amount: true, economicsSnapshot: { select: { currency: true, agentCommission: true } }, operationalSnapshot: { select: { productSnapshot: true } } }, orderBy: { createdAt: 'desc' }, take: 10000 });
    const byCurrency: Record<string, { bookings: number; bookingValue: number; commission: number; cancelled: number }> = {};
    const byStatus: Record<string, number> = {};
    for (const row of rows) {
      const currency = row.economicsSnapshot?.currency || row.currency;
      const bucket = byCurrency[currency] ??= { bookings: 0, bookingValue: 0, commission: 0, cancelled: 0 };
      bucket.bookings += 1; bucket.bookingValue += Number(row.amount); bucket.commission += Number(row.economicsSnapshot?.agentCommission ?? 0);
      if (row.status === BookingStatus.CANCELLED) bucket.cancelled += 1;
      byStatus[row.status] = (byStatus[row.status] ?? 0) + 1;
    }
    return { from: from || null, to: to || null, totalBookings: rows.length, byCurrency, byStatus, rows };
  }

  async profile(user: AuthUser) {
    const tenantId = this.tenantId(user); await this.assertTenant(tenantId);
    return this.prisma.tenant.findUnique({ where: { id: tenantId }, select: { id: true, name: true, slug: true, agentProfile: { select: { legalBusinessName: true, verificationStatus: true, reviewReason: true, reviewedAt: true, updatedAt: true } } } });
  }

  async updateProfile(user: AuthUser, input: Record<string, unknown>) {
    const tenantId = await this.requireOwner(user);
    const legalBusinessName = String(input.legalBusinessName ?? '').trim();
    const displayName = String(input.displayName ?? '').trim();
    if (!legalBusinessName || legalBusinessName.length > 180) throw new BadRequestException('Legal business name is required and must be 180 characters or fewer.');
    if (!displayName || displayName.length > 120) throw new BadRequestException('Display name is required and must be 120 characters or fewer.');
    await this.prisma.$transaction([
      this.prisma.tenant.update({ where: { id: tenantId }, data: { name: displayName } }),
      this.prisma.agentProfile.upsert({ where: { tenantId }, update: { legalBusinessName }, create: { tenantId, legalBusinessName } }),
    ]);
    return this.profile(user);
  }

  async team(user: AuthUser) {
    const tenantId = this.tenantId(user); await this.assertTenant(tenantId);
    const [members, invitations] = await Promise.all([
      this.prisma.user.findMany({ where: { tenantId, role: UserRole.TRAVEL_AGENT }, select: { id: true, email: true, fullName: true, organizationRole: true, active: true, lastLoginAt: true, createdAt: true }, orderBy: { createdAt: 'asc' } }),
      this.prisma.vendorTeamInvitation.findMany({ where: { tenantId }, orderBy: { createdAt: 'desc' }, select: { id: true, email: true, role: true, status: true, expiresAt: true, acceptedAt: true, createdAt: true } }),
    ]);
    return { members, invitations };
  }

  async updateMember(user: AuthUser, id: string, input: Record<string, unknown>) {
    const tenantId = await this.requireOwner(user); const updates: { active?: boolean; organizationRole?: any } = {};
    if (typeof input.active === 'boolean') updates.active = input.active;
    if (input.organizationRole !== undefined) {
      const role = String(input.organizationRole).toUpperCase();
      if (!['OWNER', 'CATALOGUE', 'OPERATIONS', 'FINANCE', 'VIEWER'].includes(role)) throw new BadRequestException('Invalid Agent workspace role.');
      if (id === user.sub) throw new BadRequestException('You cannot change your own workspace role.');
      updates.organizationRole = role;
    }
    if (updates.active === undefined && updates.organizationRole === undefined) throw new BadRequestException('Provide active or organizationRole.');
    if (id === user.sub && updates.active === false) throw new BadRequestException('You cannot deactivate your own account.');
    const member = await this.prisma.user.findFirst({ where: { id, tenantId, role: UserRole.TRAVEL_AGENT }, select: { id: true } });
    if (!member) throw new NotFoundException('Team member not found in this Agent workspace.');
    return this.prisma.user.update({ where: { id }, data: updates, select: { id: true, email: true, fullName: true, organizationRole: true, active: true, lastLoginAt: true, createdAt: true } });
  }

  async invite(user: AuthUser, input: Record<string, unknown>) {
    const tenantId = await this.requireOwner(user); const email = String(input.email || '').trim().toLowerCase(); const role = String(input.role || 'VIEWER').toUpperCase();
    if (!/^\S+@\S+\.\S+$/.test(email) || !['OWNER', 'CATALOGUE', 'OPERATIONS', 'FINANCE', 'VIEWER'].includes(role)) throw new BadRequestException('Provide a valid email and Agent workspace role.');
    if (await this.prisma.user.findFirst({ where: { tenantId, email }, select: { id: true } })) throw new BadRequestException('That email already belongs to this Agent workspace.');
    const inviteToken = randomBytes(32).toString('base64url'); const tokenHash = createHash('sha256').update(inviteToken).digest('hex');
    const invitation = await this.prisma.vendorTeamInvitation.upsert({ where: { tenantId_email: { tenantId, email } }, update: { role: role as any, status: 'INVITED', tokenHash, acceptedAt: null, expiresAt: new Date(Date.now() + 7 * 86400000) }, create: { tenantId, email, role: role as any, tokenHash, expiresAt: new Date(Date.now() + 7 * 86400000) } });
    return { id: invitation.id, email: invitation.email, role: invitation.role, status: invitation.status, expiresAt: invitation.expiresAt, inviteToken };
  }

  async updateInvitation(user: AuthUser, id: string, input: Record<string, unknown>) {
    const tenantId = await this.requireOwner(user); const invitation = await this.prisma.vendorTeamInvitation.findFirst({ where: { id, tenantId } });
    if (!invitation) throw new NotFoundException('Invitation not found.');
    const status = String(input.status || '').toUpperCase(); if (!['INVITED', 'ACTIVE', 'DISABLED', 'EXPIRED'].includes(status)) throw new BadRequestException('Invalid invitation status.');
    return this.prisma.vendorTeamInvitation.update({ where: { id }, data: { status }, select: { id: true, email: true, role: true, status: true, expiresAt: true, acceptedAt: true, createdAt: true } });
  }
}
