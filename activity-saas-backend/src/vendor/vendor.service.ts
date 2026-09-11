import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { DocumentReviewStatus, FilePurpose, FileVisibility, Prisma } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { AuthUser } from '../common/auth.types';
import { OutboxService } from '../outbox/outbox.service';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { requireTenant } from '../common/tenant';
import { UpdateVendorDto } from './update-vendor.dto';
import { documentKeyMap, DocumentKey } from './vendor-document.dto';

const profileSelect = {
  id: true, tenantId: true, legalBusinessName: true, operatingCity: true, operatingRegion: true, gstin: true, category: true,
  verificationStatus: true, readinessScore: true, payoutAccountMasked: true, payoutAccountHolder: true, payoutBankName: true,
  payoutBranch: true, payoutIfsc: true, payoutSwift: true, payoutAccountType: true, payoutCurrency: true,
  tenant: { select: { name: true, slug: true, vendorDocuments: { orderBy: { type: 'asc' as const }, include: { versions: { orderBy: { versionNumber: 'desc' as const }, select: { id: true, versionNumber: true, status: true, expiresAt: true, rejectionReason: true, submittedAt: true, reviewedAt: true, fileAsset: { select: { id: true, originalName: true, mimeType: true, sizeBytes: true, visibility: true, purpose: true, createdAt: true } } } } } } } },
} satisfies Prisma.VendorProfileFindUniqueArgs['select'];

export type ValidatedDocumentType = 'application/pdf' | 'image/png' | 'image/jpeg';

export function detectDocumentType(buffer: Buffer): ValidatedDocumentType | null {
  if (buffer.subarray(0, 5).toString('ascii') === '%PDF-') return 'application/pdf';
  if (buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png';
  if (buffer.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff]))) return 'image/jpeg';
  return null;
}

@Injectable()
export class VendorService {
  constructor(private readonly prisma: PrismaService, private readonly storage: StorageService, private readonly audit: AuditService, private readonly outbox: OutboxService) {}
  async getProfile(user: AuthUser) {
    const tenantId = requireTenant(user);
    const profile = await this.prisma.vendorProfile.findUnique({ where: { tenantId }, select: profileSelect });
    if (!profile) throw new NotFoundException('Vendor profile not found');
    return { ...profile, vendorDocuments: profile.tenant.vendorDocuments };
  }
  async updateProfile(user: AuthUser, dto: UpdateVendorDto) {
    const tenantId = requireTenant(user);
    const before = await this.prisma.vendorProfile.findUnique({ where: { tenantId }, select: { legalBusinessName: true, operatingCity: true, operatingRegion: true, gstin: true, category: true, payoutAccountMasked: true, payoutAccountHolder: true, payoutBankName: true, payoutBranch: true, payoutIfsc: true, payoutSwift: true, payoutAccountType: true, payoutCurrency: true } });
    if (!before) throw new NotFoundException('Vendor profile not found');
    await this.prisma.$transaction(async (tx) => { const after = await tx.vendorProfile.update({ where: { tenantId }, data: dto }); await this.audit.write(tx, { actor: user, tenantId, action: 'VENDOR_PROFILE_UPDATED', entityType: 'VendorProfile', entityId: after.id, beforeState: before, afterState: dto }); });
    return this.getProfile(user);
  }
  async uploadDocument(user: AuthUser, key: string, file: { buffer: Buffer; mimetype: string; size: number; originalname: string }) {
    const tenantId = requireTenant(user);
    if (!(key in documentKeyMap)) throw new NotFoundException('Unknown document type');
    if (!file?.buffer?.length) throw new BadRequestException('A non-empty document is required');
    if (!new Set(['application/pdf', 'image/jpeg', 'image/png']).has(file.mimetype)) throw new BadRequestException('Only PDF, JPEG and PNG documents are accepted');
    if (file.size > 8 * 1024 * 1024) throw new BadRequestException('Document exceeds the 8 MB limit');
    const detectedMime = detectDocumentType(file.buffer);
    if (!detectedMime || detectedMime !== file.mimetype) throw new BadRequestException('Document content does not match its claimed MIME type');
    const profile = await this.prisma.vendorProfile.findUnique({ where: { tenantId }, select: { id: true } });
    if (!profile) throw new NotFoundException('Vendor profile not found');
    const extension = detectedMime === 'application/pdf' ? '.pdf' : detectedMime === 'image/png' ? '.png' : '.jpg';
    const saved = await this.storage.save(file.buffer, FilePurpose.VENDOR_DOCUMENT, extension);
    try {
      const result = await this.prisma.$transaction(async (tx) => {
        const type = documentKeyMap[key as DocumentKey];
        const asset = await tx.fileAsset.create({ data: { tenantId, storageKey: saved.storageKey, originalName: file.originalname, mimeType: file.mimetype, sizeBytes: file.size, visibility: FileVisibility.PRIVATE, purpose: FilePurpose.VENDOR_DOCUMENT, entityType: 'VendorDocument', createdById: user.sub } });
        const doc = await tx.vendorDocument.upsert({ where: { tenantId_type: { tenantId, type } }, update: { currentStatus: DocumentReviewStatus.PENDING }, create: { tenantId, type } });
        const latest = await tx.vendorDocumentVersion.findFirst({ where: { vendorDocumentId: doc.id }, orderBy: { versionNumber: 'desc' }, select: { versionNumber: true } });
        const version = await tx.vendorDocumentVersion.create({ data: { vendorDocumentId: doc.id, versionNumber: (latest?.versionNumber ?? 0) + 1, fileAssetId: asset.id, status: DocumentReviewStatus.PENDING, createdById: user.sub } });
        await this.audit.write(tx, { actor: user, tenantId, action: 'VENDOR_DOCUMENT_SUBMITTED', entityType: 'VendorDocumentVersion', entityId: version.id, metadata: { documentType: type, versionNumber: version.versionNumber, fileAssetId: asset.id } });
        await this.outbox.enqueue(tx, { tenantId, eventType: 'VENDOR_DOCUMENT_SUBMITTED', aggregateType: 'VendorDocument', aggregateId: doc.id, payload: { documentType: type, versionId: version.id } });
        return version;
      });
      return { id: result.id, documentType: documentKeyMap[key as DocumentKey], versionNumber: result.versionNumber, status: result.status, fileName: file.originalname };
    } catch (error) { await this.storage.remove(saved.storageKey); throw error; }
  }
}
