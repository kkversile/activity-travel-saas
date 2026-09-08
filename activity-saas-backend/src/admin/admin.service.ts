import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { ActivityStatus, BookingStatus, Prisma, TenantKind, VendorVerificationStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class AdminService {
  constructor(private readonly prisma: PrismaService) {}
  async dashboard() {
    const [vendors, pendingVendors, activities, reviewActivities, bookings, pendingBookings] = await Promise.all([
      this.prisma.tenant.count({ where: { kind: TenantKind.VENDOR } }),
      this.prisma.vendorProfile.count({ where: { verificationStatus: VendorVerificationStatus.PENDING } }),
      this.prisma.activity.count({ where: { tenant: { kind: TenantKind.VENDOR } } }),
      this.prisma.activity.count({ where: { tenant: { kind: TenantKind.VENDOR }, status: ActivityStatus.UNDER_REVIEW } }),
      this.prisma.booking.count({ where: { tenant: { kind: TenantKind.VENDOR } } }),
      this.prisma.booking.count({ where: { tenant: { kind: TenantKind.VENDOR }, status: BookingStatus.PENDING } }),
    ]);
    return { vendors, pendingVendors, activities, reviewActivities, bookings, pendingBookings };
  }
  vendors() {
    return this.prisma.tenant.findMany({ where: { kind: TenantKind.VENDOR }, include: { vendorProfile: true, users: { select: { email: true, fullName: true, active: true } }, _count: { select: { activities: true, bookings: true, payouts: true } } }, orderBy: { createdAt: 'desc' } });
  }
  async vendor(tenantId: string) {
    const vendor = await this.prisma.tenant.findFirst({ where: { id: tenantId, kind: TenantKind.VENDOR }, include: { vendorProfile: true, users: { select: { email: true, fullName: true, active: true } }, activities: { include: { ratePlans: { select: { id: true, name: true, ratePlanCode: true, status: true } } }, orderBy: { updatedAt: 'desc' } }, _count: { select: { bookings: true, payouts: true } } } });
    if (!vendor) throw new NotFoundException('Vendor not found');
    return vendor;
  }
  async verification(tenantId: string, status: VendorVerificationStatus) {
    if (!Object.values(VendorVerificationStatus).includes(status)) throw new ConflictException('Invalid verification status');
    const profile = await this.prisma.vendorProfile.findUnique({ where: { tenantId } });
    if (!profile) throw new NotFoundException('Vendor profile not found');
    return this.prisma.vendorProfile.update({ where: { tenantId }, data: { verificationStatus: status } });
  }
  async document(tenantId: string, key: string, status: 'VERIFIED' | 'REJECTED' | 'PENDING') {
    const profile = await this.prisma.vendorProfile.findUnique({ where: { tenantId } });
    if (!profile) throw new NotFoundException('Vendor profile not found');
    const allowed = ['gstin', 'pan', 'bankProof', 'tradeLicense']; if (!allowed.includes(key)) throw new NotFoundException('Unknown document type');
    const current = (profile.documentStatus && typeof profile.documentStatus === 'object' ? profile.documentStatus : {}) as Record<string, unknown>;
    const existing = current[key] && typeof current[key] === 'object' ? current[key] as Record<string, unknown> : {};
    return this.prisma.vendorProfile.update({ where: { tenantId }, data: { documentStatus: { ...current, [key]: { ...existing, status, reviewedAt: new Date().toISOString() } } as Prisma.InputJsonValue } });
  }
  activities() {
    return this.prisma.activity.findMany({
      where: { tenant: { kind: TenantKind.VENDOR }, status: { in: [ActivityStatus.DRAFT, ActivityStatus.UNDER_REVIEW] } },
      include: { tenant: { select: { id: true, name: true, vendorProfile: { select: { legalBusinessName: true, verificationStatus: true } } } }, ratePlans: { select: { id: true, name: true, ratePlanCode: true, status: true, basePrice: true } } },
      orderBy: { updatedAt: 'desc' },
    });
  }
  async reviewActivity(id: string, status: ActivityStatus) {
    const activity = await this.prisma.activity.findFirst({ where: { id, tenant: { kind: TenantKind.VENDOR } } });
    if (!activity) throw new NotFoundException('Activity not found');
    return this.prisma.activity.update({ where: { id }, data: { status } });
  }
}
