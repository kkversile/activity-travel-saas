import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { FilePurpose, FileVisibility, FulfilmentEvidenceStatus, UserRole, VoucherVersionStatus } from '@prisma/client';
import { AuthUser } from '../common/auth.types';
import { hasPermission } from '../common/permissions';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';

@Injectable()
export class FilesService {
  constructor(private readonly prisma: PrismaService, private readonly storage: StorageService) {}

  async content(user: AuthUser | undefined, id: string, publicOnly = false) {
    const asset: any = await this.prisma.fileAsset.findUnique({ where: { id } });
    if (!asset) throw new NotFoundException('File not found');
    if (publicOnly && asset.visibility !== FileVisibility.PUBLIC) throw new NotFoundException('File not found');
    if (asset.visibility === FileVisibility.PRIVATE) {
      if (!user) throw new ForbiddenException('Authentication is required');
      await this.authorizePrivateAsset(user, asset);
    }
    return { asset, buffer: await this.storage.read(asset.storageKey) };
  }

  private async authorizePrivateAsset(user: AuthUser, asset: any) {
    if (asset.purpose === FilePurpose.VENDOR_DOCUMENT) {
      if (!hasPermission(user, 'document.view') || (asset.tenantId !== user.tenantId && !([UserRole.ADMIN, UserRole.SUB_ADMIN] as UserRole[]).includes(user.role))) throw new ForbiddenException('You cannot access this file');
      if (asset.entityType !== 'VendorDocument' || !asset.entityId) throw new ForbiddenException('Vendor document relationship is invalid');
      return;
    }
    if (asset.purpose === FilePurpose.BOOKING_VOUCHER) {
      if (asset.entityType !== 'VoucherVersion' || !asset.entityId) throw new ForbiddenException('Voucher relationship is invalid');
      const voucher: any = await this.prisma.voucherVersion.findUnique({ where: { id: asset.entityId }, include: { booking: true } });
      if (!voucher) throw new ForbiddenException('Voucher relationship is invalid');
      if (([UserRole.ADMIN, UserRole.SUB_ADMIN] as UserRole[]).includes(user.role)) { if (!hasPermission(user, 'fulfilment.view.admin')) throw new ForbiddenException('You do not have permission to access this voucher'); return; }
      if (user.role === UserRole.VENDOR) { if (!hasPermission(user, 'fulfilment.view.vendor') || voucher.booking.vendorTenantId !== user.tenantId) throw new ForbiddenException('You cannot access this voucher'); return; }
      if (user.role === UserRole.TRAVEL_AGENT) { if (!hasPermission(user, 'fulfilment.view.agent') || voucher.booking.agentTenantId !== user.tenantId || voucher.status !== VoucherVersionStatus.CURRENT || voucher.booking.status === 'CANCELLED') throw new ForbiddenException('You cannot access this voucher'); return; }
      throw new ForbiddenException('You cannot access this voucher');
    }
    if (asset.purpose === FilePurpose.FULFILMENT_DOCUMENT) {
      if (asset.entityType !== 'FulfilmentEvidence' || !asset.entityId) throw new ForbiddenException('Fulfilment evidence relationship is invalid');
      const evidence: any = await this.prisma.fulfilmentEvidence.findUnique({ where: { id: asset.entityId }, include: { fulfilment: { include: { booking: true } } } });
      if (!evidence) throw new ForbiddenException('Fulfilment evidence relationship is invalid');
      const booking = evidence.fulfilment.booking;
      if (([UserRole.ADMIN, UserRole.SUB_ADMIN] as UserRole[]).includes(user.role)) { if (!hasPermission(user, 'fulfilment.view.admin')) throw new ForbiddenException('You do not have permission to access this evidence'); return; }
      if (user.role === UserRole.VENDOR) { if (!hasPermission(user, 'fulfilment.view.vendor') || booking.vendorTenantId !== user.tenantId) throw new ForbiddenException('You cannot access this evidence'); return; }
      if (user.role === UserRole.TRAVEL_AGENT) { if (!hasPermission(user, 'fulfilment.view.agent') || booking.agentTenantId !== user.tenantId || evidence.status !== FulfilmentEvidenceStatus.CURRENT || !evidence.travellerVisible) throw new ForbiddenException('You cannot access this evidence'); return; }
      throw new ForbiddenException('You cannot access this evidence');
    }
    throw new ForbiddenException('Private file purpose is not authorized');
  }
}
