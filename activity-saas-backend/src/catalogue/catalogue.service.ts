import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, ProductRevisionStatus, ProductStatus, UserRole, VariantStatus } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { AuthUser } from '../common/auth.types';
import { requireTenant } from '../common/tenant';
import { OutboxService } from '../outbox/outbox.service';
import { PrismaService } from '../prisma/prisma.service';
import { FilePurpose, FileVisibility } from '@prisma/client';
import { StorageService } from '../storage/storage.service';
import { validateFulfilmentPolicy } from '../fulfilment/fulfilment.types';
import { ArchiveVariantDto, CreateProductDto, CreateProductRevisionDto, ProductMediaDto, ProductMediaUploadDto, ProductQueryDto, ProductRevisionDto, RejectProductRevisionDto, UpdateProductRevisionDto, UpdateVariantDto, VariantDto } from './catalogue.dto';

const revisionInclude = { media: { where: { archivedAt: null }, orderBy: { rank: 'asc' as const } }, bookingQuestions: { where: { archivedAt: null }, orderBy: [{ rank: 'asc' as const }, { code: 'asc' as const }] }, fulfilmentPolicy: true, product: { select: { id: true, tenantId: true, productCode: true, status: true, currentRevisionId: true } } };
const variantInclude = { ratePlans: { include: { travellerRules: true, cancellationRules: { orderBy: { minDaysBefore: 'desc' as const } } }, orderBy: { createdAt: 'asc' as const } } };

@Injectable()
export class CatalogueService {
  constructor(private readonly prisma: PrismaService, private readonly audit: AuditService, private readonly outbox: OutboxService, private readonly storage: StorageService) {}

  private data(dto: ProductRevisionDto | UpdateProductRevisionDto): Prisma.ProductRevisionUncheckedCreateInput {
    const { faqs, sourcePayload, fulfilmentPolicy: _fulfilmentPolicy, ...rest } = dto as ProductRevisionDto;
    return { ...rest, ...(faqs !== undefined ? { faqs: faqs as Prisma.InputJsonValue } : {}), ...(sourcePayload !== undefined ? { sourcePayload: sourcePayload as Prisma.InputJsonValue } : {}) } as Prisma.ProductRevisionUncheckedCreateInput;
  }

  private policyData(input: any) {
    return { mode: input.mode ?? null, requiredEvidenceKinds: input.requiredEvidenceKinds ?? [], evidenceMatchMode: input.evidenceMatchMode ?? 'ALL', reviewRequired: input.reviewRequired ?? false, emergencyContactName: input.emergencyContactName?.trim() || null, emergencyContactPhone: input.emergencyContactPhone?.trim() || null, emergencyContactEmail: input.emergencyContactEmail?.trim() || null, operationsContactName: input.operationsContactName?.trim() || null, operationsContactPhone: input.operationsContactPhone?.trim() || null, operationsContactEmail: input.operationsContactEmail?.trim() || null, voucherNotes: (input.voucherNotes ?? []).map((item: string) => item.trim()).filter(Boolean) };
  }

  private async product(user: AuthUser, id: string) {
    const tenantId = requireTenant(user);
    const found = await this.prisma.product.findFirst({ where: { id, tenantId } });
    if (!found) throw new NotFoundException('Product not found');
    return found;
  }

  private assertMutableRevision(revision: { status: ProductRevisionStatus }) {
    if (revision.status !== ProductRevisionStatus.DRAFT) throw new ConflictException('Only a DRAFT revision can be changed');
  }

  async list(user: AuthUser, query: ProductQueryDto) {
    const tenantId = requireTenant(user);
    return this.prisma.product.findMany({ where: { tenantId, ...(query.search ? { productCode: { contains: query.search, mode: 'insensitive' } } : {}), ...(query.revisionStatus ? { revisions: { some: { status: query.revisionStatus } } } : {}) }, include: { currentRevision: true, revisions: { where: { status: { in: [ProductRevisionStatus.DRAFT, ProductRevisionStatus.UNDER_REVIEW, ProductRevisionStatus.REJECTED] } }, orderBy: { versionNumber: 'desc' }, take: 1 }, _count: { select: { variants: true, bookings: true } } }, orderBy: { updatedAt: 'desc' } });
  }

