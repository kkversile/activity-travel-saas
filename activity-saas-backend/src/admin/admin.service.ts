import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { AgentVerificationStatus, BookingStatus, DocumentReviewStatus, Prisma, ProductRevisionStatus, TenantKind, VendorVerificationStatus } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { AuthUser } from '../common/auth.types';
import { OutboxService } from '../outbox/outbox.service';
import { PrismaService } from '../prisma/prisma.service';
import { Optional } from '@nestjs/common';
import { ChannelMappingService } from '../distribution/channel-mapping.service';

const profileSelect = { id: true, tenantId: true, legalBusinessName: true, operatingCity: true, operatingRegion: true, gstin: true, category: true, verificationStatus: true, readinessScore: true, payoutAccountMasked: true, payoutAccountHolder: true, payoutBankName: true, payoutBranch: true, payoutIfsc: true, payoutSwift: true, payoutAccountType: true, payoutCurrency: true } satisfies Prisma.VendorProfileSelect;
const documentsInclude = { vendorDocuments: { include: { versions: { orderBy: { versionNumber: 'desc' as const }, include: { fileAsset: { select: { id: true, originalName: true, mimeType: true, sizeBytes: true, visibility: true, purpose: true } } } } } } };

@Injectable()
export class AdminService {
  constructor(private readonly prisma: PrismaService, private readonly audit: AuditService, private readonly outbox: OutboxService, @Optional() private readonly distributionMappings?: ChannelMappingService) {}

  agents() { return this.prisma.tenant.findMany({ where: { kind: TenantKind.TRAVEL_AGENT }, include: { agentProfile: true, users: { select: { id: true, email: true, fullName: true, active: true, organizationRole: true } } }, orderBy: { createdAt: 'desc' } }); }
  async approveAgent(actor: AuthUser, tenantId: string) { return this.setAgentVerification(actor, tenantId, AgentVerificationStatus.APPROVED); }
  async suspendAgent(actor: AuthUser, tenantId: string, reason: string) { return this.setAgentVerification(actor, tenantId, AgentVerificationStatus.SUSPENDED, reason); }
  private async setAgentVerification(actor: AuthUser, tenantId: string, status: AgentVerificationStatus, reason?: string) {
    if (status === AgentVerificationStatus.SUSPENDED && !reason?.trim()) throw new ConflictException('A reason is required when suspending an agent');
    const tenant = await this.prisma.tenant.findFirst({ where: { id: tenantId, kind: TenantKind.TRAVEL_AGENT }, include: { agentProfile: true } });
    if (!tenant) throw new NotFoundException('Travel Agent tenant not found');
    return this.prisma.$transaction(async (tx) => {
      const profile = await tx.agentProfile.upsert({ where: { tenantId }, update: { verificationStatus: status, reviewReason: reason?.trim() || null, reviewedAt: new Date(), reviewedById: actor.sub }, create: { tenantId, legalBusinessName: tenant.name, verificationStatus: status, reviewReason: reason?.trim() || null, reviewedAt: new Date(), reviewedById: actor.sub } });
      const eventType = status === AgentVerificationStatus.APPROVED ? 'AGENT_APPROVED' : 'AGENT_SUSPENDED';
      await this.audit.write(tx, { actor, tenantId, action: eventType, entityType: 'AgentProfile', entityId: profile.id, reason, beforeState: tenant.agentProfile, afterState: { verificationStatus: status } });
      await this.outbox.enqueue(tx, { tenantId, eventType, aggregateType: 'AgentProfile', aggregateId: profile.id, payload: { status, reason: reason?.trim() || null } });
      return profile;
    });
  }

