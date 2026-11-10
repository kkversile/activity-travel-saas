import { ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { AgentCommercialChangeStatus, AgentVerificationStatus, AgentWalletCreditApprovalStatus, BookingStatus, DocumentReviewStatus, PayoutStatus, PlatformCouponStatus, Prisma, ProductRevisionStatus, ProductStatus, RefundStatus, SupplierCommercialModel, TenantKind, UserRole, VendorCommercialChangeStatus, VendorVerificationStatus } from '@prisma/client';
import { hash } from 'bcryptjs';
import { randomBytes } from 'crypto';
import { AuditService } from '../audit/audit.service';
import { AuthUser } from '../common/auth.types';
import { OutboxService } from '../outbox/outbox.service';
import { PrismaService } from '../prisma/prisma.service';
import { Optional } from '@nestjs/common';
import { ChannelMappingService } from '../distribution/channel-mapping.service';
import { ChannelDistributionReadinessService } from '../distribution/channel-distribution-readiness.service';
import { defaultVisitorPricingSettings, normalizeVisitorPricingSettings, VISITOR_PRICING_SETTINGS_KEY, VisitorPricingSettings } from '../common/visitor-pricing-settings';
import { ACTIVITY_CONTENT_SETTINGS_KEY, ActivityContentSettings, defaultActivityContentSettings, normalizeActivityContentSettings } from '../common/activity-content-settings';
import { VENDOR_VERIFICATION_SETTINGS_KEY, VendorVerificationSettings, defaultVendorVerificationSettings, normalizeVendorVerificationSettings } from '../common/mobile-verification-settings';
import { PublicEntity, allocatePublicCode, allocateVendorVoucherShortCode, ensurePublicIdentifier, publicIdentifier, publicIdentifierMap } from '../common/public-identifiers';
import { summarizeVendorCommercialTerms, summarizeVendorMetrics } from './vendor-metrics';

const profileSelect = { id: true, tenantId: true, legalBusinessName: true, operatingCity: true, operatingRegion: true, supplierType: true, accountManagerName: true, defaultSupplierModel: true, defaultSupplierCommissionPercent: true, voucherShortCode: true, gstin: true, category: true, verificationStatus: true, readinessScore: true, payoutAccountMasked: true, payoutAccountHolder: true, payoutBankName: true, payoutBranch: true, payoutIfsc: true, payoutSwift: true, payoutAccountType: true, payoutCurrency: true } satisfies Prisma.VendorProfileSelect;
const documentsInclude = { vendorDocuments: { include: { versions: { orderBy: { versionNumber: 'desc' as const }, include: { fileAsset: { select: { id: true, originalName: true, mimeType: true, sizeBytes: true, visibility: true, purpose: true } } } } } } };
const AGENT_TIERS_SETTING_KEY = 'admin.agent-tiers';
const AGENT_TIERS_PENDING_SETTING_KEY = 'admin.agent-tiers.pending';
const defaultAgentTiers = [
  { name: 'Silver', threshold: 'Up to ₹5 L', commissionPercent: 5, creditLimit: 50000, creditDays: 7 },
  { name: 'Gold', threshold: '₹5 L – ₹25 L', commissionPercent: 7, creditLimit: 200000, creditDays: 15 },
  { name: 'Platinum', threshold: 'Above ₹25 L', commissionPercent: 9, creditLimit: 1000000, creditDays: 30 },
];

@Injectable()
export class AdminService {
  constructor(private readonly prisma: PrismaService, private readonly audit: AuditService, private readonly outbox: OutboxService, @Optional() private readonly distributionMappings?: ChannelMappingService, @Optional() private readonly distributionReadiness?: ChannelDistributionReadinessService) {}

  private assertSuperAdmin(actor: AuthUser) {
    if (actor.role !== UserRole.SUPER_ADMIN)
      throw new ForbiddenException('Only a Super Admin can manage platform accounts');
  }

  async commercialGuardrails() {
    const row = await this.prisma.commercialGuardrailConfiguration.findUniqueOrThrow({ where: { id: 'default' } });
    return { ...row, minimumNetMarginPercent: Number(row.minimumNetMarginPercent), websiteGatewayFeePercent: Number(row.websiteGatewayFeePercent) };
  }

  async submitCommercialGuardrails(actor: AuthUser, input: { minimumNetMarginPercent: number; websiteGatewayFeePercent: number; expectedVersion: number }) {
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "CommercialGuardrailConfiguration" WHERE "id" = 'default' FOR UPDATE`;
      const current = await tx.commercialGuardrailConfiguration.findUniqueOrThrow({ where: { id: 'default' } });
      if (current.version !== input.expectedVersion) throw new ConflictException('COMMERCIAL_GUARDRAIL_VERSION_MISMATCH');
      if (current.pendingConfiguration) throw new ConflictException('COMMERCIAL_GUARDRAIL_CHANGE_PENDING');
      const configuration = { minimumNetMarginPercent: Number(input.minimumNetMarginPercent), websiteGatewayFeePercent: Number(input.websiteGatewayFeePercent) };
      const pending = await tx.commercialGuardrailConfiguration.update({
        where: { id: 'default' },
        data: { pendingConfiguration: configuration, pendingUpdatedById: actor.sub, pendingUpdatedAt: new Date() },
      });
      await this.audit.write(tx, { actor, action: 'COMMERCIAL_GUARDRAILS_SUBMITTED', entityType: 'CommercialGuardrailConfiguration', entityId: 'default', beforeState: { minimumNetMarginPercent: Number(current.minimumNetMarginPercent), websiteGatewayFeePercent: Number(current.websiteGatewayFeePercent), version: current.version }, afterState: { pendingConfiguration: configuration, submittedById: actor.sub } });
      return { ...pending, minimumNetMarginPercent: Number(pending.minimumNetMarginPercent), websiteGatewayFeePercent: Number(pending.websiteGatewayFeePercent) };
    });
  }

  async approveCommercialGuardrails(actor: AuthUser) {
    if (actor.role !== UserRole.SUPER_ADMIN) throw new ForbiddenException('Only a Super Admin can approve commercial guardrails');
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "CommercialGuardrailConfiguration" WHERE "id" = 'default' FOR UPDATE`;
      const current = await tx.commercialGuardrailConfiguration.findUniqueOrThrow({ where: { id: 'default' } });
      if (!current.pendingConfiguration) throw new ConflictException('No commercial-guardrail proposal is awaiting approval');
      if (current.pendingUpdatedById === actor.sub) throw new ConflictException('A different Super Admin must approve this commercial-guardrail change');
      const configuration = current.pendingConfiguration as { minimumNetMarginPercent: number; websiteGatewayFeePercent: number };
      const updated = await tx.commercialGuardrailConfiguration.update({
        where: { id: 'default' },
        data: { ...configuration, version: { increment: 1 }, updatedById: actor.sub, pendingConfiguration: Prisma.DbNull, pendingUpdatedById: null, pendingUpdatedAt: null },
      });
      await this.audit.write(tx, { actor, action: 'COMMERCIAL_GUARDRAILS_APPROVED', entityType: 'CommercialGuardrailConfiguration', entityId: 'default', beforeState: { minimumNetMarginPercent: Number(current.minimumNetMarginPercent), websiteGatewayFeePercent: Number(current.websiteGatewayFeePercent), pendingConfiguration: configuration, version: current.version }, afterState: { minimumNetMarginPercent: Number(updated.minimumNetMarginPercent), websiteGatewayFeePercent: Number(updated.websiteGatewayFeePercent), version: updated.version } });
      return { ...updated, minimumNetMarginPercent: Number(updated.minimumNetMarginPercent), websiteGatewayFeePercent: Number(updated.websiteGatewayFeePercent) };
    });
  }

  async visitorPricingSettings() {
    const setting = await this.prisma.globalSetting.findFirst({ where: { tenantId: null, key: VISITOR_PRICING_SETTINGS_KEY }, select: { value: true, updatedAt: true, adminId: true } });
    return { ...normalizeVisitorPricingSettings(setting?.value || defaultVisitorPricingSettings), updatedAt: setting?.updatedAt || null, updatedById: setting?.adminId || null };
  }

  async updateVisitorPricingSettings(actor: AuthUser, input: Partial<VisitorPricingSettings>) {
    const before = await this.prisma.globalSetting.findFirst({ where: { tenantId: null, key: VISITOR_PRICING_SETTINGS_KEY }, select: { id: true, value: true } });
    const next = normalizeVisitorPricingSettings({ ...normalizeVisitorPricingSettings(before?.value), ...input });
    const setting = await this.prisma.$transaction(async (tx) => {
      const saved = before
        ? await tx.globalSetting.update({ where: { id: before.id }, data: { value: next, adminId: actor.sub }, select: { value: true, updatedAt: true, adminId: true } })
        : await tx.globalSetting.create({ data: { tenantId: null, adminId: actor.sub, key: VISITOR_PRICING_SETTINGS_KEY, value: next }, select: { value: true, updatedAt: true, adminId: true } });
      await this.audit.write(tx, { actor, action: 'VISITOR_PRICING_SETTINGS_UPDATED', entityType: 'GlobalSetting', entityId: before?.id || VISITOR_PRICING_SETTINGS_KEY, beforeState: normalizeVisitorPricingSettings(before?.value), afterState: next });
      return saved;
    });
    return { ...normalizeVisitorPricingSettings(setting.value), updatedAt: setting.updatedAt, updatedById: setting.adminId };
  }

  async vendorVerificationSettings() {
    const setting = await this.prisma.globalSetting.findFirst({ where: { tenantId: null, key: VENDOR_VERIFICATION_SETTINGS_KEY }, select: { value: true, updatedAt: true, adminId: true } });
    return { ...normalizeVendorVerificationSettings(setting?.value || defaultVendorVerificationSettings), updatedAt: setting?.updatedAt || null, updatedById: setting?.adminId || null };
  }

  async updateVendorVerificationSettings(actor: AuthUser, input: Partial<VendorVerificationSettings>) {
    const before = await this.prisma.globalSetting.findFirst({ where: { tenantId: null, key: VENDOR_VERIFICATION_SETTINGS_KEY }, select: { id: true, value: true } });
    const next = normalizeVendorVerificationSettings({ ...normalizeVendorVerificationSettings(before?.value), ...input });
    const setting = await this.prisma.$transaction(async (tx) => {
      const saved = before
        ? await tx.globalSetting.update({ where: { id: before.id }, data: { value: next, adminId: actor.sub }, select: { value: true, updatedAt: true, adminId: true } })
        : await tx.globalSetting.create({ data: { tenantId: null, adminId: actor.sub, key: VENDOR_VERIFICATION_SETTINGS_KEY, value: next }, select: { value: true, updatedAt: true, adminId: true } });
      await this.audit.write(tx, { actor, action: 'VENDOR_VERIFICATION_SETTINGS_UPDATED', entityType: 'GlobalSetting', entityId: before?.id || VENDOR_VERIFICATION_SETTINGS_KEY, beforeState: normalizeVendorVerificationSettings(before?.value), afterState: next });
      return saved;
    });
    return { ...normalizeVendorVerificationSettings(setting.value), updatedAt: setting.updatedAt, updatedById: setting.adminId };
  }

  async activityContentSettings() {
    const setting = await this.prisma.globalSetting.findFirst({ where: { tenantId: null, key: ACTIVITY_CONTENT_SETTINGS_KEY }, select: { value: true, updatedAt: true, adminId: true } });
    return { ...normalizeActivityContentSettings(setting?.value || defaultActivityContentSettings), updatedAt: setting?.updatedAt || null, updatedById: setting?.adminId || null };
  }

  async configurationOverview() {
    const [categories, subcategories, products, variants, cancellationRules, taxRules, channels, scheduleExceptions, content] = await Promise.all([
      this.prisma.activityCategory.count({ where: { active: true } }),
      this.prisma.activitySubcategory.count({ where: { active: true } }),
      this.prisma.productRevision.findMany({ select: { cityName: true } }),
      this.prisma.productVariant.findMany({ select: { pointsOfInterest: true } }),
      this.prisma.cancellationRule.count(),
      this.prisma.commercialRule.count({ where: { kind: 'TAX' as any, archivedAt: null } }),
      this.prisma.distributionChannel.count({ where: { active: true } }),
      this.prisma.scheduleException.count(),
      this.activityContentSettings(),
    ]);
    const cities = new Set(products.map((row) => row.cityName).filter(Boolean)).size;
    const pois = new Set(variants.flatMap((row) => row.pointsOfInterest || []).filter(Boolean)).size;
    return [
      { key: 'categories', title: 'Categories & tags', detail: `${categories} categories · ${subcategories} active subcategories`, route: '/admin/products' },
      { key: 'cities', title: 'Cities & POIs', detail: `${cities} cities · ${pois} linked points of interest`, route: '/admin/products' },
      { key: 'cancellation', title: 'Cancellation templates', detail: `${cancellationRules} persisted cancellation rules`, route: '/admin/settings' },
      { key: 'rejection', title: 'Rejection reasons', detail: 'Recorded through approval and audit decisions', route: '/admin/approvals' },
      { key: 'documents', title: 'Document rules', detail: 'Vendor KYC and licence requirements are managed in onboarding', route: '/admin/vendors' },
      { key: 'agents', title: 'Agent tiers', detail: 'Tier thresholds, commission and credit defaults', route: '/admin/agents' },
      { key: 'tax', title: 'Tax settings', detail: `${taxRules} active tax pricing rules`, route: '/admin/commercial' },
      { key: 'gateway', title: 'Payment gateway', detail: 'Collection mode and base currency', route: '/admin/settlements' },
      { key: 'notifications', title: 'Notification templates', detail: 'Operational notifications are recorded by workflow services', route: '/admin/developer-notes' },
      { key: 'api', title: 'API partners', detail: `${channels} active distribution channels`, route: '/admin/developer-notes' },
      { key: 'content', title: 'Content guidelines', detail: `${content.terms.length} default terms · ${content.howToRedeem.length} redemption instructions`, route: '/admin/settings' },
      { key: 'blackouts', title: 'Holidays & blackouts', detail: `${scheduleExceptions} persisted schedule exceptions`, route: '/admin/products' },
    ];
  }

  async updateActivityContentSettings(actor: AuthUser, input: Partial<ActivityContentSettings>) {
    const before = await this.prisma.globalSetting.findFirst({ where: { tenantId: null, key: ACTIVITY_CONTENT_SETTINGS_KEY }, select: { id: true, value: true } });
    const current = normalizeActivityContentSettings(before?.value || defaultActivityContentSettings);
    const next = normalizeActivityContentSettings({ ...current, ...input });
    const setting = await this.prisma.$transaction(async (tx) => {
      const saved = before
        ? await tx.globalSetting.update({ where: { id: before.id }, data: { value: next, adminId: actor.sub }, select: { value: true, updatedAt: true, adminId: true } })
        : await tx.globalSetting.create({ data: { tenantId: null, adminId: actor.sub, key: ACTIVITY_CONTENT_SETTINGS_KEY, value: next }, select: { value: true, updatedAt: true, adminId: true } });
      await this.audit.write(tx, { actor, action: 'ACTIVITY_CONTENT_SETTINGS_UPDATED', entityType: 'GlobalSetting', entityId: before?.id || ACTIVITY_CONTENT_SETTINGS_KEY, beforeState: current, afterState: next });
      return saved;
    });
    return { ...normalizeActivityContentSettings(setting.value), updatedAt: setting.updatedAt, updatedById: setting.adminId };
  }

  async platformAdmins() {
    const rows = await this.prisma.user.findMany({ where: { role: UserRole.ADMIN }, select: { id: true, email: true, fullName: true, role: true, active: true, createdAt: true, updatedAt: true }, orderBy: { createdAt: 'asc' } });
    const codes = await publicIdentifierMap(this.prisma, PublicEntity.USER, rows.map((row) => row.id));
    return rows.map((row) => ({ ...row, publicCode: codes.get(row.id) || null }));
  }

  async auditLog(input: { action?: string; entityType?: string; limit?: string }) {
    const parsedLimit = Number(input.limit);
    const take = Number.isInteger(parsedLimit) ? Math.min(Math.max(parsedLimit, 1), 200) : 100;
    const rows = await this.prisma.auditLog.findMany({
      where: {
        ...(input.action?.trim() ? { action: { contains: input.action.trim(), mode: 'insensitive' } } : {}),
        ...(input.entityType?.trim() ? { entityType: { contains: input.entityType.trim(), mode: 'insensitive' } } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take,
      select: { id: true, tenantId: true, actorId: true, actorRole: true, action: true, entityType: true, entityId: true, reason: true, beforeState: true, afterState: true, metadata: true, correlationId: true, createdAt: true },
    });
    const codes = await publicIdentifierMap(this.prisma, PublicEntity.AUDIT_EVENT, rows.map((row) => row.id));
    return rows.map((row) => ({ ...row, publicCode: codes.get(row.id) || null }));
  }

  async promotions() {
    const rows = await this.prisma.promotion.findMany({ include: { product: { include: { currentRevision: { select: { productName: true } }, tenant: { select: { id: true, name: true, vendorProfile: { select: { legalBusinessName: true } } } } } } }, orderBy: [{ active: 'desc' }, { startsAt: 'desc' }] });
    const codes = await publicIdentifierMap(this.prisma, PublicEntity.PROMOTION, rows.map((row) => row.id));
    return Promise.all(rows.map(async (row) => {
      const bookings = row.startsAt && row.endsAt ? await this.prisma.bookingEconomicsSnapshot.count({ where: { promotionAmount: { gt: 0 }, booking: { productId: row.productId, createdAt: { gte: row.startsAt, lte: row.endsAt } } } }) : 0;
      return { id: row.id, publicCode: codes.get(row.id) || null, name: row.name, productId: row.productId, productName: row.product.currentRevision?.productName || row.product.productCode, productCode: row.product.productCode, vendorTenantId: row.product.tenant.id, vendorName: row.product.tenant.vendorProfile?.legalBusinessName || row.product.tenant.name, promotionType: row.promotionType, discountPercent: Number(row.discountPercent), discountAmount: row.discountAmount == null ? null : Number(row.discountAmount), startsAt: row.startsAt, endsAt: row.endsAt, bookingStartsAt: row.bookingStartsAt, bookingEndsAt: row.bookingEndsAt, validWeekdays: row.validWeekdays, stackWithPlatform: row.stackWithPlatform, fundingOwner: row.fundingOwner, maxDiscountedBookings: row.maxDiscountedBookings, bookings, active: row.active, draft: row.draft };
    }));
  }

  async createPromotion(actor: AuthUser, input: Record<string, unknown>) {
    const productId = String(input.productId || ''); const name = String(input.name || '').trim(); const promotionType = String(input.promotionType || 'PERCENTAGE_OFF').toUpperCase(); const discountPercent = Number(input.discountPercent || 0); const discountAmount = input.discountAmount == null || input.discountAmount === '' ? null : Number(input.discountAmount); const startsAt = new Date(String(input.startsAt || '')); const endsAt = new Date(String(input.endsAt || '')); const validWeekdays = Array.isArray(input.validWeekdays) ? input.validWeekdays.map(String) : [];
    if (!productId || !name || !['PERCENTAGE_OFF', 'FLAT_OFF', 'EARLY_BIRD', 'LAST_MINUTE', 'GROUP_DISCOUNT'].includes(promotionType) || (promotionType === 'FLAT_OFF' ? (!Number.isFinite(discountAmount) || (discountAmount as number) <= 0) : (!Number.isFinite(discountPercent) || discountPercent <= 0 || discountPercent > 100)) || Number.isNaN(startsAt.getTime()) || Number.isNaN(endsAt.getTime()) || endsAt <= startsAt || validWeekdays.some((day) => !['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'].includes(day))) throw new ConflictException('Provide a valid promotion type, discount, date window and weekdays.');
    const product = await this.prisma.product.findUnique({ where: { id: productId }, select: { id: true, tenantId: true } }); if (!product) throw new NotFoundException('Product not found.');
    const overlap = await this.prisma.promotion.findFirst({ where: { productId, active: true, startsAt: { lt: endsAt }, endsAt: { gt: startsAt } }, select: { id: true } }); if (overlap) throw new ConflictException('An active promotion already overlaps this product and date window.');
    return this.prisma.$transaction(async (tx) => { const row = await tx.promotion.create({ data: { productId, name, promotionType, discountPercent: promotionType === 'FLAT_OFF' ? 0 : discountPercent, discountAmount, startsAt, endsAt, validWeekdays, stackWithPlatform: Boolean(input.stackWithPlatform), fundingOwner: String(input.fundingOwner || 'SUPPLIER'), maxDiscountedBookings: input.maxDiscountedBookings ? Number(input.maxDiscountedBookings) : undefined } }); const publicCode = await allocatePublicCode(tx, PublicEntity.PROMOTION, 'PRM-', 4); await ensurePublicIdentifier(tx, PublicEntity.PROMOTION, row.id, publicCode); await this.audit.write(tx, { actor, tenantId: product.tenantId, action: 'ADMIN_PROMOTION_CREATED', entityType: 'Promotion', entityId: row.id, afterState: { publicCode, productId, name, promotionType, discountPercent, discountAmount, startsAt, endsAt } }); return { ...row, publicCode }; });
  }

  async updatePromotion(actor: AuthUser, id: string, input: Record<string, unknown>) {
    const existing = await this.prisma.promotion.findUnique({ where: { id }, select: { id: true, active: true, product: { select: { tenantId: true } } } }); if (!existing) throw new NotFoundException('Promotion not found.');
    const active = typeof input.active === 'boolean' ? input.active : existing.active;
    return this.prisma.$transaction(async (tx) => { const row = await tx.promotion.update({ where: { id }, data: { active } }); const publicCode = await publicIdentifier(tx, PublicEntity.PROMOTION, id); await this.audit.write(tx, { actor, tenantId: existing.product.tenantId, action: active ? 'ADMIN_PROMOTION_ACTIVATED' : 'ADMIN_PROMOTION_PAUSED', entityType: 'Promotion', entityId: id, beforeState: { active: existing.active }, afterState: { publicCode, active: row.active } }); return { id: row.id, publicCode, active: row.active }; });
  }

  platformCoupons() {
    return this.prisma.platformCoupon.findMany({ orderBy: [{ status: 'asc' }, { startsAt: 'desc' }] }).then(async (rows) => { const codes = await publicIdentifierMap(this.prisma, PublicEntity.PLATFORM_COUPON, rows.map((row) => row.id)); return rows.map((row) => ({ ...row, publicCode: codes.get(row.id) || null, bookings: row.redeemedCount })); });
  }

  async createPlatformCoupon(actor: AuthUser, input: { code: string; name: string; discountType: string; discountValue: string; startsAt: string; endsAt: string; maxRedemptions?: number }) {
    const code = input.code.trim().toUpperCase(); const name = input.name.trim(); const discountType = input.discountType.trim().toUpperCase(); const discountValue = Number(input.discountValue); const startsAt = new Date(input.startsAt); const endsAt = new Date(input.endsAt);
    if (!/^[A-Z0-9_-]{3,40}$/.test(code) || !name || !['PERCENT', 'FIXED'].includes(discountType) || !Number.isFinite(discountValue) || discountValue <= 0 || (discountType === 'PERCENT' && discountValue > 100) || Number.isNaN(startsAt.getTime()) || Number.isNaN(endsAt.getTime()) || endsAt <= startsAt) throw new ConflictException('Provide a valid coupon code, discount and date window.');
    return this.prisma.$transaction(async (tx) => { const row = await tx.platformCoupon.create({ data: { code, name, discountType, discountValue, startsAt, endsAt, maxRedemptions: input.maxRedemptions ?? null, createdById: actor.sub } }); const publicCode = await allocatePublicCode(tx, PublicEntity.PLATFORM_COUPON, 'CPN-', 4); await ensurePublicIdentifier(tx, PublicEntity.PLATFORM_COUPON, row.id, publicCode); await this.audit.write(tx, { actor, action: 'PLATFORM_COUPON_CREATED', entityType: 'PlatformCoupon', entityId: row.id, afterState: { publicCode, code, name, discountType, discountValue, startsAt, endsAt, status: row.status } }); return { ...row, publicCode }; });
  }

  async decidePlatformCoupon(actor: AuthUser, id: string, decision: 'APPROVE' | 'REJECT', reason?: string) {
    const existing = await this.prisma.platformCoupon.findUnique({ where: { id } }); if (!existing) throw new NotFoundException('Platform coupon not found.');
    if (existing.status !== PlatformCouponStatus.PENDING_APPROVAL) throw new ConflictException(`Coupon is already ${existing.status}.`);
    if (decision === 'REJECT' && !reason?.trim()) throw new ConflictException('A rejection reason is required.');
    if (decision === 'APPROVE' && existing.createdById === actor.sub) throw new ConflictException('A second Admin must approve a coupon created by this account.');
    return this.prisma.$transaction(async (tx) => { const row = await tx.platformCoupon.update({ where: { id }, data: { status: decision === 'APPROVE' ? PlatformCouponStatus.ACTIVE : PlatformCouponStatus.REJECTED, approvedById: decision === 'APPROVE' ? actor.sub : null, decisionReason: reason?.trim() || null } }); const publicCode = await publicIdentifier(tx, PublicEntity.PLATFORM_COUPON, id); await this.audit.write(tx, { actor, action: decision === 'APPROVE' ? 'PLATFORM_COUPON_APPROVED' : 'PLATFORM_COUPON_REJECTED', entityType: 'PlatformCoupon', entityId: id, beforeState: { status: existing.status }, afterState: { publicCode, status: row.status, reason: row.decisionReason } }); return { ...row, publicCode }; });
  }

  async setPlatformCouponStatus(actor: AuthUser, id: string, status: 'ACTIVE' | 'PAUSED') {
    const existing = await this.prisma.platformCoupon.findUnique({ where: { id }, select: { id: true, status: true } }); if (!existing) throw new NotFoundException('Platform coupon not found.');
    if (status === 'PAUSED' && existing.status !== PlatformCouponStatus.ACTIVE) throw new ConflictException('Only an active coupon can be paused.');
    return this.prisma.$transaction(async (tx) => { const row = await tx.platformCoupon.update({ where: { id }, data: { status } }); const publicCode = await publicIdentifier(tx, PublicEntity.PLATFORM_COUPON, id); await this.audit.write(tx, { actor, action: status === 'ACTIVE' ? 'PLATFORM_COUPON_ACTIVATED' : 'PLATFORM_COUPON_PAUSED', entityType: 'PlatformCoupon', entityId: id, beforeState: existing, afterState: { ...row, publicCode } }); return { ...row, publicCode }; });
  }

  async impersonationTargets() {
    const rows = await this.prisma.user.findMany({
      where: { active: true, role: { in: [UserRole.ADMIN, UserRole.VENDOR, UserRole.TRAVEL_AGENT] } },
      select: { id: true, email: true, fullName: true, role: true, tenantId: true, organizationRole: true, active: true, createdAt: true },
      orderBy: [{ role: 'asc' }, { fullName: 'asc' }],
    });
    const codes = await publicIdentifierMap(this.prisma, PublicEntity.USER, rows.map((row) => row.id));
    return rows.map((row) => ({ ...row, publicCode: codes.get(row.id) || null }));
  }

  async createAdmin(actor: AuthUser, input: { fullName: string; email: string; password: string }) {
    this.assertSuperAdmin(actor);
    const fullName = input.fullName.trim();
    const email = input.email.trim().toLowerCase();
    if (email === actor.email.toLowerCase()) throw new ConflictException('This account is already the signed-in Super Admin');
    if (await this.prisma.user.findUnique({ where: { email }, select: { id: true } })) throw new ConflictException('An account with this email already exists');
    const passwordHash = await hash(input.password, 10);
    const created = await this.prisma.$transaction(async (tx) => {
      const user = await tx.user.create({ data: { email, passwordHash, fullName, role: UserRole.ADMIN, tenantId: null, organizationRole: null, active: true, mustChangePassword: true }, select: { id: true, email: true, fullName: true, role: true, active: true, createdAt: true, updatedAt: true } });
      await ensurePublicIdentifier(tx, PublicEntity.USER, user.id, await allocatePublicCode(tx, PublicEntity.USER, 'STF-', 4));
      await this.audit.write(tx, { actor, action: 'ADMIN_CREATED', entityType: 'User', entityId: user.id, afterState: { email: user.email, fullName: user.fullName, role: user.role, active: user.active } });
      await this.outbox.enqueue(tx, { eventType: 'ADMIN_CREATED', aggregateType: 'User', aggregateId: user.id, payload: { email: user.email, role: user.role } });
      return user;
    });
    return { ...created, publicCode: await publicIdentifier(this.prisma, PublicEntity.USER, created.id) };
  }

  async createVendor(actor: AuthUser, input: { vendorName: string; ownerName?: string; cityName?: string; mobile?: string; supplierType?: string; email: string; commercialModel?: string; commissionPercent?: number; accountManagerName?: string }) {
    const vendorName = input.vendorName.trim();
    const ownerName = input.ownerName?.trim() || vendorName;
    const cityName = input.cityName?.trim() || 'Not set';
    const email = input.email.trim().toLowerCase();
    const commissionPercent = input.commissionPercent == null ? null : Number(input.commissionPercent);
    if (commissionPercent != null && (!Number.isFinite(commissionPercent) || commissionPercent < 0 || commissionPercent > 100)) throw new ConflictException('Commission must be between 0 and 100 percent');
    if (input.commercialModel === 'COMMISSIONABLE' && commissionPercent == null) throw new ConflictException('Commission percent is required for a commission model');
    if (await this.prisma.user.findUnique({ where: { email }, select: { id: true } })) throw new ConflictException('An account with this email already exists');
    const passwordHash = await hash(randomBytes(32).toString('base64url'), 10);
    const slugBase = vendorName.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase() || 'vendor';
    const created = await this.prisma.$transaction(async (tx) => {
      const tenant = await tx.tenant.create({ data: { name: vendorName, slug: `${slugBase}-${Date.now().toString(36)}`, kind: TenantKind.VENDOR } });
      await ensurePublicIdentifier(tx, PublicEntity.VENDOR, tenant.id, await allocatePublicCode(tx, PublicEntity.VENDOR, 'SUP-', 4));
      const user = await tx.user.create({ data: { tenantId: tenant.id, email, passwordHash, fullName: ownerName, role: UserRole.VENDOR, organizationRole: 'OWNER', active: true, mustChangePassword: true }, select: { id: true, email: true, fullName: true, role: true, tenantId: true, active: true } });
      await ensurePublicIdentifier(tx, PublicEntity.USER, user.id, await allocatePublicCode(tx, PublicEntity.USER, 'VU-', 5));
      await tx.vendorProfile.create({ data: { tenantId: tenant.id, legalBusinessName: vendorName, operatingCity: cityName, operatingRegion: cityName, registrationMobile: input.mobile?.trim() || null, supplierType: input.supplierType || null, accountManagerName: input.accountManagerName?.trim() || null, defaultSupplierModel: input.commercialModel as any, defaultSupplierCommissionPercent: commissionPercent, voucherShortCode: await allocateVendorVoucherShortCode(tx) } });
      await this.audit.write(tx, { actor, tenantId: tenant.id, action: 'VENDOR_CREATED', entityType: 'User', entityId: user.id, afterState: { email: user.email, fullName: user.fullName, role: user.role, tenantId: tenant.id, active: user.active } });
      await this.outbox.enqueue(tx, { tenantId: tenant.id, eventType: 'VENDOR_CREATED', aggregateType: 'User', aggregateId: user.id, payload: { email: user.email, role: user.role } });
      return { ...user, vendorName };
    });
    return { ...created, inviteRequired: true };
  }

  async setAdminStatus(actor: AuthUser, id: string, active: boolean) {
    this.assertSuperAdmin(actor);
    const before = await this.prisma.user.findFirst({ where: { id, role: UserRole.ADMIN }, select: { id: true, email: true, fullName: true, role: true, active: true } });
    if (!before) throw new NotFoundException('Admin account not found');
    const updated = await this.prisma.$transaction(async (tx) => {
      const user = await tx.user.update({ where: { id }, data: { active }, select: { id: true, email: true, fullName: true, role: true, active: true, createdAt: true, updatedAt: true } });
      await this.audit.write(tx, { actor, action: active ? 'ADMIN_ACTIVATED' : 'ADMIN_DEACTIVATED', entityType: 'User', entityId: user.id, beforeState: before, afterState: { email: user.email, fullName: user.fullName, role: user.role, active: user.active } });
      await this.outbox.enqueue(tx, { eventType: active ? 'ADMIN_ACTIVATED' : 'ADMIN_DEACTIVATED', aggregateType: 'User', aggregateId: user.id, payload: { email: user.email, role: user.role, active } });
      return user;
    });
    return updated;
  }

  async resetAdminPassword(actor: AuthUser, id: string, password: string) {
    this.assertSuperAdmin(actor);
    const before = await this.prisma.user.findFirst({ where: { id, role: UserRole.ADMIN }, select: { id: true, email: true, fullName: true, role: true, active: true } });
    if (!before) throw new NotFoundException('Admin account not found');
    const passwordHash = await hash(password, 10);
    return this.prisma.$transaction(async (tx) => {
      const user = await tx.user.update({ where: { id }, data: { passwordHash, mustChangePassword: true }, select: { id: true, email: true, fullName: true, role: true, active: true, createdAt: true, updatedAt: true } });
      await this.audit.write(tx, { actor, action: 'ADMIN_PASSWORD_RESET', entityType: 'User', entityId: user.id, beforeState: { email: before.email, fullName: before.fullName, role: before.role, active: before.active }, afterState: { email: user.email, fullName: user.fullName, role: user.role, active: user.active } });
      await this.outbox.enqueue(tx, { eventType: 'ADMIN_PASSWORD_RESET', aggregateType: 'User', aggregateId: user.id, payload: { email: user.email, role: user.role } });
      return user;
    });
  }

  async resetManagedUserPassword(actor: AuthUser, id: string, password: string) {
    this.assertSuperAdmin(actor);
    const before = await this.prisma.user.findFirst({ where: { id, role: { in: [UserRole.VENDOR, UserRole.TRAVEL_AGENT] } }, select: { id: true, email: true, fullName: true, role: true, active: true, tenantId: true } });
    if (!before) throw new NotFoundException('Vendor or Travel Agent account not found');
    const passwordHash = await hash(password, 10);
    const action = before.role === UserRole.VENDOR ? 'VENDOR_PASSWORD_RESET' : 'TRAVEL_AGENT_PASSWORD_RESET';
    return this.prisma.$transaction(async (tx) => {
      const user = await tx.user.update({ where: { id }, data: { passwordHash, mustChangePassword: true }, select: { id: true, email: true, fullName: true, role: true, tenantId: true, active: true, createdAt: true, updatedAt: true } });
      await this.audit.write(tx, { actor, tenantId: user.tenantId || undefined, action, entityType: 'User', entityId: user.id, beforeState: before, afterState: { email: user.email, fullName: user.fullName, role: user.role, tenantId: user.tenantId, active: user.active, mustChangePassword: true } });
      await this.outbox.enqueue(tx, { tenantId: user.tenantId || undefined, eventType: action, aggregateType: 'User', aggregateId: user.id, payload: { email: user.email, role: user.role, tenantId: user.tenantId } });
      return user;
    });
  }

  async agentTiers() {
    const setting = await this.prisma.globalSetting.findFirst({ where: { tenantId: null, key: AGENT_TIERS_SETTING_KEY }, select: { value: true, updatedAt: true, adminId: true } });
    return { tiers: Array.isArray((setting?.value as any)?.tiers) ? (setting?.value as any).tiers : defaultAgentTiers, updatedAt: setting?.updatedAt || null, updatedById: setting?.adminId || null };
  }

  async updateAgentTiers(actor: AuthUser, tiers: unknown, reasonInput: string) {
    if (!Array.isArray(tiers) || !tiers.length || tiers.some((tier) => !tier || typeof tier !== 'object' || !String((tier as any).name || '').trim() || !Number.isFinite(Number((tier as any).commissionPercent)) || Number((tier as any).commissionPercent) < 0 || Number((tier as any).commissionPercent) > 100 || !Number.isFinite(Number((tier as any).creditLimit)) || Number((tier as any).creditLimit) < 0 || !Number.isInteger(Number((tier as any).creditDays)) || Number((tier as any).creditDays) < 0)) throw new ConflictException('Provide valid agent tier commission, credit limit and credit days.');
    const reason = reasonInput?.trim();
    if (!reason || reason.length < 5 || reason.length > 500) throw new ConflictException('Provide a reason between 5 and 500 characters.');
    const next = { tiers: tiers.map((tier: any) => ({ name: String(tier.name).trim(), threshold: String(tier.threshold || '').trim(), commissionPercent: Number(tier.commissionPercent), creditLimit: Number(tier.creditLimit), creditDays: Number(tier.creditDays) })) };
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext('agent-tier-defaults'))::text AS locked`;
      const pending = await tx.globalSetting.findFirst({ where: { tenantId: null, key: AGENT_TIERS_PENDING_SETTING_KEY }, select: { id: true } });
      if (pending) throw new ConflictException('Agent tier defaults already have a pending approval.');
      const request = await tx.globalSetting.create({ data: { key: AGENT_TIERS_PENDING_SETTING_KEY, value: { ...next, reason }, adminId: actor.sub } });
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext('public-identifiers:APPROVAL'))::text AS locked`;
      const publicCode = await allocatePublicCode(tx, PublicEntity.APPROVAL, 'APR-', 6);
      await ensurePublicIdentifier(tx, PublicEntity.APPROVAL, `AGENT_TIER_DEFAULTS:${request.id}`, publicCode);
      await this.audit.write(tx, { actor, action: 'AGENT_TIER_DEFAULTS_REQUESTED', entityType: 'GlobalSetting', entityId: request.id, reason, afterState: { ...next, status: 'PENDING' } });
      return { id: request.id, publicCode, tiers: next.tiers, status: 'PENDING', requestedById: actor.sub };
    });
  }

  async approveAgentTiers(actor: AuthUser, requestId: string) {
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "GlobalSetting" WHERE "id" = ${requestId} FOR UPDATE`;
      const pending = await tx.globalSetting.findFirst({ where: { id: requestId, tenantId: null, key: AGENT_TIERS_PENDING_SETTING_KEY } });
      if (!pending) throw new NotFoundException('Agent tier change request not found');
      if (pending.adminId === actor.sub) throw new ConflictException('AGENT_TIER_MAKER_CANNOT_APPROVE');
      const active = await tx.globalSetting.findFirst({ where: { tenantId: null, key: AGENT_TIERS_SETTING_KEY }, select: { id: true, value: true } });
      const saved = active ? await tx.globalSetting.update({ where: { id: active.id }, data: { value: (pending.value as any).tiers, adminId: actor.sub } }) : await tx.globalSetting.create({ data: { key: AGENT_TIERS_SETTING_KEY, value: (pending.value as any).tiers, adminId: actor.sub } });
      await tx.globalSetting.update({ where: { id: requestId }, data: { key: `admin.agent-tiers.change.${requestId}`, value: { ...(pending.value as any), status: 'APPROVED', reviewedById: actor.sub, reviewedAt: new Date().toISOString() }, adminId: actor.sub } });
      await this.audit.write(tx, { actor, action: 'AGENT_TIER_DEFAULTS_APPROVED', entityType: 'GlobalSetting', entityId: requestId, reason: (pending.value as any).reason, beforeState: active?.value || { tiers: defaultAgentTiers }, afterState: { tiers: (pending.value as any).tiers } });
      return { tiers: saved.value, updatedAt: saved.updatedAt, updatedById: saved.adminId };
    });
  }

  async rejectAgentTiers(actor: AuthUser, requestId: string, reasonInput: string) {
    const reason = reasonInput?.trim();
    if (!reason || reason.length < 3 || reason.length > 500) throw new ConflictException('A rejection reason between 3 and 500 characters is required.');
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "GlobalSetting" WHERE "id" = ${requestId} FOR UPDATE`;
      const pending = await tx.globalSetting.findFirst({ where: { id: requestId, tenantId: null, key: AGENT_TIERS_PENDING_SETTING_KEY } });
      if (!pending) throw new NotFoundException('Agent tier change request not found');
      if (pending.adminId === actor.sub) throw new ConflictException('AGENT_TIER_MAKER_CANNOT_REJECT');
      await tx.globalSetting.update({ where: { id: requestId }, data: { key: `admin.agent-tiers.change.${requestId}`, value: { ...(pending.value as any), status: 'REJECTED', reviewReason: reason, reviewedById: actor.sub, reviewedAt: new Date().toISOString() }, adminId: actor.sub } });
      await this.audit.write(tx, { actor, action: 'AGENT_TIER_DEFAULTS_REJECTED', entityType: 'GlobalSetting', entityId: requestId, reason, beforeState: { tiers: (pending.value as any).tiers, requestedById: pending.adminId }, afterState: { status: 'REJECTED' } });
      return { id: requestId, status: 'REJECTED' };
    });
  }

  async agents() {
    const now = new Date(); const since = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const agents = await this.prisma.tenant.findMany({ where: { kind: TenantKind.TRAVEL_AGENT }, include: { agentProfile: true, agentCommercialProfile: true, users: { select: { id: true, email: true, fullName: true, active: true, organizationRole: true } } }, orderBy: { createdAt: 'desc' } });
    const publicCodes = await publicIdentifierMap(this.prisma, PublicEntity.AGENT, agents.map((agent) => agent.id));
    return Promise.all(agents.map(async (agent) => {
      const stats = await this.prisma.booking.aggregate({ where: { agentTenantId: agent.id, createdAt: { gte: since } }, _count: { _all: true }, _sum: { amount: true } });
      return { ...agent, publicCode: publicCodes.get(agent.id) || null, agentCommercialProfile: agent.agentCommercialProfile || null, bookings30d: stats._count._all, gmv30d: Number(stats._sum.amount || 0) };
    }));
  }

  async updateAgentCommercials(actor: AuthUser, tenantId: string, input: { tier?: string; commissionPercent?: number; creditLimit?: number; creditDays?: number; markupAllowedPercent?: number; reason: string }) {
    const tenant = await this.prisma.tenant.findFirst({ where: { id: tenantId, kind: TenantKind.TRAVEL_AGENT }, select: { id: true, name: true } });
    if (!tenant) throw new NotFoundException('Travel Agent tenant not found');
    const reason = input.reason?.trim();
    if (!reason || reason.length < 5 || reason.length > 500) throw new ConflictException('Provide a reason between 5 and 500 characters.');
    const data = { ...(input.tier !== undefined ? { tier: String(input.tier).trim() } : {}), ...(input.commissionPercent !== undefined ? { commissionPercent: Number(input.commissionPercent) } : {}), ...(input.creditLimit !== undefined ? { creditLimit: Number(input.creditLimit) } : {}), ...(input.creditDays !== undefined ? { creditDays: Number(input.creditDays) } : {}), ...(input.markupAllowedPercent !== undefined ? { markupAllowedPercent: Number(input.markupAllowedPercent) } : {}) };
    if (!Object.keys(data).length || Object.values(data).some((value) => value === '' || (typeof value === 'number' && (!Number.isFinite(value) || value < 0))) || (data.commissionPercent !== undefined && data.commissionPercent > 100) || (data.markupAllowedPercent !== undefined && data.markupAllowedPercent > 100) || (data.creditDays !== undefined && !Number.isInteger(data.creditDays))) throw new ConflictException('Agent commercial values must be valid; percentages must be 0–100 and credit days a whole number.');
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "Tenant" WHERE "id" = ${tenantId} FOR UPDATE`;
      const pending = await tx.agentCommercialChangeRequest.findFirst({ where: { tenantId, status: AgentCommercialChangeStatus.PENDING }, select: { id: true } });
      if (pending) throw new ConflictException('An agent commercial change is already awaiting approval.');
      const request = await tx.agentCommercialChangeRequest.create({ data: { tenantId, proposedConfiguration: data, requestReason: reason, createdById: actor.sub } });
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext('public-identifiers:APPROVAL'))::text AS locked`;
      const publicCode = await allocatePublicCode(tx, PublicEntity.APPROVAL, 'APR-', 6);
      await ensurePublicIdentifier(tx, PublicEntity.APPROVAL, `AGENT_COMMERCIAL:${request.id}`, publicCode);
      await this.audit.write(tx, { actor, tenantId, action: 'AGENT_COMMERCIAL_CHANGE_REQUESTED', entityType: 'AgentCommercialChangeRequest', entityId: request.id, reason, afterState: { proposedConfiguration: data, status: request.status } });
      return { ...request, publicCode };
    });
  }

  async approveAgentCommercialChange(actor: AuthUser, requestId: string) {
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "AgentCommercialChangeRequest" WHERE "id" = ${requestId} FOR UPDATE`;
      const request = await tx.agentCommercialChangeRequest.findUnique({ where: { id: requestId }, include: { tenant: { select: { id: true, kind: true } } } });
      if (!request) throw new NotFoundException('Agent commercial change request not found');
      if (request.status !== AgentCommercialChangeStatus.PENDING) throw new ConflictException('AGENT_COMMERCIAL_CHANGE_NOT_PENDING');
      if (request.createdById === actor.sub) throw new ConflictException('AGENT_COMMERCIAL_MAKER_CANNOT_APPROVE');
      if (request.tenant.kind !== TenantKind.TRAVEL_AGENT) throw new ConflictException('AGENT_COMMERCIAL_TENANT_NOT_AGENT');
      const data = request.proposedConfiguration as Prisma.AgentCommercialProfileUncheckedUpdateInput;
      const before = await tx.agentCommercialProfile.findUnique({ where: { tenantId: request.tenantId } });
      const proposed = request.proposedConfiguration as Record<string, string | number>;
      const profile = await tx.agentCommercialProfile.upsert({ where: { tenantId: request.tenantId }, update: data, create: { tenantId: request.tenantId, ...proposed } as Prisma.AgentCommercialProfileUncheckedCreateInput });
      const reviewed = await tx.agentCommercialChangeRequest.update({ where: { id: request.id }, data: { status: AgentCommercialChangeStatus.APPROVED, reviewedById: actor.sub, reviewedAt: new Date() } });
      await this.audit.write(tx, { actor, tenantId: request.tenantId, action: 'AGENT_COMMERCIAL_CHANGE_APPROVED', entityType: 'AgentCommercialChangeRequest', entityId: request.id, reason: request.requestReason, beforeState: before, afterState: { status: reviewed.status, proposedConfiguration: data, profile } });
      return { ...reviewed, profile };
    });
  }

  async rejectAgentCommercialChange(actor: AuthUser, requestId: string, reason: string) {
    const trimmed = reason?.trim();
    if (!trimmed || trimmed.length < 3 || trimmed.length > 500) throw new ConflictException('A rejection reason between 3 and 500 characters is required.');
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "AgentCommercialChangeRequest" WHERE "id" = ${requestId} FOR UPDATE`;
      const request = await tx.agentCommercialChangeRequest.findUnique({ where: { id: requestId } });
      if (!request) throw new NotFoundException('Agent commercial change request not found');
      if (request.status !== AgentCommercialChangeStatus.PENDING) throw new ConflictException('AGENT_COMMERCIAL_CHANGE_NOT_PENDING');
      if (request.createdById === actor.sub) throw new ConflictException('AGENT_COMMERCIAL_MAKER_CANNOT_REJECT');
      const reviewed = await tx.agentCommercialChangeRequest.update({ where: { id: request.id }, data: { status: AgentCommercialChangeStatus.REJECTED, reviewedById: actor.sub, reviewedAt: new Date(), reviewReason: trimmed } });
      await this.audit.write(tx, { actor, tenantId: request.tenantId, action: 'AGENT_COMMERCIAL_CHANGE_REJECTED', entityType: 'AgentCommercialChangeRequest', entityId: request.id, reason: trimmed, beforeState: { status: request.status }, afterState: { status: reviewed.status, reason: trimmed } });
      return reviewed;
    });
  }

  async creditAgentWallet(actor: AuthUser, tenantId: string, amountInput: number, reason: string, reference?: string, paymentMethod?: string) {
    const amount = Number(amountInput);
    if (!Number.isFinite(amount) || amount <= 0 || Math.round(amount * 100) !== amount * 100 || !reason?.trim()) throw new ConflictException('A positive amount with at most two decimal places and a reason are required for a wallet credit.');
    const normalizedPaymentMethod = String(paymentMethod || 'MANUAL').trim().toUpperCase();
    if (!['MANUAL', 'UPI', 'NEFT', 'IMPS', 'BANK_TRANSFER', 'CHEQUE'].includes(normalizedPaymentMethod)) throw new ConflictException('Unsupported wallet payment method.');
    const tenant = await this.prisma.tenant.findFirst({ where: { id: tenantId, kind: TenantKind.TRAVEL_AGENT }, select: { id: true } });
    if (!tenant) throw new NotFoundException('Travel Agent tenant not found');
    return this.prisma.$transaction(async (tx) => {
      const request = await tx.agentWalletCreditApprovalRequest.create({ data: { agentTenantId: tenantId, amount, paymentMethod: normalizedPaymentMethod, reference: reference?.trim() || null, reason: reason.trim(), requestedById: actor.sub } });
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext('public-identifiers:APPROVAL'))::text AS locked`;
      const publicCode = await allocatePublicCode(tx, PublicEntity.APPROVAL, 'APR-', 6);
      await ensurePublicIdentifier(tx, PublicEntity.APPROVAL, `AGENT_WALLET_CREDIT:${request.id}`, publicCode);
      await this.audit.write(tx, { actor, tenantId, action: 'AGENT_WALLET_CREDIT_REQUESTED', entityType: 'AgentWalletCreditApprovalRequest', entityId: request.id, reason: reason.trim(), afterState: { amount, paymentMethod: normalizedPaymentMethod, reference: request.reference, status: request.status } });
      return { ...request, publicCode };
    });
  }

  async approveAgentWalletCredit(actor: AuthUser, requestId: string) {
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "AgentWalletCreditApprovalRequest" WHERE "id" = ${requestId} FOR UPDATE`;
      const request = await tx.agentWalletCreditApprovalRequest.findUnique({ where: { id: requestId }, include: { agentTenant: { select: { id: true, kind: true } } } });
      if (!request) throw new NotFoundException('Wallet credit request not found');
      if (request.status !== AgentWalletCreditApprovalStatus.PENDING) throw new ConflictException('WALLET_CREDIT_REQUEST_NOT_PENDING');
      if (request.requestedById === actor.sub) throw new ConflictException('WALLET_CREDIT_MAKER_CANNOT_APPROVE');
      if (request.agentTenant.kind !== TenantKind.TRAVEL_AGENT) throw new ConflictException('WALLET_CREDIT_TENANT_NOT_AGENT');
      const amount = Number(request.amount);
      const profile = await tx.agentCommercialProfile.upsert({ where: { tenantId: request.agentTenantId }, update: { walletBalance: { increment: amount } }, create: { tenantId: request.agentTenantId, walletBalance: amount } });
      const ledger = await tx.agentWalletLedger.create({ data: { agentTenantId: request.agentTenantId, entryType: 'MANUAL_CREDIT', paymentMethod: request.paymentMethod, amount, balanceAfter: profile.walletBalance, reason: request.reason, reference: request.reference, createdById: request.requestedById } });
      const reviewed = await tx.agentWalletCreditApprovalRequest.update({ where: { id: request.id }, data: { status: AgentWalletCreditApprovalStatus.APPROVED, reviewedById: actor.sub, reviewedAt: new Date(), ledgerEntryId: ledger.id } });
      await ensurePublicIdentifier(tx, PublicEntity.WALLET_LEDGER, ledger.id, await allocatePublicCode(tx, PublicEntity.WALLET_LEDGER, 'WL-', 7));
      await this.audit.write(tx, { actor, tenantId: request.agentTenantId, action: 'AGENT_WALLET_CREDIT_APPROVED', entityType: 'AgentWalletCreditApprovalRequest', entityId: request.id, reason: request.reason, beforeState: { status: request.status }, afterState: { status: reviewed.status, ledgerEntryId: ledger.id, walletBalance: profile.walletBalance } });
      return { ...reviewed, ledger: { ...ledger, publicCode: await publicIdentifier(tx, PublicEntity.WALLET_LEDGER, ledger.id) }, profile };
    });
  }

  async rejectAgentWalletCredit(actor: AuthUser, requestId: string, reason: string) {
    const trimmed = reason?.trim();
    if (!trimmed) throw new ConflictException('A rejection reason is required.');
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "AgentWalletCreditApprovalRequest" WHERE "id" = ${requestId} FOR UPDATE`;
      const request = await tx.agentWalletCreditApprovalRequest.findUnique({ where: { id: requestId } });
      if (!request) throw new NotFoundException('Wallet credit request not found');
      if (request.status !== AgentWalletCreditApprovalStatus.PENDING) throw new ConflictException('WALLET_CREDIT_REQUEST_NOT_PENDING');
      if (request.requestedById === actor.sub) throw new ConflictException('WALLET_CREDIT_MAKER_CANNOT_REJECT');
      const reviewed = await tx.agentWalletCreditApprovalRequest.update({ where: { id: request.id }, data: { status: AgentWalletCreditApprovalStatus.REJECTED, reviewedById: actor.sub, reviewedAt: new Date(), reviewReason: trimmed } });
      await this.audit.write(tx, { actor, tenantId: request.agentTenantId, action: 'AGENT_WALLET_CREDIT_REJECTED', entityType: 'AgentWalletCreditApprovalRequest', entityId: request.id, reason: trimmed, beforeState: { status: request.status }, afterState: { status: reviewed.status, reason: trimmed } });
      return reviewed;
    });
  }

  async agentWalletLedger() {
    const rows = await this.prisma.agentWalletLedger.findMany({
      include: { agentTenant: { select: { id: true, name: true } } },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
    const codes = await publicIdentifierMap(this.prisma, PublicEntity.WALLET_LEDGER, rows.map((row) => row.id));
    return rows.map((row) => ({ ...row, publicCode: codes.get(row.id) || null }));
  }
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
  async dashboard(period = '30d') {
    const now = new Date();
    const since = period === 'month' ? new Date(now.getFullYear(), now.getMonth(), 1) : period === 'fy' ? new Date(now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1, 3, 1) : new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const periodLabel = period === 'month' ? 'this month' : period === 'fy' ? 'FY to date' : 'last 30 days';
    const [vendors, pendingVendors, products, reviewProducts, bookings, pendingBookings, recentBookings, pendingAgents, pendingRefunds, readyPayouts] = await Promise.all([
      this.prisma.tenant.count({ where: { kind: TenantKind.VENDOR } }),
      this.prisma.vendorProfile.count({ where: { verificationStatus: VendorVerificationStatus.PENDING } }),
      this.prisma.product.count({ where: { tenant: { kind: TenantKind.VENDOR }, deletedAt: null } }),
      this.prisma.productRevision.count({ where: { product: { tenant: { kind: TenantKind.VENDOR }, deletedAt: null }, status: ProductRevisionStatus.UNDER_REVIEW } }),
      this.prisma.booking.count({ where: { vendorTenant: { kind: TenantKind.VENDOR } } }),
      this.prisma.booking.count({ where: { vendorTenant: { kind: TenantKind.VENDOR }, status: BookingStatus.PENDING } }),
      this.prisma.booking.findMany({ where: { vendorTenant: { kind: TenantKind.VENDOR }, createdAt: { gte: since } }, select: { amount: true, channel: true, economicsSnapshot: { select: { voyaRevenue: true } }, product: { select: { currentRevision: { select: { type: true, starRating: true } } } }, vendorTenant: { select: { id: true, name: true, vendorProfile: { select: { legalBusinessName: true } } } } } }),
      this.prisma.agentProfile.count({ where: { verificationStatus: AgentVerificationStatus.PENDING } }),
      this.prisma.refund.count({ where: { status: RefundStatus.PENDING } }),
      this.prisma.payout.count({ where: { status: PayoutStatus.READY_TO_RELEASE } }),
    ]);
    const gmv30d = recentBookings.reduce((total, booking) => total + Number(booking.amount), 0);
    const netRevenue30d = recentBookings.reduce((total, booking) => total + Number(booking.economicsSnapshot?.voyaRevenue || 0), 0);
    const channelCounts = new Map<string, number>();
    const vendorTotals = new Map<string, { name: string; category: string; bookings: number; value: number; netRevenue: number }>();
    for (const booking of recentBookings) {
      channelCounts.set(booking.channel, (channelCounts.get(booking.channel) || 0) + 1);
      const vendorId = booking.vendorTenant.id;
      const current = vendorTotals.get(vendorId) || { name: booking.vendorTenant.vendorProfile?.legalBusinessName || booking.vendorTenant.name, category: booking.product.currentRevision?.type || '—', bookings: 0, value: 0, netRevenue: 0 };
      current.bookings += 1;
      current.value += Number(booking.amount);
      current.netRevenue += Number(booking.economicsSnapshot?.voyaRevenue || 0);
      vendorTotals.set(vendorId, current);
    }
    const approvalCount = pendingVendors + reviewProducts + pendingAgents + pendingRefunds + readyPayouts;
    return {
      vendors, pendingVendors, products, listings: products, reviewProducts, reviewActivities: reviewProducts, bookings, pendingBookings,
      gmv30d, netRevenue30d, periodLabel,
      channelMix: Array.from(channelCounts.entries()).map(([channel, count]) => ({ channel, count })).sort((a, b) => b.count - a.count),
      topVendors: Array.from(vendorTotals.values()).map((vendor) => ({ ...vendor, margin: vendor.value ? (vendor.netRevenue / vendor.value) * 100 : null, rating: null, ratingCount: 0 })).sort((a, b) => b.value - a.value).slice(0, 5),
      approvals: { total: approvalCount, vendors: pendingVendors, products: reviewProducts, agents: pendingAgents, refunds: pendingRefunds, payouts: readyPayouts },
      alerts: [pendingVendors ? `${pendingVendors} vendor onboarding reviews waiting` : null, reviewProducts ? `${reviewProducts} product submissions waiting` : null, pendingRefunds ? `${pendingRefunds} refunds need finance action` : null].filter(Boolean),
    };
  }
  async approvals(type?: string, currentUserId?: string) {
    const normalized = type?.trim().toUpperCase();
    const [vendors, products, agents, refunds, payouts, walletCredits, agentCommercialChanges, agentTierChanges] = await Promise.all([
      normalized && normalized !== 'VENDOR' ? [] : this.prisma.vendorProfile.findMany({ where: { verificationStatus: VendorVerificationStatus.PENDING }, select: { id: true, tenantId: true, legalBusinessName: true, verificationStatus: true, updatedAt: true } }),
      normalized && normalized !== 'PRODUCT' ? [] : this.prisma.productRevision.findMany({ where: { status: ProductRevisionStatus.UNDER_REVIEW, product: { deletedAt: null, tenant: { kind: TenantKind.VENDOR } } }, select: { id: true, productId: true, productName: true, submittedAt: true, updatedAt: true, product: { select: { tenantId: true, tenant: { select: { name: true, vendorProfile: { select: { legalBusinessName: true } } } } } } }, orderBy: { updatedAt: 'asc' }, take: 100 }),
      normalized && normalized !== 'AGENT' ? [] : this.prisma.agentProfile.findMany({ where: { verificationStatus: AgentVerificationStatus.PENDING }, select: { id: true, tenantId: true, legalBusinessName: true, verificationStatus: true, updatedAt: true } }),
      normalized && normalized !== 'REFUND' ? [] : this.prisma.refund.findMany({ where: { status: RefundStatus.PENDING }, select: { id: true, bookingId: true, amount: true, currency: true, status: true, requestedAt: true }, orderBy: { requestedAt: 'asc' }, take: 100 }),
      normalized && normalized !== 'PAYOUT' ? [] : this.prisma.payout.findMany({ where: { status: PayoutStatus.READY_TO_RELEASE }, select: { id: true, tenantId: true, amount: true, currency: true, status: true, dueDate: true, createdAt: true }, orderBy: { dueDate: 'asc' }, take: 100 }),
      normalized && normalized !== 'AGENT_WALLET_CREDIT' ? [] : this.prisma.agentWalletCreditApprovalRequest.findMany({ where: { status: AgentWalletCreditApprovalStatus.PENDING }, include: { agentTenant: { select: { id: true, name: true } }, requestedBy: { select: { id: true, fullName: true, email: true } } }, orderBy: { createdAt: 'asc' }, take: 100 }),
      normalized && normalized !== 'AGENT_COMMERCIAL' ? [] : this.prisma.agentCommercialChangeRequest.findMany({ where: { status: AgentCommercialChangeStatus.PENDING }, include: { tenant: { select: { id: true, name: true } }, createdBy: { select: { id: true, fullName: true, email: true } } }, orderBy: { createdAt: 'asc' }, take: 100 }),
      normalized && normalized !== 'AGENT_TIER_DEFAULTS' ? [] : this.prisma.globalSetting.findMany({ where: { tenantId: null, key: AGENT_TIERS_PENDING_SETTING_KEY }, orderBy: { createdAt: 'asc' }, take: 100 }),
    ]);
    const items = [
      ...vendors.map((row) => ({ id: row.id, type: 'VENDOR', title: row.legalBusinessName, status: row.verificationStatus, ownerId: row.tenantId, updatedAt: row.updatedAt })),
      ...products.map((row) => ({ id: row.id, type: 'PRODUCT', title: row.productName, status: 'UNDER_REVIEW', ownerId: row.product.tenantId, ownerName: row.product.tenant.vendorProfile?.legalBusinessName || row.product.tenant.name, updatedAt: row.updatedAt })),
      ...agents.map((row) => ({ id: row.id, type: 'AGENT', title: row.legalBusinessName, status: row.verificationStatus, ownerId: row.tenantId, updatedAt: row.updatedAt })),
      ...refunds.map((row) => ({ id: row.id, type: 'REFUND', title: `Refund for ${row.bookingId}`, status: row.status, amount: Number(row.amount), currency: row.currency, ownerId: row.bookingId, updatedAt: row.requestedAt })),
      ...payouts.map((row) => ({ id: row.id, type: 'PAYOUT', title: `Payout ${row.id.slice(0, 8)}`, status: row.status, amount: Number(row.amount), currency: row.currency, ownerId: row.tenantId, updatedAt: row.createdAt })),
      ...walletCredits.map((row) => ({ id: row.id, type: 'AGENT_WALLET_CREDIT', title: `Manual wallet credit · ${row.agentTenant.name}`, status: row.status, amount: Number(row.amount), currency: 'INR', paymentMethod: row.paymentMethod, reference: row.reference, requestReason: row.reason, ownerId: row.agentTenantId, ownerName: row.agentTenant.name, requesterId: row.requestedById, requesterName: row.requestedBy.fullName || row.requestedBy.email, canDecide: Boolean(currentUserId && currentUserId !== row.requestedById), updatedAt: row.createdAt })),
      ...agentCommercialChanges.map((row) => ({ id: row.id, type: 'AGENT_COMMERCIAL', title: `Commercial terms · ${row.tenant.name}`, status: row.status, ownerId: row.tenantId, ownerName: row.tenant.name, requesterId: row.createdById, requesterName: row.createdBy.fullName || row.createdBy.email, canDecide: Boolean(currentUserId && currentUserId !== row.createdById), proposedConfiguration: row.proposedConfiguration, requestReason: row.requestReason, updatedAt: row.createdAt })),
      ...agentTierChanges.map((row) => ({ id: row.id, type: 'AGENT_TIER_DEFAULTS', title: 'Agent tier defaults', status: 'PENDING', ownerId: row.id, ownerName: 'All travel agents', requesterId: row.adminId, requesterName: row.adminId, canDecide: Boolean(currentUserId && currentUserId !== row.adminId), proposedConfiguration: (row.value as any).tiers, requestReason: (row.value as any).reason, updatedAt: row.updatedAt })),
    ].sort((a, b) => new Date(a.updatedAt).getTime() - new Date(b.updatedAt).getTime());
    if (!(this.prisma as any).publicIdentifier) return items.map((item) => ({ ...item, publicCode: null }));
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext('public-identifiers:APPROVAL'))::text AS locked`;
      const itemsWithCodes = await Promise.all(items.map(async (item) => {
        const identifierId = `${item.type}:${item.id}`;
        const existing = await tx.publicIdentifier.findUnique({ where: { entityType_entityId: { entityType: PublicEntity.APPROVAL, entityId: identifierId } }, select: { publicCode: true } });
        const publicCode = existing?.publicCode || await allocatePublicCode(tx, PublicEntity.APPROVAL, 'APR-', 6);
        if (!existing) await ensurePublicIdentifier(tx, PublicEntity.APPROVAL, identifierId, publicCode);
        return { ...item, publicCode };
      }));
      return itemsWithCodes;
    });
  }
  async vendors() {
    const asOf = new Date();
    const rows = await this.prisma.tenant.findMany({
      where: { kind: TenantKind.VENDOR },
      include: {
        ...documentsInclude,
        vendorProfile: { select: profileSelect },
        users: { select: { id: true, email: true, fullName: true, active: true } },
        products: {
          where: { status: ProductStatus.LIVE, deletedAt: null },
          select: {
            variants: {
              where: { status: { not: 'ARCHIVED' }, archivedAt: null },
              select: {
                ratePlans: {
                  where: { status: 'ACTIVE' },
                  select: {
                    commercialVersions: {
                      where: {
                        status: 'ACTIVE',
                        effectiveFrom: { lte: asOf },
                        OR: [{ effectiveTo: null }, { effectiveTo: { gt: asOf } }],
                      },
                      orderBy: { versionNumber: 'desc' },
                      take: 1,
                      select: { supplierModel: true, supplierCommissionPercent: true },
                    },
                  },
                },
              },
            },
          },
        },
        _count: { select: { products: true, vendorBookings: true, payouts: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
    const publicCodes = await publicIdentifierMap(this.prisma, PublicEntity.VENDOR, rows.map((row) => row.id));
    return rows.map((vendor: any) => {
      const versions = vendor.products.flatMap((product: any) => product.variants.flatMap((variant: any) => variant.ratePlans.flatMap((plan: any) => plan.commercialVersions)));
      const commercialTerms = summarizeVendorCommercialTerms(versions, {
        supplierModel: vendor.vendorProfile?.defaultSupplierModel,
        supplierCommissionPercent: vendor.vendorProfile?.defaultSupplierCommissionPercent,
      });
      return {
        ...vendor,
        publicCode: publicCodes.get(vendor.id) || null,
        _count: { ...vendor._count, products: vendor.products.length },
        commercialModel: commercialTerms.model,
        commissionPercent: commercialTerms.commissionPercent,
        commissionVaries: commercialTerms.commissionVaries,
        commissionValues: commercialTerms.commissionValues,
        products: undefined,
      };
    });
  }
  async products(query: { search?: string; vendorId?: string; status?: string; type?: string; page?: number; limit?: number }) {
    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(query.limit) || 25));
    const search = query.search?.trim();
    const where: any = { tenant: { kind: TenantKind.VENDOR }, deletedAt: null, AND: [] };
    if (query.vendorId) where.tenantId = query.vendorId;
    if (search) {
      const publicMatches = await this.prisma.publicIdentifier.findMany({ where: { entityType: PublicEntity.PRODUCT, publicCode: { contains: search, mode: 'insensitive' } }, select: { entityId: true } });
      where.AND.push({ OR: [
      { productCode: { contains: search, mode: 'insensitive' } },
      { tenant: { name: { contains: search, mode: 'insensitive' } } },
      { tenant: { vendorProfile: { legalBusinessName: { contains: search, mode: 'insensitive' } } } },
      { currentRevision: { productName: { contains: search, mode: 'insensitive' } } },
      { revisions: { some: { productName: { contains: search, mode: 'insensitive' } } } },
      ...(publicMatches.length ? [{ id: { in: publicMatches.map((row) => row.entityId) } }] : []),
      ] });
    }
    if (query.type) where.AND.push({ currentRevision: { type: query.type } });
    if (query.status === 'LIVE') where.AND.push({ status: 'LIVE', currentRevision: { status: ProductRevisionStatus.PUBLISHED } });
    if (query.status === 'SUSPENDED' || query.status === 'ARCHIVED') where.AND.push({ status: query.status });
    if (query.status === 'UNDER_REVIEW') where.AND.push({ status: { not: ProductStatus.LIVE }, revisions: { some: { status: ProductRevisionStatus.UNDER_REVIEW } } });
    if (query.status === 'CHANGES_PENDING') where.AND.push({ status: ProductStatus.LIVE, revisions: { some: { status: ProductRevisionStatus.UNDER_REVIEW } } });
    if (query.status === 'DRAFT') where.AND.push({ OR: [{ status: 'DRAFT' }, { revisions: { some: { status: ProductRevisionStatus.DRAFT } } }] });
    if (!query.status) where.AND.push({ OR: [{ status: { in: [ProductStatus.DRAFT, ProductStatus.LIVE, ProductStatus.SUSPENDED, ProductStatus.ARCHIVED] } }, { revisions: { some: { status: { in: [ProductRevisionStatus.DRAFT, ProductRevisionStatus.UNDER_REVIEW, ProductRevisionStatus.REJECTED] } } } }] });
    const revisionSelect = { id: true, versionNumber: true, status: true, productName: true, type: true, subCategory: true, cityName: true, stateName: true, countryName: true, channels: true, description: true, highlights: true, included: true, meetingPoint: true, sourcePayload: true };
    const [total, rows] = await this.prisma.$transaction([
      this.prisma.product.count({ where }),
      this.prisma.product.findMany({ where, orderBy: { updatedAt: 'desc' }, skip: (page - 1) * limit, take: limit, select: {
        id: true, productCode: true, status: true, updatedAt: true,
        tenant: { select: { id: true, name: true, vendorProfile: { select: { legalBusinessName: true, verificationStatus: true } } } },
        currentRevision: { select: revisionSelect },
        revisions: { where: { status: { in: [ProductRevisionStatus.DRAFT, ProductRevisionStatus.UNDER_REVIEW, ProductRevisionStatus.REJECTED] } }, orderBy: { versionNumber: 'desc' }, take: 1, select: revisionSelect },
        variants: { where: { status: { not: 'ARCHIVED' }, archivedAt: null }, select: { id: true, ratePlans: { where: { status: 'ACTIVE' }, select: { id: true, basePrice: true, currency: true, commercialVersions: { where: { status: 'ACTIVE' }, orderBy: { versionNumber: 'desc' }, take: 1, select: { supplierBaseAmount: true, supplierCommissionPercent: true, travellerPrices: { select: { amount: true } } } } } } } },
      } }),
    ]);
    const publicCodes = await publicIdentifierMap(this.prisma, PublicEntity.PRODUCT, rows.map((product: any) => product.id));
    const items = await Promise.all(rows.map(async (product: any) => {
      const workingRevision = product.revisions[0] || product.currentRevision;
      const revision: any = product.currentRevision || workingRevision;
      const plans = product.variants.flatMap((variant: any) => variant.ratePlans);
      const prices = plans.map((plan: any) => Number(plan.commercialVersions?.[0]?.travellerPrices?.[0]?.amount ?? plan.basePrice)).filter((value: number) => Number.isFinite(value) && value > 0);
      const sellPrice = prices.length ? Math.min(...prices) : null;
      const supplierCosts = plans.map((plan: any) => Number(plan.commercialVersions?.[0]?.supplierBaseAmount ?? 0)).filter((value: number) => Number.isFinite(value) && value > 0);
      const supplierCost = supplierCosts.length ? Math.min(...supplierCosts) : null;
      const netMargin = sellPrice && supplierCost != null ? Math.max(0, ((sellPrice - supplierCost) / sellPrice) * 100) : null;
      const sourceAdmin = (revision?.sourcePayload as any)?.admin || {};
      const channels = revision?.channels?.length ? revision.channels : sourceAdmin.channels || [];
      const contentFields = [revision?.productName, revision?.description, revision?.cityName, revision?.stateName, revision?.countryName, revision?.meetingPoint, ...(revision?.highlights || []), ...(revision?.included || [])];
      const contentScore = Math.round((contentFields.filter((value: unknown) => String(value || '').trim()).length / Math.max(contentFields.length, 1)) * 100);
      return { id: product.id, productCode: product.productCode, publicCode: publicCodes.get(product.id) || null, productStatus: product.status, workingRevisionId: workingRevision?.id || null, workingRevisionStatus: workingRevision?.status || null, name: revision?.productName || product.productCode, type: revision?.type || null, subCategory: revision?.subCategory || null, destination: [revision?.cityName, revision?.stateName, revision?.countryName].filter(Boolean).join(', '), channels, sellPrice, sellCurrency: plans[0]?.currency || product.currency, netMargin, contentScore, vendor: { id: product.tenant.id, name: product.tenant.vendorProfile?.legalBusinessName || product.tenant.name, verificationStatus: product.tenant.vendorProfile?.verificationStatus || null }, optionCount: product.variants.length, ratePlanCount: plans.length, updatedAt: product.updatedAt, distribution: this.distributionReadiness ? await this.distributionReadiness.evaluate(product.id) : null };
    }));
    return { items, pagination: { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) } };
  }
  async globalLookup(query: string, canManageUsers = false) {
    const term = query.trim();
    if (!term) return { items: [] };
    const identifiers = await this.prisma.publicIdentifier.findMany({ where: { publicCode: { contains: term, mode: 'insensitive' } }, orderBy: { publicCode: 'asc' }, take: 25 });
    const items = await Promise.all(identifiers.map(async (identifier: any) => {
      const { entityType, entityId, publicCode } = identifier;
      let title = publicCode; let detail = entityType; let page: string | null = null;
      switch (entityType) {
        case PublicEntity.VENDOR: {
          const row = await this.prisma.tenant.findUnique({ where: { id: entityId }, select: { name: true, vendorProfile: { select: { legalBusinessName: true, operatingCity: true } } } });
          if (!row) return null; title = row.vendorProfile?.legalBusinessName || row.name; detail = [publicCode, row.vendorProfile?.operatingCity].filter(Boolean).join(' · '); page = 'vendors'; break;
        }
        case PublicEntity.VENDOR_DOCUMENT: {
          const row = await this.prisma.vendorDocument.findUnique({ where: { id: entityId }, select: { type: true, currentStatus: true, tenant: { select: { name: true, vendorProfile: { select: { legalBusinessName: true } } } } } });
          if (!row) return null; title = `${row.tenant.vendorProfile?.legalBusinessName || row.tenant.name} · ${row.type.replaceAll('_', ' ')}`; detail = `${publicCode} · ${row.currentStatus.replaceAll('_', ' ')}`; page = 'vendors'; break;
        }
        case PublicEntity.AGENT: {
          const row = await this.prisma.tenant.findUnique({ where: { id: entityId }, select: { name: true, agentProfile: { select: { legalBusinessName: true } } } });
          if (!row) return null; title = row.agentProfile?.legalBusinessName || row.name; detail = publicCode; page = 'agents'; break;
        }
        case PublicEntity.PRODUCT: {
          const row = await this.prisma.product.findUnique({ where: { id: entityId }, select: { productCode: true, currentRevision: { select: { productName: true, cityName: true, stateName: true } } } });
          if (!row) return null; title = row.currentRevision?.productName || row.productCode; detail = [publicCode, row.productCode, row.currentRevision?.cityName, row.currentRevision?.stateName].filter(Boolean).join(' · '); page = 'products'; break;
        }
        case PublicEntity.VARIANT: {
          const row = await this.prisma.productVariant.findUnique({ where: { id: entityId }, select: { name: true, product: { select: { id: true, currentRevision: { select: { productName: true } } } } } });
          if (!row) return null; title = row.name || row.product.currentRevision?.productName || publicCode; detail = publicCode; page = 'products'; break;
        }
        case PublicEntity.RATE_PLAN: {
          const row = await this.prisma.ratePlan.findUnique({ where: { id: entityId }, select: { name: true, variant: { select: { product: { select: { currentRevision: { select: { productName: true } } } } } } } });
          if (!row) return null; title = row.name || row.variant.product.currentRevision?.productName || publicCode; detail = publicCode; page = 'products'; break;
        }
        case PublicEntity.MASTER_PRODUCT: {
          const row = await this.prisma.experienceMaster.findUnique({ where: { id: entityId }, select: { canonicalName: true, cityName: true } });
          if (!row) return null; title = row.canonicalName; detail = [publicCode, row.cityName].filter(Boolean).join(' · '); page = 'matching'; break;
        }
        case PublicEntity.MASTER_OPTION: {
          const row = await this.prisma.experienceMasterOption.findUnique({ where: { id: entityId }, select: { name: true, experienceMaster: { select: { canonicalName: true } } } });
          if (!row) return null; title = row.name; detail = [publicCode, row.experienceMaster.canonicalName].filter(Boolean).join(' · '); page = 'matching'; break;
        }
        case PublicEntity.DISTRIBUTION_CHANNEL: {
          const row = await this.prisma.distributionChannel.findUnique({ where: { id: entityId }, select: { code: true, name: true, type: true, active: true } });
          if (!row) return null; title = row.name; detail = [publicCode, row.code, row.type, row.active ? 'Active' : 'Inactive'].join(' · '); page = 'distribution'; break;
        }
        case PublicEntity.BOOKING: {
          const row: any = await this.prisma.booking.findUnique({ where: { id: entityId }, select: { serviceDate: true, status: true, channel: true, product: { select: { currentRevision: { select: { productName: true } } } } } });
          if (!row) return null; title = row.product?.currentRevision?.productName || 'Booking'; detail = [publicCode, row.channel, row.status, new Date(row.serviceDate).toLocaleDateString('en-CA')].filter(Boolean).join(' · '); page = 'bookings'; break;
        }
        case PublicEntity.REFUND: {
          const row: any = await this.prisma.refund.findUnique({ where: { id: entityId }, select: { status: true, amount: true, currency: true } });
          if (!row) return null; title = `Refund · ${Number(row.amount).toLocaleString()} ${row.currency}`; detail = `${publicCode} · ${row.status}`; page = 'settlements'; break;
        }
        case PublicEntity.WALLET_LEDGER: {
          const row: any = await this.prisma.agentWalletLedger.findUnique({ where: { id: entityId }, select: { entryType: true, amount: true, agentTenant: { select: { name: true } } } });
          if (!row) return null; title = `${row.agentTenant.name} · ${row.entryType.replaceAll('_', ' ')}`; detail = `${publicCode} · ${Number(row.amount).toLocaleString()}`; page = 'settlements'; break;
        }
        case PublicEntity.PAYOUT: {
          const row: any = await this.prisma.payout.findUnique({ where: { id: entityId }, select: { status: true, amount: true, currency: true } });
          if (!row) return null; title = `Vendor payout · ${Number(row.amount).toLocaleString()} ${row.currency}`; detail = `${publicCode} · ${row.status}`; page = 'settlements'; break;
        }
        case PublicEntity.SETTLEMENT_BATCH: {
          const row: any = await this.prisma.settlementBatch.findUnique({ where: { id: entityId }, select: { status: true, netPayable: true, currency: true } });
          if (!row) return null; title = `Payout batch · ${Number(row.netPayable).toLocaleString()} ${row.currency}`; detail = `${publicCode} · ${row.status}`; page = 'settlements'; break;
        }
        case PublicEntity.COMMERCIAL_RULE: {
          const row = await this.prisma.commercialRule.findUnique({ where: { id: entityId }, select: { name: true } });
          if (!row) return null; title = row.name; detail = publicCode; page = 'commercial'; break;
        }
        case PublicEntity.SELECTION_RULE_SET: {
          const row = await this.prisma.experienceSelectionRuleSet.findUnique({ where: { id: entityId }, select: { scope: true, status: true } });
          if (!row) return null; title = `${row.scope} supplier selection rules`; detail = `${publicCode} · ${row.status}`; page = 'matching'; break;
        }
        case PublicEntity.PROMOTION: {
          const row = await this.prisma.promotion.findUnique({ where: { id: entityId }, select: { name: true } });
          if (!row) return null; title = row.name; detail = publicCode; page = 'promotions'; break;
        }
        case PublicEntity.PLATFORM_COUPON: {
          const row = await this.prisma.platformCoupon.findUnique({ where: { id: entityId }, select: { code: true, name: true, status: true } });
          if (!row) return null; title = row.name; detail = `${publicCode} · ${row.code} · ${row.status}`; page = 'promotions'; break;
        }
        case PublicEntity.COMMISSION_INVOICE: {
          const row = await this.prisma.commissionInvoice.findUnique({ where: { id: entityId }, select: { invoiceNumber: true, vendorLegalName: true, status: true, totalAmount: true, currency: true } });
          if (!row) return null; title = `Commission invoice · ${row.vendorLegalName}`; detail = `${publicCode} · ${row.status} · ${Number(row.totalAmount).toLocaleString()} ${row.currency}`; page = 'settlements'; break;
        }
        case PublicEntity.APPROVAL: {
          const [type] = entityId.split(':'); title = `${type || 'Pending'} approval`; detail = publicCode; page = 'approvals'; break;
        }
        case PublicEntity.AUDIT_EVENT: {
          const row = await this.prisma.auditLog.findUnique({ where: { id: entityId }, select: { action: true, entityType: true, createdAt: true } });
          if (!row) return null; title = row.action; detail = `${publicCode} · ${row.entityType} · ${row.createdAt.toISOString()}`; page = 'audit'; break;
        }
        case PublicEntity.USER: {
          if (!canManageUsers) return null;
          const row = await this.prisma.user.findUnique({ where: { id: entityId }, select: { fullName: true, email: true, role: true } });
          if (!row) return null; title = row.fullName; detail = `${publicCode} · ${row.email} · ${row.role}`; page = 'users'; break;
        }
        default: return null;
      }
      return { id: entityId, entityType, publicCode, title, detail, page };
    }));
    const [vendorShortCodes, voucherVersions] = await Promise.all([
      this.prisma.vendorProfile.findMany({
        where: { voucherShortCode: { contains: term, mode: 'insensitive' } },
        select: { tenantId: true, voucherShortCode: true, legalBusinessName: true, operatingCity: true, tenant: { select: { name: true } } },
        take: 25,
      }),
      this.prisma.voucherVersion.findMany({
        where: { voucherCode: { contains: term, mode: 'insensitive' } },
        select: { id: true, voucherCode: true, status: true, booking: { select: { id: true, bookingCode: true, customerName: true } } },
        take: 25,
      }),
    ]);
    const extraItems = [
      ...vendorShortCodes.map((row: any) => ({
        id: row.tenantId,
        entityType: 'VENDOR_SHORT_CODE',
        publicCode: row.voucherShortCode,
        title: row.legalBusinessName || row.tenant.name,
        detail: [row.voucherShortCode, row.operatingCity].filter(Boolean).join(' · '),
        page: 'vendors',
      })),
      ...voucherVersions.map((row: any) => ({
        id: row.booking.id,
        entityType: 'VOUCHER',
        publicCode: row.voucherCode,
        title: row.booking.customerName || row.booking.bookingCode || 'Booking voucher',
        detail: `${row.voucherCode} · ${row.status.replaceAll('_', ' ')} · ${row.booking.bookingCode}`,
        page: 'bookings',
      })),
    ];
    const validItems = items.filter((item): item is NonNullable<typeof item> => item !== null);
    const resolved = [...validItems, ...extraItems];
    const unique = new Map<string, (typeof resolved)[number]>();
    for (const item of resolved) unique.set(`${item.entityType}:${item.id}`, item);
    return { items: [...unique.values()].slice(0, 25) };
  }
  async deactivateProduct(actor: AuthUser, productId: string) {
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "Product" WHERE "id" = ${productId} FOR UPDATE`);
      const product = await tx.product.findFirst({ where: { id: productId, tenant: { kind: TenantKind.VENDOR } }, select: { id: true, tenantId: true, status: true, currentRevisionId: true } });
      if (!product) throw new NotFoundException('Product not found');
      if (product.status !== ProductStatus.LIVE) throw new ConflictException(`Only LIVE products can be deactivated; current status is ${product.status}`);
      const updated = await tx.product.update({ where: { id: productId }, data: { status: ProductStatus.SUSPENDED } });
      await this.audit.write(tx, { actor, tenantId: product.tenantId, action: 'PRODUCT_DEACTIVATED', entityType: 'Product', entityId: productId, beforeState: { status: product.status, currentRevisionId: product.currentRevisionId }, afterState: { status: updated.status, currentRevisionId: updated.currentRevisionId } });
      await this.outbox.enqueue(tx, { tenantId: product.tenantId, eventType: 'PRODUCT_DEACTIVATED', aggregateType: 'Product', aggregateId: productId, payload: { previousStatus: product.status, status: updated.status } });
      return updated;
    });
  }
  async archiveProduct(actor: AuthUser, productId: string) {
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "Product" WHERE "id" = ${productId} FOR UPDATE`);
      const product = await tx.product.findFirst({ where: { id: productId, tenant: { kind: TenantKind.VENDOR } }, select: { id: true, tenantId: true, status: true, currentRevisionId: true } });
      if (!product) throw new NotFoundException('Product not found');
      if (product.status !== ProductStatus.LIVE) throw new ConflictException(`Only LIVE products can be archived; current status is ${product.status}`);
      const updated = await tx.product.update({ where: { id: productId }, data: { status: ProductStatus.ARCHIVED } });
      await this.audit.write(tx, { actor, tenantId: product.tenantId, action: 'PRODUCT_ARCHIVED', entityType: 'Product', entityId: productId, beforeState: { status: product.status, currentRevisionId: product.currentRevisionId }, afterState: { status: updated.status, currentRevisionId: updated.currentRevisionId } });
      await this.outbox.enqueue(tx, { tenantId: product.tenantId, eventType: 'PRODUCT_ARCHIVED', aggregateType: 'Product', aggregateId: productId, payload: { previousStatus: product.status, status: updated.status } });
      return updated;
    });
  }
  async vendor(tenantId: string) {
    const asOf = new Date();
    const vendor = await this.prisma.tenant.findFirst({ where: { id: tenantId, kind: TenantKind.VENDOR }, include: { ...documentsInclude, vendorProfile: { select: profileSelect }, vendorCommercialChangeRequests: { where: { status: VendorCommercialChangeStatus.PENDING }, include: { createdBy: { select: { id: true, fullName: true, email: true } } }, orderBy: { createdAt: 'desc' } }, users: { select: { id: true, email: true, fullName: true, active: true } }, products: { where: { deletedAt: null }, include: { currentRevision: true, variants: { where: { status: { not: 'ARCHIVED' }, archivedAt: null }, include: { ratePlans: { where: { status: 'ACTIVE' }, include: { commercialVersions: { where: { status: 'ACTIVE', effectiveFrom: { lte: asOf }, OR: [{ effectiveTo: null }, { effectiveTo: { gt: asOf } }] }, orderBy: { versionNumber: 'desc' }, take: 1 } } } } } }, orderBy: { updatedAt: 'desc' } }, _count: { select: { vendorBookings: true, payouts: true } } } });
    if (!vendor) throw new NotFoundException('Vendor not found');
    const from = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const bookings = await this.prisma.booking.findMany({ where: { vendorTenantId: tenantId, createdAt: { gte: from } }, select: { id: true, status: true, bookingMode: true, confirmedAt: true, amount: true, cancellation: { select: { initiator: true } } } });
    const versions = vendor.products.flatMap((product: any) => product.variants.flatMap((variant: any) => variant.ratePlans.flatMap((plan: any) => plan.commercialVersions || [])));
    const metrics = summarizeVendorMetrics(bookings);
    const ratePlanTerms = versions.length ? summarizeVendorCommercialTerms(versions, {
      supplierModel: vendor.vendorProfile?.defaultSupplierModel,
      supplierCommissionPercent: vendor.vendorProfile?.defaultSupplierCommissionPercent == null ? null : Number(vendor.vendorProfile.defaultSupplierCommissionPercent),
    }) : null;
    const commercialTerms = {
      model: vendor.vendorProfile?.defaultSupplierModel ?? null,
      commissionPercent: vendor.vendorProfile?.defaultSupplierCommissionPercent == null ? null : Number(vendor.vendorProfile.defaultSupplierCommissionPercent),
      source: 'vendor onboarding defaults',
    };
    const vendorUsers = vendor.users || [];
    const [vendorPublicCode, productCodes, userCodes, documentCodes] = await Promise.all([
      publicIdentifier(this.prisma, PublicEntity.VENDOR, vendor.id),
      publicIdentifierMap(this.prisma, PublicEntity.PRODUCT, vendor.products.map((product: any) => product.id)),
      publicIdentifierMap(this.prisma, PublicEntity.USER, vendorUsers.map((user: any) => user.id)),
      publicIdentifierMap(this.prisma, PublicEntity.VENDOR_DOCUMENT, (vendor.vendorDocuments || []).map((document: any) => document.id)),
    ]);
    vendor.users = vendorUsers.map((user: any) => ({ ...user, publicCode: userCodes.get(user.id) || null }));
    vendor.vendorDocuments = (vendor.vendorDocuments || []).map((document: any) => ({ ...document, publicCode: documentCodes.get(document.id) || null }));
    const enriched = !this.distributionReadiness ? vendor.products.map((product: any) => ({ ...product, publicCode: productCodes.get(product.id) || null })) : await Promise.all(vendor.products.map(async (product: any) => ({ ...product, publicCode: productCodes.get(product.id) || null, distribution: await this.distributionReadiness!.evaluate(product.id) })));
    return {
      ...vendor,
      publicCode: vendorPublicCode,
      products: enriched,
      metrics,
      commercialTerms,
      ratePlanTerms,
    };
  }
  async requestVendorCommercialChange(actor: AuthUser, tenantId: string, input: { supplierModel: string; commissionPercent?: number; reason: string }) {
    const model = input.supplierModel as SupplierCommercialModel;
    const commissionPercent = model === SupplierCommercialModel.COMMISSIONABLE ? Number(input.commissionPercent) : null;
    if (model !== SupplierCommercialModel.NET_RATE && model !== SupplierCommercialModel.COMMISSIONABLE) throw new ConflictException('Only net-rate and commission-on-sell-price models are supported');
    if (model === SupplierCommercialModel.COMMISSIONABLE && (!Number.isFinite(commissionPercent) || commissionPercent! < 0 || commissionPercent! > 100)) throw new ConflictException('Commission must be between 0 and 100 percent');
    if (!input.reason?.trim()) throw new ConflictException('A reason is required for a commercial change request');
    const vendor = await this.prisma.tenant.findFirst({ where: { id: tenantId, kind: TenantKind.VENDOR }, select: { id: true } });
    if (!vendor) throw new NotFoundException('Vendor not found');
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "Tenant" WHERE "id" = ${tenantId} FOR UPDATE`;
      const pending = await tx.vendorCommercialChangeRequest.findFirst({ where: { tenantId, status: VendorCommercialChangeStatus.PENDING }, select: { id: true } });
      if (pending) throw new ConflictException('A vendor commercial change is already awaiting review');
      const request = await tx.vendorCommercialChangeRequest.create({ data: { tenantId, proposedSupplierModel: model, proposedCommissionPercent: commissionPercent, requestReason: input.reason.trim(), createdById: actor.sub } });
      await this.audit.write(tx, { actor, tenantId, action: 'VENDOR_COMMERCIAL_CHANGE_REQUESTED', entityType: 'VendorCommercialChangeRequest', entityId: request.id, reason: input.reason.trim(), afterState: { supplierModel: model, commissionPercent } });
      await this.outbox.enqueue(tx, { tenantId, eventType: 'VENDOR_COMMERCIAL_CHANGE_REQUESTED', aggregateType: 'VendorCommercialChangeRequest', aggregateId: request.id, payload: { supplierModel: model, commissionPercent, createdById: actor.sub } });
      return request;
    });
  }

  async reviewVendorCommercialChange(actor: AuthUser, tenantId: string, requestId: string, decision: 'APPROVED' | 'REJECTED', reason?: string) {
    if (decision === 'REJECTED' && !reason?.trim()) throw new ConflictException('A reason is required to reject a commercial change');
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "VendorCommercialChangeRequest" WHERE "id" = ${requestId} AND "tenantId" = ${tenantId} FOR UPDATE`;
      const request = await tx.vendorCommercialChangeRequest.findFirst({ where: { id: requestId, tenantId, status: VendorCommercialChangeStatus.PENDING } });
      if (!request) throw new NotFoundException('Pending vendor commercial change not found');
      if (request.createdById === actor.sub) throw new ConflictException('A different Admin must review this commercial change');
      if (decision === 'APPROVED') await tx.vendorProfile.update({ where: { tenantId }, data: { defaultSupplierModel: request.proposedSupplierModel, defaultSupplierCommissionPercent: request.proposedCommissionPercent } });
      const updated = await tx.vendorCommercialChangeRequest.update({ where: { id: requestId }, data: { status: decision === 'APPROVED' ? VendorCommercialChangeStatus.APPROVED : VendorCommercialChangeStatus.REJECTED, reviewedById: actor.sub, reviewedAt: new Date(), reviewReason: reason?.trim() || null } });
      await this.audit.write(tx, { actor, tenantId, action: decision === 'APPROVED' ? 'VENDOR_COMMERCIAL_CHANGE_APPROVED' : 'VENDOR_COMMERCIAL_CHANGE_REJECTED', entityType: 'VendorCommercialChangeRequest', entityId: requestId, reason: reason?.trim() || request.requestReason, beforeState: { status: request.status }, afterState: { status: updated.status, supplierModel: request.proposedSupplierModel, commissionPercent: request.proposedCommissionPercent } });
      await this.outbox.enqueue(tx, { tenantId, eventType: `VENDOR_COMMERCIAL_CHANGE_${decision}`, aggregateType: 'VendorCommercialChangeRequest', aggregateId: requestId, payload: { supplierModel: request.proposedSupplierModel, commissionPercent: request.proposedCommissionPercent?.toString() ?? null } });
      return updated;
    });
  }

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