  async get(user: AuthUser, id: string) {
    await this.product(user, id);
    return this.prisma.product.findFirstOrThrow({ where: { id }, include: { currentRevision: { include: { media: { where: { archivedAt: null }, orderBy: { rank: 'asc' } } } }, revisions: { orderBy: { versionNumber: 'desc' }, include: { media: { where: { archivedAt: null }, orderBy: { rank: 'asc' } } } }, variants: { where: { status: { not: VariantStatus.ARCHIVED } }, include: variantInclude }, _count: { select: { variants: true, bookings: true } } } });
  }

  async create(user: AuthUser, dto: CreateProductDto) {
    const tenantId = requireTenant(user);
    if (!dto.initialRevision) throw new BadRequestException('initialRevision is required');
    const created = await this.prisma.$transaction(async (tx) => {
      const product = await tx.product.create({ data: { tenantId, productCode: dto.productCode, status: ProductStatus.DRAFT } });
      const revision = await tx.productRevision.create({ data: { ...this.data(dto.initialRevision), productId: product.id, versionNumber: 1, createdById: user.sub } });
      if (dto.initialRevision.fulfilmentPolicy) await tx.productFulfilmentPolicy.create({ data: { productRevisionId: revision.id, ...this.policyData(dto.initialRevision.fulfilmentPolicy) } });
      await this.audit.write(tx, { actor: user, tenantId, action: 'PRODUCT_CREATED', entityType: 'Product', entityId: product.id, afterState: { productCode: product.productCode, status: product.status } });
      return product;
    }).catch((error) => {
      if (error?.code === 'P2002') throw new ConflictException('A product with this productCode already exists');
      throw error;
    });
    return this.get(user, created.id);
  }