  async setRatePlanChannel(actor: AuthUser, ratePlanId: string, enabled: boolean) {
    if (!this.distributionMappings) throw new ConflictException('Distribution mapping service is unavailable');
    const channel = await this.prisma.distributionChannel.upsert({ where: { code: 'VOYA_AGENT' }, update: { active: true, type: 'INTERNAL_MARKETPLACE' }, create: { code: 'VOYA_AGENT', name: 'Voya Travel Agent Marketplace', type: 'INTERNAL_MARKETPLACE' } });
    const plan = await this.prisma.ratePlan.findUnique({ where: { id: ratePlanId }, include: { variant: { include: { product: true } } } });
    if (!plan) throw new NotFoundException('Rate plan not found');
    const productCurrent = await this.prisma.productChannelMapping.findUnique({ where: { channelId_productId: { channelId: channel.id, productId: plan.variant.product.id } }, select: { version: true } });
    await this.distributionMappings.product(actor, { channelId: channel.id, productId: plan.variant.product.id, externalProductCode: plan.variant.product.productCode, status: 'ACTIVE' as any, ...(productCurrent ? { expectedVersion: productCurrent.version } : {}) });
    const variantCurrent = await this.prisma.variantChannelMapping.findUnique({ where: { channelId_variantId: { channelId: channel.id, variantId: plan.variant.id } }, select: { version: true } });
    await this.distributionMappings.variant(actor, { channelId: channel.id, variantId: plan.variant.id, externalVariantCode: plan.variant.variantCode, status: 'ACTIVE' as any, ...(variantCurrent ? { expectedVersion: variantCurrent.version } : {}) });
    const current = await this.prisma.ratePlanChannelMapping.findUnique({ where: { ratePlanId_channelId: { ratePlanId, channelId: channel.id } } });
    const mapping = await this.distributionMappings.rate(actor, { channelId: channel.id, ratePlanId, externalRatePlanCode: current?.externalRatePlanCode || plan.ratePlanCode, status: enabled ? 'ACTIVE' as any : 'DISABLED' as any, ...(current ? { expectedVersion: current.version } : {}) });
    return { ...mapping, enabled: mapping.status === 'ACTIVE' };
  }
  async dashboard() { const [vendors, pendingVendors, products, reviewProducts, bookings, pendingBookings] = await Promise.all([this.prisma.tenant.count({ where: { kind: TenantKind.VENDOR } }), this.prisma.vendorProfile.count({ where: { verificationStatus: VendorVerificationStatus.PENDING } }), this.prisma.product.count({ where: { tenant: { kind: TenantKind.VENDOR } } }), this.prisma.productRevision.count({ where: { product: { tenant: { kind: TenantKind.VENDOR } }, status: ProductRevisionStatus.UNDER_REVIEW } }), this.prisma.booking.count({ where: { vendorTenant: { kind: TenantKind.VENDOR } } }), this.prisma.booking.count({ where: { vendorTenant: { kind: TenantKind.VENDOR }, status: BookingStatus.PENDING } })]); return { vendors, pendingVendors, products, listings: products, reviewProducts, reviewActivities: reviewProducts, bookings, pendingBookings }; }
  vendors() { return this.prisma.tenant.findMany({ where: { kind: TenantKind.VENDOR }, include: { ...documentsInclude, vendorProfile: { select: profileSelect }, users: { select: { email: true, fullName: true, active: true } }, _count: { select: { products: true, vendorBookings: true, payouts: true } } }, orderBy: { createdAt: 'desc' } }); }
  async vendor(tenantId: string) { const vendor = await this.prisma.tenant.findFirst({ where: { id: tenantId, kind: TenantKind.VENDOR }, include: { ...documentsInclude, vendorProfile: { select: profileSelect }, users: { select: { email: true, fullName: true, active: true } }, products: { include: { currentRevision: true, variants: { include: { ratePlans: true } } }, orderBy: { updatedAt: 'desc' } }, _count: { select: { vendorBookings: true, payouts: true } } } }); if (!vendor) throw new NotFoundException('Vendor not found'); return vendor; }
  async verification(actor: AuthUser, tenantId: string, status: VendorVerificationStatus, reason?: string) {
    if (status !== VendorVerificationStatus.VERIFIED && status !== VendorVerificationStatus.SUSPENDED) throw new ConflictException('Only VERIFIED or SUSPENDED vendor verification actions are allowed');
    if (status === VendorVerificationStatus.SUSPENDED && !reason?.trim()) throw new ConflictException('A reason is required when suspending a vendor');
    const before = await this.prisma.vendorProfile.findUnique({ where: { tenantId }, select: { id: true, verificationStatus: true } });
    if (!before) throw new NotFoundException('Vendor profile not found');
    await this.prisma.$transaction(async (tx) => { const after = await tx.vendorProfile.update({ where: { tenantId }, data: { verificationStatus: status } }); await this.audit.write(tx, { actor, tenantId, action: status === VendorVerificationStatus.VERIFIED ? 'VENDOR_VERIFIED' : 'VENDOR_SUSPENDED', entityType: 'VendorProfile', entityId: after.id, reason, beforeState: before, afterState: { verificationStatus: status } }); await this.outbox.enqueue(tx, { tenantId, eventType: status === VendorVerificationStatus.VERIFIED ? 'VENDOR_VERIFIED' : 'VENDOR_SUSPENDED', aggregateType: 'VendorProfile', aggregateId: after.id, payload: { status, reason: reason?.trim() || null } }); });
    return this.vendor(tenantId);
  }
  async document(actor: AuthUser, tenantId: string, versionId: string, status: DocumentReviewStatus, reason?: string) {
    if (!new Set<DocumentReviewStatus>([DocumentReviewStatus.VERIFIED, DocumentReviewStatus.REJECTED, DocumentReviewStatus.EXPIRED]).has(status)) throw new ConflictException('Invalid document review status');
    if (new Set<DocumentReviewStatus>([DocumentReviewStatus.REJECTED, DocumentReviewStatus.EXPIRED]).has(status) && !reason?.trim()) throw new ConflictException('A reason is required for a negative document decision');
    await this.prisma.$transaction(async (tx) => {
      const version = await tx.vendorDocumentVersion.findFirst({
        where: { id: versionId, vendorDocument: { tenantId } },
        include: { vendorDocument: { include: { versions: { orderBy: { versionNumber: 'desc' }, take: 1 } } } },
      });
      if (!version) throw new NotFoundException('Document version not found');
      const latest = version.vendorDocument.versions[0];
      if (!latest || latest.id !== versionId || version.versionNumber !== latest.versionNumber) throw new ConflictException('Only the latest document version can be reviewed');
      if (version.status !== DocumentReviewStatus.PENDING) throw new ConflictException(`Document version is already ${version.status}`);
      const changed = await tx.vendorDocumentVersion.updateMany({ where: { id: versionId, status: DocumentReviewStatus.PENDING }, data: { status, rejectionReason: status === DocumentReviewStatus.REJECTED ? reason!.trim() : null, reviewedAt: new Date(), reviewedById: actor.sub } });
      if (changed.count !== 1) throw new ConflictException('Document version changed in another session; reload and retry');
      await tx.vendorDocument.update({ where: { id: version.vendorDocumentId }, data: { currentStatus: status } });
      const action = status === DocumentReviewStatus.VERIFIED ? 'VENDOR_DOCUMENT_VERIFIED' : status === DocumentReviewStatus.EXPIRED ? 'VENDOR_DOCUMENT_EXPIRED' : 'VENDOR_DOCUMENT_REJECTED';
      const eventType = status === DocumentReviewStatus.VERIFIED ? 'VENDOR_DOCUMENT_VERIFIED' : status === DocumentReviewStatus.EXPIRED ? 'VENDOR_DOCUMENT_EXPIRED' : 'VENDOR_DOCUMENT_REJECTED';
      await this.audit.write(tx, { actor, tenantId, action, entityType: 'VendorDocumentVersion', entityId: versionId, reason, beforeState: { status: version.status }, afterState: { status, versionNumber: version.versionNumber } });
      await this.outbox.enqueue(tx, { tenantId, eventType, aggregateType: 'VendorDocument', aggregateId: version.vendorDocumentId, payload: { versionId, versionNumber: version.versionNumber, status, reason: reason?.trim() || null } });
    });
    return this.vendor(tenantId);
  }
}
