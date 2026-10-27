import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { AgentVerificationStatus, BookingStatus, DocumentReviewStatus, Prisma, ProductRevisionStatus, ProductStatus, TenantKind, UserRole, VendorVerificationStatus } from '@prisma/client';
import { hash } from 'bcryptjs';
import { AuditService } from '../audit/audit.service';
import { AuthUser } from '../common/auth.types';
import { OutboxService } from '../outbox/outbox.service';
import { PrismaService } from '../prisma/prisma.service';
import { Optional } from '@nestjs/common';
import { ChannelMappingService } from '../distribution/channel-mapping.service';
import { ChannelDistributionReadinessService } from '../distribution/channel-distribution-readiness.service';
import { defaultVisitorPricingSettings, normalizeVisitorPricingSettings, VISITOR_PRICING_SETTINGS_KEY, VisitorPricingSettings } from '../common/visitor-pricing-settings';

const profileSelect = { id: true, tenantId: true, legalBusinessName: true, operatingCity: true, operatingRegion: true, gstin: true, category: true, verificationStatus: true, readinessScore: true, payoutAccountMasked: true, payoutAccountHolder: true, payoutBankName: true, payoutBranch: true, payoutIfsc: true, payoutSwift: true, payoutAccountType: true, payoutCurrency: true } satisfies Prisma.VendorProfileSelect;
const documentsInclude = { vendorDocuments: { include: { versions: { orderBy: { versionNumber: 'desc' as const }, include: { fileAsset: { select: { id: true, originalName: true, mimeType: true, sizeBytes: true, visibility: true, purpose: true } } } } } } };

@Injectable()
export class AdminService {
  constructor(private readonly prisma: PrismaService, private readonly audit: AuditService, private readonly outbox: OutboxService, @Optional() private readonly distributionMappings?: ChannelMappingService, @Optional() private readonly distributionReadiness?: ChannelDistributionReadinessService) {}

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

  platformAdmins() {
    return this.prisma.user.findMany({ where: { role: UserRole.ADMIN }, select: { id: true, email: true, fullName: true, role: true, active: true, createdAt: true, updatedAt: true }, orderBy: { createdAt: 'asc' } });
  }

  impersonationTargets() {
    return this.prisma.user.findMany({
      where: { active: true, role: { in: [UserRole.ADMIN, UserRole.VENDOR, UserRole.TRAVEL_AGENT] } },
      select: { id: true, email: true, fullName: true, role: true, tenantId: true, organizationRole: true, active: true, createdAt: true },
      orderBy: [{ role: 'asc' }, { fullName: 'asc' }],
    });
  }

  async createAdmin(actor: AuthUser, input: { fullName: string; email: string; password: string }) {
    const fullName = input.fullName.trim();
    const email = input.email.trim().toLowerCase();
    if (email === actor.email.toLowerCase()) throw new ConflictException('This account is already the signed-in Super Admin');
    if (await this.prisma.user.findUnique({ where: { email }, select: { id: true } })) throw new ConflictException('An account with this email already exists');
    const passwordHash = await hash(input.password, 10);
    const created = await this.prisma.$transaction(async (tx) => {
      const user = await tx.user.create({ data: { email, passwordHash, fullName, role: UserRole.ADMIN, tenantId: null, organizationRole: null, active: true, mustChangePassword: true }, select: { id: true, email: true, fullName: true, role: true, active: true, createdAt: true, updatedAt: true } });
      await this.audit.write(tx, { actor, action: 'ADMIN_CREATED', entityType: 'User', entityId: user.id, afterState: { email: user.email, fullName: user.fullName, role: user.role, active: user.active } });
      await this.outbox.enqueue(tx, { eventType: 'ADMIN_CREATED', aggregateType: 'User', aggregateId: user.id, payload: { email: user.email, role: user.role } });
      return user;
    });
    return created;
  }

