import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuthUser } from '../common/auth.types';
import { requireTenant } from '../common/tenant';
import { AuditService } from '../audit/audit.service';
import { IngestVendorReviewDto } from './vendor-review.dto';

@Injectable()
export class VendorReviewsService {
  constructor(private readonly prisma: PrismaService, private readonly audit: AuditService) {}

  async ingest(actor: AuthUser, tenantId: string, dto: IngestVendorReviewDto) {
    const product = await this.prisma.product.findFirst({ where: { id: dto.productId, tenantId }, select: { id: true } });
    if (!product) throw new NotFoundException('Product not found in the selected vendor workspace.');
    const reviewedAt = dto.reviewedAt ? new Date(dto.reviewedAt) : new Date();
    const review = await this.prisma.$transaction(async (tx) => {
      const existing = await tx.vendorReview.findUnique({ where: { source_sourceReviewId: { source: dto.source.trim(), sourceReviewId: dto.sourceReviewId.trim() } }, select: { id: true, tenantId: true } });
      if (existing && existing.tenantId !== tenantId) throw new ConflictException('This source review ID is already linked to another vendor.');
      const saved = await tx.vendorReview.upsert({
        where: { source_sourceReviewId: { source: dto.source.trim(), sourceReviewId: dto.sourceReviewId.trim() } },
        create: {
          tenantId,
          productId: product.id,
          source: dto.source.trim(),
          sourceReviewId: dto.sourceReviewId.trim(),
          reviewerName: dto.reviewerName?.trim() || null,
          rating: dto.rating,
          title: dto.title?.trim() || null,
          comment: dto.comment?.trim() || null,
          reviewedAt,
        },
        update: {
          tenantId,
          productId: product.id,
          reviewerName: dto.reviewerName?.trim() || null,
          rating: dto.rating,
          title: dto.title?.trim() || null,
          comment: dto.comment?.trim() || null,
          reviewedAt,
          status: 'PUBLISHED',
        },
      });
      await this.audit.write(tx, { actor, tenantId, action: 'VENDOR_REVIEW_INGESTED', entityType: 'VendorReview', entityId: saved.id, metadata: { source: saved.source, sourceReviewId: saved.sourceReviewId, productId: saved.productId, rating: saved.rating } });
      return saved;
    });
    return review;
  }

  async list(user: AuthUser) {
    const tenantId = requireTenant(user);
    const rows = await this.prisma.vendorReview.findMany({
      where: { tenantId, status: 'PUBLISHED' },
      orderBy: [{ vendorReply: 'asc' }, { reviewedAt: 'desc' }],
      take: 200,
      include: { product: { select: { productCode: true, currentRevision: { select: { productName: true } } } } },
    });
    return rows.map((row) => ({ ...row, rating: Number(row.rating), productName: row.product.currentRevision?.productName || row.product.productCode }));
  }

  async reply(user: AuthUser, id: string, input: string) {
    const tenantId = requireTenant(user);
    const vendorReply = input.trim();
    if (!vendorReply) throw new BadRequestException('Reply cannot be empty.');
    return this.prisma.$transaction(async (tx) => {
      const review = await tx.vendorReview.findFirst({ where: { id, tenantId, status: 'PUBLISHED' }, select: { id: true, vendorReply: true } });
      if (!review) throw new NotFoundException('Review not found in this vendor workspace.');
      const updated = await tx.vendorReview.update({ where: { id }, data: { vendorReply, repliedAt: new Date() } });
      await this.audit.write(tx, { actor: user, tenantId, action: 'VENDOR_REVIEW_REPLIED', entityType: 'VendorReview', entityId: id, beforeState: { vendorReply: review.vendorReply }, afterState: { vendorReply } });
      return updated;
    });
  }
}
