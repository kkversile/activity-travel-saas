import { Injectable, NotFoundException } from '@nestjs/common';
import { AuthUser } from '../common/auth.types';
import { Prisma } from '@prisma/client';
import { mkdir, writeFile } from 'fs/promises';
import { extname, join } from 'path';
import { requireTenant } from '../common/tenant';
import { PrismaService } from '../prisma/prisma.service';
import { UpdateVendorDto } from './update-vendor.dto';

@Injectable()
export class VendorService {
  constructor(private readonly prisma: PrismaService) {}

  async getProfile(user: AuthUser) {
    const tenantId = requireTenant(user);
    const profile = await this.prisma.vendorProfile.findUnique({
      where: { tenantId },
      include: { tenant: { select: { name: true, slug: true } } },
    });
    if (!profile) throw new NotFoundException('Vendor profile not found');
    return profile;
  }

  async updateProfile(user: AuthUser, dto: UpdateVendorDto) {
    const tenantId = requireTenant(user);
    return this.prisma.vendorProfile.update({ where: { tenantId }, data: dto });
  }

  async uploadDocument(user: AuthUser, key: string, fileName: string, dataUrl?: string) {
    const tenantId = requireTenant(user);
    const allowed = ['gstin', 'pan', 'bankProof', 'tradeLicense'];
    if (!allowed.includes(key)) throw new NotFoundException('Unknown document type');
    const profile = await this.prisma.vendorProfile.findUnique({ where: { tenantId } });
    if (!profile) throw new NotFoundException('Vendor profile not found');
    const current = (profile.documentStatus && typeof profile.documentStatus === 'object' ? profile.documentStatus : {}) as Record<string, unknown>;
    const match = dataUrl?.match(/^data:(application\/pdf|image\/(png|jpeg|jpg));base64,([A-Za-z0-9+/=]+)$/);
    if (!match) throw new NotFoundException('A valid PDF or image file is required');
    const extension = extname(fileName).toLowerCase() || (match[1] === 'application/pdf' ? '.pdf' : '.png');
    const safeExtension = ['.pdf', '.png', '.jpg', '.jpeg'].includes(extension) ? extension : '.bin';
    const storedName = `${tenantId}-${key}-${Date.now()}${safeExtension}`;
    const uploadDir = join(process.cwd(), 'public/uploads');
    await mkdir(uploadDir, { recursive: true });
    await writeFile(join(uploadDir, storedName), Buffer.from(match[3], 'base64'));
    const fileUrl = `/api/uploads/${storedName}`;
    const documentStatus = { ...current, [key]: { status: 'PENDING', fileName, fileUrl, uploadedAt: new Date().toISOString() } };
    return this.prisma.vendorProfile.update({ where: { tenantId }, data: { documentStatus: documentStatus as Prisma.InputJsonValue } });
  }
}