  async createVendor(actor: AuthUser, input: { vendorName: string; email: string; password: string }) {
    const vendorName = input.vendorName.trim();
    const email = input.email.trim().toLowerCase();
    if (await this.prisma.user.findUnique({ where: { email }, select: { id: true } })) throw new ConflictException('An account with this email already exists');
    const passwordHash = await hash(input.password, 10);
    const slugBase = vendorName.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase() || 'vendor';
    const created = await this.prisma.$transaction(async (tx) => {
      const tenant = await tx.tenant.create({ data: { name: vendorName, slug: `${slugBase}-${Date.now().toString(36)}`, kind: TenantKind.VENDOR } });
      const user = await tx.user.create({ data: { tenantId: tenant.id, email, passwordHash, fullName: vendorName, role: UserRole.VENDOR, organizationRole: 'OWNER', active: true, mustChangePassword: true }, select: { id: true, email: true, fullName: true, role: true, tenantId: true, active: true } });
      await tx.vendorProfile.create({ data: { tenantId: tenant.id, legalBusinessName: vendorName, operatingCity: 'Not set', operatingRegion: 'Not set' } });
      await this.audit.write(tx, { actor, tenantId: tenant.id, action: 'VENDOR_CREATED', entityType: 'User', entityId: user.id, afterState: { email: user.email, fullName: user.fullName, role: user.role, tenantId: tenant.id, active: user.active } });
      await this.outbox.enqueue(tx, { tenantId: tenant.id, eventType: 'VENDOR_CREATED', aggregateType: 'User', aggregateId: user.id, payload: { email: user.email, role: user.role } });
      return { ...user, vendorName };
    });
    return { ...created, temporaryPassword: input.password };
  }

