import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { FilePurpose, FileVisibility } from '@prisma/client';
import { AuthUser } from '../common/auth.types';
import { hasPermission } from '../common/permissions';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';

@Injectable()
export class FilesService {
  constructor(private readonly prisma: PrismaService, private readonly storage: StorageService) {}
  async content(user: AuthUser | undefined, id: string, publicOnly = false) {
    const asset = await this.prisma.fileAsset.findUnique({ where: { id } });
    if (!asset) throw new NotFoundException('File not found');
    if (publicOnly && asset.visibility !== FileVisibility.PUBLIC) throw new NotFoundException('File not found');
    if (asset.visibility === FileVisibility.PRIVATE) {
      if (!user) throw new ForbiddenException('Authentication is required');
      const permission = asset.purpose === FilePurpose.VENDOR_DOCUMENT ? 'document.view' : asset.purpose === FilePurpose.BOOKING_VOUCHER ? 'booking.view' : null;
      if (!permission) throw new ForbiddenException('Private file purpose is not authorized');
      if (!hasPermission(user, permission)) throw new ForbiddenException('You do not have permission to access this file');
      if (asset.tenantId !== user.tenantId && user.role !== 'ADMIN' && user.role !== 'SUB_ADMIN') throw new ForbiddenException('You cannot access this file');
      if (asset.purpose === FilePurpose.VENDOR_DOCUMENT && (asset.entityType !== 'VendorDocument' || !asset.entityId)) throw new ForbiddenException('Vendor document relationship is invalid');
      if (asset.purpose === FilePurpose.BOOKING_VOUCHER && (asset.entityType !== 'Booking' || !asset.entityId)) throw new ForbiddenException('Booking voucher relationship is invalid');
      if (asset.purpose === FilePurpose.BOOKING_VOUCHER) {
        const bookingWhere: { id: string; tenantId?: string } = { id: asset.entityId! };
        if (user.role !== 'ADMIN' && user.role !== 'SUB_ADMIN') {
          if (!user.tenantId) throw new ForbiddenException('Tenant context is required');
          bookingWhere.tenantId = user.tenantId;
        }
        const booking = await this.prisma.booking.findFirst({ where: bookingWhere, select: { id: true } });
        if (!booking) throw new ForbiddenException('Booking voucher relationship is invalid');
      }
    } else if (asset.visibility !== FileVisibility.PUBLIC && publicOnly) {
      throw new NotFoundException('File not found');
    }
    return { asset, buffer: await this.storage.read(asset.storageKey) };
  }
}