  async createRevision(user: AuthUser, productId: string, dto: CreateProductRevisionDto = {}) {
    const product = await this.product(user, productId);
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "Product" WHERE "id" = ${productId} FOR UPDATE`);
      const working = await tx.productRevision.findFirst({ where: { productId, status: { in: [ProductRevisionStatus.DRAFT, ProductRevisionStatus.UNDER_REVIEW] } }, orderBy: { versionNumber: 'desc' } });
      if (working) return working;
      const published = await tx.productRevision.findFirst({ where: { productId, status: ProductRevisionStatus.PUBLISHED }, orderBy: { versionNumber: 'desc' }, include: { media: { where: { archivedAt: null } }, bookingQuestions: { where: { archivedAt: null } }, fulfilmentPolicy: true } });
      const latest = await tx.productRevision.findFirst({ where: { productId }, orderBy: { versionNumber: 'desc' }, include: { media: { where: { archivedAt: null } }, bookingQuestions: { where: { archivedAt: null } }, fulfilmentPolicy: true } });
      let source = published;
      if (dto.sourceRevisionId) {
        source = await tx.productRevision.findFirst({ where: { id: dto.sourceRevisionId, productId, status: { in: [ProductRevisionStatus.PUBLISHED, ProductRevisionStatus.REJECTED, ProductRevisionStatus.SUPERSEDED] } }, include: { media: { where: { archivedAt: null } }, bookingQuestions: { where: { archivedAt: null } }, fulfilmentPolicy: true } });
        if (!source) throw new ConflictException('Source revision must belong to this Product and be immutable history');
      } else if (latest?.status === ProductRevisionStatus.REJECTED && (!published || latest.versionNumber > published.versionNumber)) {
        source = latest;
      } else {
        source = published ?? latest;
      }
      if (!source) throw new ConflictException('Product has no revision to clone');
      const maxVersion = await tx.productRevision.aggregate({ where: { productId }, _max: { versionNumber: true } });
      const { id: _id, createdAt: _createdAt, updatedAt: _updatedAt, versionNumber: _version, status: _status, rejectionReason: _reason, submittedAt: _submitted, reviewedAt: _reviewed, reviewedById: _reviewedBy, createdById: _createdBy, productId: _productId, sourcePayload: _sourcePayload, media: sourceMedia, bookingQuestions: sourceQuestions, fulfilmentPolicy: sourcePolicy, ...content } = source;
      const revision = await tx.productRevision.create({ data: { ...content, faqs: (source.faqs ?? []) as Prisma.InputJsonValue, ...(source.sourcePayload ? { sourcePayload: source.sourcePayload as Prisma.InputJsonValue } : {}), productId, versionNumber: (maxVersion._max.versionNumber ?? 0) + 1, createdById: user.sub, status: ProductRevisionStatus.DRAFT } });
      if ((sourceMedia ?? []).length) await tx.productMedia.createMany({ data: sourceMedia.map(({ id: _mediaId, revisionId: _revisionId, createdAt: _mediaCreatedAt, updatedAt: _mediaUpdatedAt, archivedAt: _archivedAt, ...media }) => ({ ...media, revisionId: revision.id })) });
      if ((sourceQuestions ?? []).length) await tx.productBookingQuestion.createMany({ data: sourceQuestions.map(({ id: _questionId, productRevisionId: _sourceRevisionId, createdAt: _questionCreatedAt, updatedAt: _questionUpdatedAt, archivedAt: _questionArchivedAt, options, ...question }) => ({ ...question, productRevisionId: revision.id, ...(options == null ? {} : { options: options as Prisma.InputJsonValue }) })) });
      if (sourcePolicy) await tx.productFulfilmentPolicy.create({ data: { productRevisionId: revision.id, mode: sourcePolicy.mode, requiredEvidenceKinds: sourcePolicy.requiredEvidenceKinds, evidenceMatchMode: sourcePolicy.evidenceMatchMode, reviewRequired: sourcePolicy.reviewRequired, emergencyContactName: sourcePolicy.emergencyContactName, emergencyContactPhone: sourcePolicy.emergencyContactPhone, emergencyContactEmail: sourcePolicy.emergencyContactEmail, operationsContactName: sourcePolicy.operationsContactName, operationsContactPhone: sourcePolicy.operationsContactPhone, operationsContactEmail: sourcePolicy.operationsContactEmail, voucherNotes: sourcePolicy.voucherNotes, migrationMetadata: sourcePolicy.migrationMetadata as Prisma.InputJsonValue | undefined } });
      await this.audit.write(tx, { actor: user, tenantId: product.tenantId, action: 'PRODUCT_REVISION_CREATED', entityType: 'ProductRevision', entityId: revision.id, afterState: { productId, sourceRevisionId: source.id, newRevisionId: revision.id, versionNumber: revision.versionNumber } });
      return revision;
    });
  }

  async listBookingQuestions(user: AuthUser, revisionId: string) {
    const tenantId = requireTenant(user);
    const revision = await this.prisma.productRevision.findFirst({ where: { id: revisionId, product: { tenantId } } });
    if (!revision) throw new NotFoundException('Product revision not found');
    return this.prisma.productBookingQuestion.findMany({ where: { productRevisionId: revisionId, archivedAt: null }, orderBy: [{ rank: 'asc' }, { code: 'asc' }] });
  }

  async createBookingQuestion(user: AuthUser, revisionId: string, dto: import('./catalogue.dto').BookingQuestionDto) {
    const tenantId = requireTenant(user);
    return this.prisma.$transaction(async (tx) => {
      const revision = await tx.productRevision.findFirst({ where: { id: revisionId, product: { tenantId } } });
      if (!revision) throw new NotFoundException('Product revision not found');
      await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "public"."ProductRevision" WHERE "id" = ${revisionId} FOR UPDATE`);
      const locked = await tx.productRevision.findUniqueOrThrow({ where: { id: revisionId } });
      this.assertMutableRevision(locked);
      try {
        const question = await tx.productBookingQuestion.create({ data: { productRevisionId: revisionId, code: dto.code.trim(), label: dto.label.trim(), helpText: dto.helpText?.trim(), type: dto.type, required: dto.required ?? false, options: dto.options as Prisma.InputJsonValue | undefined, appliesPerTraveller: dto.appliesPerTraveller ?? false, rank: dto.rank ?? 0 } });
        await this.audit.write(tx, { actor: user, tenantId, action: 'BOOKING_QUESTION_CREATED', entityType: 'ProductBookingQuestion', entityId: question.id, metadata: { productId: locked.productId, revisionId, questionId: question.id, code: question.code } });
        return question;
      } catch (error: any) { if (error?.code === 'P2002') throw new ConflictException('Question code already exists on this revision'); throw error; }
    });
  }

  async updateBookingQuestion(user: AuthUser, id: string, dto: import('./catalogue.dto').UpdateBookingQuestionDto) {
    const tenantId = requireTenant(user);
    return this.prisma.$transaction(async (tx) => {
      const question = await tx.productBookingQuestion.findFirst({ where: { id, productRevision: { product: { tenantId } } } });
      if (!question) throw new NotFoundException('Booking question not found');
      await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "public"."ProductRevision" WHERE "id" = ${question.productRevisionId} FOR UPDATE`);
      const revision = await tx.productRevision.findUniqueOrThrow({ where: { id: question.productRevisionId } });
      this.assertMutableRevision(revision);
      try {
        const updated = await tx.productBookingQuestion.update({ where: { id }, data: { ...(dto.code === undefined ? {} : { code: dto.code.trim() }), ...(dto.label === undefined ? {} : { label: dto.label.trim() }), ...(dto.helpText === undefined ? {} : { helpText: dto.helpText?.trim() }), ...(dto.type === undefined ? {} : { type: dto.type }), ...(dto.required === undefined ? {} : { required: dto.required }), ...(dto.options === undefined ? {} : { options: dto.options as Prisma.InputJsonValue }), ...(dto.appliesPerTraveller === undefined ? {} : { appliesPerTraveller: dto.appliesPerTraveller }), ...(dto.rank === undefined ? {} : { rank: dto.rank }) } });
        await this.audit.write(tx, { actor: user, tenantId, action: 'BOOKING_QUESTION_UPDATED', entityType: 'ProductBookingQuestion', entityId: id, metadata: { productId: revision.productId, revisionId: revision.id, questionId: id, code: updated.code } });
        return updated;
      } catch (error: any) { if (error?.code === 'P2002') throw new ConflictException('Question code already exists on this revision'); throw error; }
    });
  }

  async archiveBookingQuestion(user: AuthUser, id: string) {
    const tenantId = requireTenant(user);
    return this.prisma.$transaction(async (tx) => {
      const question = await tx.productBookingQuestion.findFirst({ where: { id, productRevision: { product: { tenantId } } } });
      if (!question) throw new NotFoundException('Booking question not found');
      await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "public"."ProductRevision" WHERE "id" = ${question.productRevisionId} FOR UPDATE`);
      const revision = await tx.productRevision.findUniqueOrThrow({ where: { id: question.productRevisionId } });
      this.assertMutableRevision(revision);
      const archived = await tx.productBookingQuestion.update({ where: { id }, data: { archivedAt: new Date() } });
      await this.audit.write(tx, { actor: user, tenantId, action: 'BOOKING_QUESTION_ARCHIVED', entityType: 'ProductBookingQuestion', entityId: id, metadata: { productId: revision.productId, revisionId: revision.id, questionId: id, code: question.code } });
      return archived;
    });
  }

  async updateRevision(user: AuthUser, id: string, dto: UpdateProductRevisionDto) {
    const tenantId = requireTenant(user);
    const existing = await this.prisma.productRevision.findFirst({ where: { id, product: { tenantId } } });
    if (!existing) throw new NotFoundException('Product revision not found');
    return this.prisma.$transaction(async (tx) => {
      const changed = await tx.productRevision.updateMany({ where: { id, status: ProductRevisionStatus.DRAFT }, data: this.data(dto) as Prisma.ProductRevisionUpdateInput });
      if (changed.count !== 1) throw new ConflictException('Revision changed in another session; reload and retry');
      if (dto.fulfilmentPolicy) {
        const policyCheck = validateFulfilmentPolicy(dto.fulfilmentPolicy);
        if (!policyCheck.valid && dto.fulfilmentPolicy.mode) throw new ConflictException(policyCheck.reason);
        await tx.productFulfilmentPolicy.upsert({ where: { productRevisionId: id }, create: { productRevisionId: id, ...this.policyData(dto.fulfilmentPolicy) }, update: this.policyData(dto.fulfilmentPolicy) });
        await this.audit.write(tx, { actor: user, tenantId, action: 'PRODUCT_FULFILMENT_POLICY_UPDATED', entityType: 'ProductFulfilmentPolicy', entityId: id, metadata: { revisionId: id } });
      }
      const updated = await tx.productRevision.findUniqueOrThrow({ where: { id } });
      await this.audit.write(tx, { actor: user, tenantId, action: 'PRODUCT_REVISION_UPDATED', entityType: 'ProductRevision', entityId: id, beforeState: { status: existing.status }, afterState: { status: updated.status } });
      return updated;
    });
  }

  async submitRevision(user: AuthUser, id: string) {
    const tenantId = requireTenant(user);
    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.productRevision.findFirst({ where: { id, product: { tenantId } } });
      if (!existing) throw new NotFoundException('Product revision not found');
      if (existing.status !== ProductRevisionStatus.DRAFT) throw new ConflictException(`Only DRAFT revisions can be submitted; current status is ${existing.status}`);
      const changed = await tx.productRevision.updateMany({ where: { id, status: ProductRevisionStatus.DRAFT }, data: { status: ProductRevisionStatus.UNDER_REVIEW, submittedAt: new Date(), rejectionReason: null } });
      if (changed.count !== 1) throw new ConflictException('Revision changed in another session');
      await this.audit.write(tx, { actor: user, tenantId, action: 'PRODUCT_REVISION_SUBMITTED', entityType: 'ProductRevision', entityId: id, beforeState: { status: existing.status }, afterState: { status: ProductRevisionStatus.UNDER_REVIEW } });
      await this.outbox.enqueue(tx, { tenantId, eventType: 'PRODUCT_SUBMITTED', aggregateType: 'ProductRevision', aggregateId: id, payload: { productId: existing.productId, versionNumber: existing.versionNumber } });
      return tx.productRevision.findUniqueOrThrow({ where: { id } });
    });
  }

  async review(user: AuthUser, id: string, decision: 'publish' | 'reject', dto?: RejectProductRevisionDto) {
    if (user.role !== UserRole.ADMIN && user.role !== UserRole.SUB_ADMIN) throw new ConflictException('Only platform reviewers can review product revisions');
    if (decision === 'reject' && (!dto?.reason?.trim() || dto.reason.trim().length < 5)) throw new ConflictException('A rejection reason of at least 5 characters is required');
    return this.prisma.$transaction(async (tx) => {
      const candidate = await tx.productRevision.findFirst({ where: { id, product: { tenant: { kind: 'VENDOR' } } }, include: { product: true } });
      if (!candidate) throw new NotFoundException('Product revision not found');
      if (candidate.status !== ProductRevisionStatus.UNDER_REVIEW) throw new ConflictException(`Only UNDER_REVIEW revisions can be reviewed; current status is ${candidate.status}`);
      await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "Product" WHERE "id" = ${candidate.productId} FOR UPDATE`);
      if (decision === 'reject') {
        const changed = await tx.productRevision.updateMany({ where: { id, status: ProductRevisionStatus.UNDER_REVIEW }, data: { status: ProductRevisionStatus.REJECTED, rejectionReason: dto!.reason.trim(), reviewedAt: new Date(), reviewedById: user.sub } });
        if (changed.count !== 1) throw new ConflictException('Revision changed in another session; only one review action can win');
        await this.audit.write(tx, { actor: user, tenantId: candidate.product.tenantId, action: 'PRODUCT_REVISION_REJECTED', entityType: 'ProductRevision', entityId: id, reason: dto!.reason, beforeState: { status: candidate.status }, afterState: { status: ProductRevisionStatus.REJECTED } });
        await this.outbox.enqueue(tx, { tenantId: candidate.product.tenantId, eventType: 'PRODUCT_REJECTED', aggregateType: 'ProductRevision', aggregateId: id, payload: { productId: candidate.productId, reason: dto!.reason.trim() } });
      } else {
        if (candidate.product.currentRevisionId) {
          const superseded = await tx.productRevision.updateMany({ where: { id: candidate.product.currentRevisionId, productId: candidate.productId, status: ProductRevisionStatus.PUBLISHED }, data: { status: ProductRevisionStatus.SUPERSEDED } });
          if (superseded.count !== 1) throw new ConflictException('Current published revision changed in another session');
        }
        const changed = await tx.productRevision.updateMany({ where: { id, productId: candidate.productId, status: ProductRevisionStatus.UNDER_REVIEW }, data: { status: ProductRevisionStatus.PUBLISHED, reviewedAt: new Date(), reviewedById: user.sub, rejectionReason: null } });
        if (changed.count !== 1) throw new ConflictException('Revision changed in another session; only one review action can win');
        await tx.product.update({ where: { id: candidate.productId }, data: { currentRevisionId: id, status: ProductStatus.LIVE } });
        await this.audit.write(tx, { actor: user, tenantId: candidate.product.tenantId, action: 'PRODUCT_REVISION_PUBLISHED', entityType: 'ProductRevision', entityId: id, beforeState: { status: candidate.status, currentRevisionId: candidate.product.currentRevisionId }, afterState: { status: ProductRevisionStatus.PUBLISHED, currentRevisionId: id } });
        await this.outbox.enqueue(tx, { tenantId: candidate.product.tenantId, eventType: 'PRODUCT_PUBLISHED', aggregateType: 'Product', aggregateId: candidate.productId, payload: { revisionId: id, versionNumber: candidate.versionNumber } });
      }
      return tx.product.findUniqueOrThrow({ where: { id: candidate.productId }, include: { currentRevision: true } });
    });
  }

  async listReview() {
    return this.prisma.productRevision.findMany({
      where: { status: ProductRevisionStatus.UNDER_REVIEW },
      include: { product: { include: { tenant: { select: { id: true, name: true, vendorProfile: { select: { legalBusinessName: true, verificationStatus: true } } } }, variants: { select: { id: true, variantCode: true, name: true, status: true, _count: { select: { ratePlans: true } } } } } } },
      orderBy: { submittedAt: 'asc' },
    });
  }
  async variants(user: AuthUser, productId: string) { await this.product(user, productId); return this.prisma.productVariant.findMany({ where: { productId, status: { not: VariantStatus.ARCHIVED } }, include: variantInclude, orderBy: { createdAt: 'asc' } }); }
  async createVariant(user: AuthUser, productId: string, dto: VariantDto) { const product = await this.product(user, productId); const { sourcePayload, ...rest } = dto; try { return await this.prisma.$transaction(async (tx) => { const created = await tx.productVariant.create({ data: { productId, ...rest, ...(sourcePayload ? { sourcePayload: sourcePayload as Prisma.InputJsonValue } : {}) } }); await this.audit.write(tx, { actor: user, tenantId: product.tenantId, action: 'PRODUCT_VARIANT_CREATED', entityType: 'ProductVariant', entityId: created.id, afterState: { variantCode: created.variantCode, status: created.status } }); await this.outbox.enqueue(tx, { tenantId: product.tenantId, eventType: 'PRODUCT_VARIANT_CREATED', aggregateType: 'ProductVariant', aggregateId: created.id, payload: { productId, variantCode: created.variantCode } }); return created; }); } catch (error: any) { if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') throw new ConflictException('A variant with this variantCode already exists for the product'); throw error; } }
  async updateVariant(user: AuthUser, id: string, dto: UpdateVariantDto) { const tenantId = requireTenant(user); const existing = await this.prisma.productVariant.findFirst({ where: { id, product: { tenantId } } }); if (!existing) throw new NotFoundException('Product variant not found'); if (!Number.isInteger(dto.expectedVersion) || dto.expectedVersion < 1) throw new BadRequestException('expectedVersion is required'); const attempted = dto as UpdateVariantDto & { variantCode?: string; status?: VariantStatus; archivedAt?: Date }; if (attempted.variantCode !== undefined || attempted.status !== undefined || attempted.archivedAt !== undefined) throw new ConflictException('Variant code and lifecycle status are immutable; use archive'); const { expectedVersion: _expectedVersion, sourcePayload, ...rest } = dto; return this.prisma.$transaction(async (tx) => { const changed = await tx.productVariant.updateMany({ where: { id, version: dto.expectedVersion, status: { not: VariantStatus.ARCHIVED }, archivedAt: null }, data: { ...rest, version: { increment: 1 }, ...(sourcePayload !== undefined ? { sourcePayload: sourcePayload as Prisma.InputJsonValue } : {}) } }); if (changed.count !== 1) throw new ConflictException('Variant changed in another session; reload and retry'); const updated = await tx.productVariant.findUniqueOrThrow({ where: { id } }); await this.audit.write(tx, { actor: user, tenantId, action: 'PRODUCT_VARIANT_UPDATED', entityType: 'ProductVariant', entityId: id, beforeState: { name: existing.name, version: existing.version, status: existing.status }, afterState: { name: updated.name, version: updated.version, status: updated.status } }); await this.outbox.enqueue(tx, { tenantId, eventType: 'PRODUCT_VARIANT_UPDATED', aggregateType: 'ProductVariant', aggregateId: id, payload: { productId: existing.productId, version: updated.version } }); return updated; }); }
  async archiveVariant(user: AuthUser, id: string, dto: ArchiveVariantDto) { const tenantId = requireTenant(user); const existing = await this.prisma.productVariant.findFirst({ where: { id, product: { tenantId } } }); if (!existing) throw new NotFoundException('Product variant not found'); if (!Number.isInteger(dto.expectedVersion) || dto.expectedVersion < 1) throw new BadRequestException('expectedVersion is required'); return this.prisma.$transaction(async (tx) => { const changed = await tx.productVariant.updateMany({ where: { id, version: dto.expectedVersion, status: { not: VariantStatus.ARCHIVED }, archivedAt: null }, data: { status: VariantStatus.ARCHIVED, archivedAt: new Date(), version: { increment: 1 } } }); if (changed.count !== 1) throw new ConflictException('Variant changed in another session; reload and retry'); const updated = await tx.productVariant.findUniqueOrThrow({ where: { id } }); await this.audit.write(tx, { actor: user, tenantId, action: 'PRODUCT_VARIANT_ARCHIVED', entityType: 'ProductVariant', entityId: id, beforeState: { status: existing.status, version: existing.version, archivedAt: existing.archivedAt }, afterState: { status: updated.status, version: updated.version, archivedAt: updated.archivedAt } }); await this.outbox.enqueue(tx, { tenantId, eventType: 'PRODUCT_VARIANT_ARCHIVED', aggregateType: 'ProductVariant', aggregateId: id, payload: { productId: existing.productId, version: updated.version } }); return updated; }); }
  async addMedia(user: AuthUser, revisionId: string, dto: ProductMediaDto) { const tenantId = requireTenant(user); const revision = await this.prisma.productRevision.findFirst({ where: { id: revisionId, product: { tenantId } } }); if (!revision) throw new NotFoundException('Product revision not found'); this.assertMutableRevision(revision); if ((dto.fileAssetId && dto.externalUrl) || (!dto.fileAssetId && !dto.externalUrl)) throw new ConflictException('Provide exactly one of fileAssetId or externalUrl'); if (dto.fileAssetId) { const asset = await this.prisma.fileAsset.findFirst({ where: { id: dto.fileAssetId, tenantId, purpose: FilePurpose.PRODUCT_MEDIA, visibility: FileVisibility.PUBLIC } }); if (!asset) throw new NotFoundException('Product media file not found'); } return this.prisma.$transaction(async (tx) => { const current = await tx.productRevision.findFirst({ where: { id: revisionId, productId: revision.productId } }); if (!current) throw new NotFoundException('Product revision not found'); this.assertMutableRevision(current); const media = await tx.productMedia.create({ data: { revisionId, ...dto } }); await this.audit.write(tx, { actor: user, tenantId, action: 'PRODUCT_MEDIA_ADDED', entityType: 'ProductMedia', entityId: media.id, afterState: { productId: revision.productId, revisionId, mediaId: media.id, kind: media.kind } }); return media; }); }
  async uploadMedia(user: AuthUser, revisionId: string, file: any, dto: ProductMediaUploadDto) { const tenantId = requireTenant(user); if (!file?.buffer?.length) throw new ConflictException('An image file is required'); if (file.size > 10 * 1024 * 1024) throw new ConflictException('Product images must be 10 MB or smaller'); if (dto.kind !== 'IMAGE') throw new ConflictException('Only image uploads are supported; add video as an external URL'); const detected = file.buffer[0] === 0xff && file.buffer[1] === 0xd8 && file.buffer[2] === 0xff ? { mimeType: 'image/jpeg', extension: '.jpg' } : file.buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) ? { mimeType: 'image/png', extension: '.png' } : file.buffer.subarray(0, 4).toString() === 'RIFF' && file.buffer.subarray(8, 12).toString() === 'WEBP' ? { mimeType: 'image/webp', extension: '.webp' } : null; if (!detected) throw new ConflictException('Unsupported or invalid image signature; JPEG, PNG, or WebP required'); const revision = await this.prisma.productRevision.findFirst({ where: { id: revisionId, product: { tenantId } } }); if (!revision) throw new NotFoundException('Product revision not found'); this.assertMutableRevision(revision); const saved = await this.storage.save(file.buffer, FilePurpose.PRODUCT_MEDIA, detected.extension); try { return await this.prisma.$transaction(async (tx) => { const current = await tx.productRevision.findFirst({ where: { id: revisionId, productId: revision.productId } }); if (!current) throw new NotFoundException('Product revision not found'); this.assertMutableRevision(current); const asset = await tx.fileAsset.create({ data: { tenantId, storageKey: saved.storageKey, originalName: file.originalname || `product-media${detected.extension}`, mimeType: detected.mimeType, sizeBytes: saved.sizeBytes, visibility: FileVisibility.PUBLIC, purpose: FilePurpose.PRODUCT_MEDIA, entityType: 'ProductRevision', entityId: revisionId, createdById: user.sub } }); const media = await tx.productMedia.create({ data: { revisionId, kind: dto.kind, fileAssetId: asset.id, description: dto.description, seoTitle: dto.seoTitle, seoDescription: dto.seoDescription, rank: dto.rank || 1 } }); await this.audit.write(tx, { actor: user, tenantId, action: 'PRODUCT_MEDIA_UPLOADED', entityType: 'ProductMedia', entityId: media.id, afterState: { productId: revision.productId, revisionId, mediaId: media.id, kind: media.kind } }); return media; }); } catch (error) { await this.storage.remove(saved.storageKey); throw error; } }
  async archiveMedia(user: AuthUser, revisionId: string, mediaId: string) { const tenantId = requireTenant(user); const revision = await this.prisma.productRevision.findFirst({ where: { id: revisionId, product: { tenantId } } }); if (!revision) throw new NotFoundException('Product revision not found'); this.assertMutableRevision(revision); return this.prisma.$transaction(async (tx) => { const current = await tx.productRevision.findFirst({ where: { id: revisionId, productId: revision.productId } }); if (!current) throw new NotFoundException('Product revision not found'); this.assertMutableRevision(current); const media = await tx.productMedia.findFirst({ where: { id: mediaId, revisionId } }); if (!media) throw new NotFoundException('Media not found'); const updated = await tx.productMedia.update({ where: { id: mediaId }, data: { archivedAt: new Date() } }); await this.audit.write(tx, { actor: user, tenantId, action: 'PRODUCT_MEDIA_ARCHIVED', entityType: 'ProductMedia', entityId: mediaId, beforeState: { productId: revision.productId, revisionId, mediaId, kind: media.kind }, afterState: { productId: revision.productId, revisionId, mediaId, kind: media.kind, archivedAt: updated.archivedAt } }); return updated; }); }
}