  async setAdminStatus(actor: AuthUser, id: string, active: boolean) {
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
  async dashboard() { const [vendors, pendingVendors, products, reviewProducts, bookings, pendingBookings] = await Promise.all([this.prisma.tenant.count({ where: { kind: TenantKind.VENDOR } }), this.prisma.vendorProfile.count({ where: { verificationStatus: VendorVerificationStatus.PENDING } }), this.prisma.product.count({ where: { tenant: { kind: TenantKind.VENDOR }, deletedAt: null } }), this.prisma.productRevision.count({ where: { product: { tenant: { kind: TenantKind.VENDOR }, deletedAt: null }, status: ProductRevisionStatus.UNDER_REVIEW } }), this.prisma.booking.count({ where: { vendorTenant: { kind: TenantKind.VENDOR } } }), this.prisma.booking.count({ where: { vendorTenant: { kind: TenantKind.VENDOR }, status: BookingStatus.PENDING } })]); return { vendors, pendingVendors, products, listings: products, reviewProducts, reviewActivities: reviewProducts, bookings, pendingBookings }; }
  async vendorStates(): Promise<string[]> {
    // A vendor can operate in its home region and in other states through products.
    const [profiles, applications, revisions] = await Promise.all([
      this.prisma.vendorProfile.findMany({
        where: { tenant: { kind: TenantKind.VENDOR } },
        distinct: ['operatingRegion'],
        select: { operatingRegion: true },
      }),
      this.prisma.vendorOnboardingApplication.findMany({
        where: { tenant: { kind: TenantKind.VENDOR } },
        distinct: ['state'],
        select: { state: true },
      }),
      this.prisma.productRevision.findMany({
        where: { currentForProducts: { some: { deletedAt: null, tenant: { kind: TenantKind.VENDOR } } } },
        distinct: ['stateName'],
        select: { stateName: true },
      }),
    ]);
    const states = new Map<string, string>();
    for (const value of [
      ...profiles.map((profile) => profile.operatingRegion),
      ...applications.map((application) => application.state),
      ...revisions.map((revision) => revision.stateName),
    ]) {
      const name = value?.trim();
      if (name && name.toLowerCase() !== 'not set' && !states.has(name.toLowerCase())) {
        states.set(name.toLowerCase(), name);
      }
    }
    return [...states.values()].sort((a, b) => a.localeCompare(b));
  }

  vendors(state?: string) {
    if (state !== undefined && (typeof state !== 'string' || state.length > 100)) {
      throw new BadRequestException('Invalid state filter');
    }
    const selectedState = state?.trim();
    const where: Prisma.TenantWhereInput = { kind: TenantKind.VENDOR };
    if (selectedState) {
      where.OR = [
        { vendorProfile: { is: { operatingRegion: { equals: selectedState, mode: 'insensitive' } } } },
        { vendorOnboarding: { is: { state: { equals: selectedState, mode: 'insensitive' } } } },
        {
          products: {
            some: {
              deletedAt: null,
              currentRevision: { is: { stateName: { equals: selectedState, mode: 'insensitive' } } },
            },
          },
        },
      ];
    }
    return this.prisma.tenant.findMany({
      where,
      include: {
        ...documentsInclude,
        vendorProfile: { select: profileSelect },
        users: { select: { id: true, email: true, fullName: true, active: true } },
        _count: { select: { products: true, vendorBookings: true, payouts: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }
  async products(query: { search?: string; vendorId?: string; status?: string; type?: string; page?: number; limit?: number }) {
    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(query.limit) || 25));
    const search = query.search?.trim();
    const where: any = { tenant: { kind: TenantKind.VENDOR }, deletedAt: null, AND: [] };
    if (query.vendorId) where.tenantId = query.vendorId;
    if (search) where.AND.push({ OR: [
      { productCode: { contains: search, mode: 'insensitive' } },
      { tenant: { name: { contains: search, mode: 'insensitive' } } },
      { tenant: { vendorProfile: { legalBusinessName: { contains: search, mode: 'insensitive' } } } },
      { currentRevision: { productName: { contains: search, mode: 'insensitive' } } },
      { revisions: { some: { productName: { contains: search, mode: 'insensitive' } } } },
    ] });
    if (query.type) where.AND.push({ currentRevision: { type: query.type } });
    if (query.status === 'LIVE') where.AND.push({ status: 'LIVE', currentRevision: { status: ProductRevisionStatus.PUBLISHED } });
    if (query.status === 'SUSPENDED' || query.status === 'ARCHIVED') where.AND.push({ status: query.status });
    if (query.status === 'UNDER_REVIEW') where.AND.push({ revisions: { some: { status: ProductRevisionStatus.UNDER_REVIEW } } });
    if (query.status === 'DRAFT') where.AND.push({ OR: [{ status: 'DRAFT' }, { revisions: { some: { status: ProductRevisionStatus.DRAFT } } }] });
    if (!query.status) where.AND.push({ OR: [{ status: { in: [ProductStatus.LIVE, ProductStatus.SUSPENDED, ProductStatus.ARCHIVED] } }, { revisions: { some: { status: ProductRevisionStatus.UNDER_REVIEW } } }] });
    const revisionSelect = { id: true, versionNumber: true, status: true, productName: true, type: true, subCategory: true, cityName: true, stateName: true, countryName: true };
    const [total, rows] = await this.prisma.$transaction([
      this.prisma.product.count({ where }),
      this.prisma.product.findMany({ where, orderBy: { updatedAt: 'desc' }, skip: (page - 1) * limit, take: limit, select: {
        id: true, productCode: true, status: true, updatedAt: true,
        tenant: { select: { id: true, name: true, vendorProfile: { select: { legalBusinessName: true, verificationStatus: true } } } },
        currentRevision: { select: revisionSelect },
        revisions: { where: { status: { in: [ProductRevisionStatus.DRAFT, ProductRevisionStatus.UNDER_REVIEW, ProductRevisionStatus.REJECTED] } }, orderBy: { versionNumber: 'desc' }, take: 1, select: revisionSelect },
        variants: { where: { status: { not: 'ARCHIVED' }, archivedAt: null }, select: { id: true, ratePlans: { where: { status: 'ACTIVE' }, select: { id: true } } } },
      } }),
    ]);
    const items = await Promise.all(rows.map(async (product: any) => {
      const workingRevision = product.revisions[0] || product.currentRevision;
      return { id: product.id, productCode: product.productCode, productStatus: product.status, workingRevisionId: workingRevision?.id || null, workingRevisionStatus: workingRevision?.status || null, name: product.currentRevision?.productName || workingRevision?.productName || product.productCode, type: product.currentRevision?.type || workingRevision?.type || null, subCategory: product.currentRevision?.subCategory || workingRevision?.subCategory || null, destination: [product.currentRevision?.cityName || workingRevision?.cityName, product.currentRevision?.stateName || workingRevision?.stateName, product.currentRevision?.countryName || workingRevision?.countryName].filter(Boolean).join(', '), vendor: { id: product.tenant.id, name: product.tenant.vendorProfile?.legalBusinessName || product.tenant.name, verificationStatus: product.tenant.vendorProfile?.verificationStatus || null }, optionCount: product.variants.length, ratePlanCount: product.variants.reduce((count: number, variant: any) => count + variant.ratePlans.length, 0), updatedAt: product.updatedAt, distribution: this.distributionReadiness ? await this.distributionReadiness.evaluate(product.id) : null };
    }));
    return { items, pagination: { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) } };
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
  async vendor(tenantId: string) { const vendor = await this.prisma.tenant.findFirst({ where: { id: tenantId, kind: TenantKind.VENDOR }, include: { ...documentsInclude, vendorProfile: { select: profileSelect }, users: { select: { id: true, email: true, fullName: true, active: true } }, products: { include: { currentRevision: true, variants: { include: { ratePlans: true } } }, orderBy: { updatedAt: 'desc' } }, _count: { select: { vendorBookings: true, payouts: true } } } }); if (!vendor) throw new NotFoundException('Vendor not found'); if (!this.distributionReadiness) return vendor; const products = await Promise.all(vendor.products.map(async (product: any) => ({ ...product, distribution: await this.distributionReadiness!.evaluate(product.id) }))); return { ...vendor, products }; }
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
