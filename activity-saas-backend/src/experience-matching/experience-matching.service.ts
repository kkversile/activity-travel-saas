import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { createHash, randomUUID } from 'crypto';
import { ExperienceDisplayMode, OfferSelectionPolicy, Prisma, ProductMatchSuggestionStatus, ProductStatus, TenantKind } from '@prisma/client';
import { AuthUser } from '../common/auth.types';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma/prisma.service';
import { CreateExperienceMasterDto, ExperienceProductSearchDto, LinkExperienceProductDto, UpdateExperienceMasterDto } from './experience-matching.dto';

const productInclude = { currentRevision: true, tenant: { select: { id: true, name: true, vendorProfile: { select: { legalBusinessName: true, verificationStatus: true } } } } } as const;

function normalize(value: unknown) { return String(value ?? '').trim().toLocaleLowerCase().replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim(); }
function fingerprint(revision: any) { return createHash('sha256').update([revision.productName, revision.type, revision.cityName, revision.stateName, revision.countryName].map(normalize).join('|')).digest('hex'); }

@Injectable()
export class ExperienceMatchingService {
  constructor(private readonly prisma: PrismaService, private readonly audit: AuditService) {}

  private async product(id: string) {
    const value: any = await this.prisma.product.findFirst({ where: { id, deletedAt: null, tenant: { kind: TenantKind.VENDOR } }, include: productInclude });
    if (!value?.currentRevision) throw new NotFoundException('Vendor product with a current revision not found');
    return value;
  }

  private async refreshSuggestions() {
    const products: any[] = await this.prisma.product.findMany({ where: { deletedAt: null, status: { not: ProductStatus.ARCHIVED }, tenant: { kind: TenantKind.VENDOR } }, include: productInclude, orderBy: { id: 'asc' } });
    const groups = new Map<string, any[]>();
    for (const item of products) { if (!item.currentRevision) continue; const key = fingerprint(item.currentRevision); const group = groups.get(key) ?? []; group.push(item); groups.set(key, group); }
    for (const [key, group] of groups) {
      for (let left = 0; left < group.length; left += 1) for (let right = left + 1; right < group.length; right += 1) {
        if (group[left].tenantId === group[right].tenantId) continue;
        await this.prisma.productMatchSuggestion.upsert({ where: { sourceProductId_candidateProductId: { sourceProductId: group[left].id, candidateProductId: group[right].id } }, update: { fingerprint: key }, create: { sourceProductId: group[left].id, candidateProductId: group[right].id, fingerprint: key, confidence: 100 } });
      }
    }
  }

  async products(query: ExperienceProductSearchDto) {
    const page = Math.max(1, Number(query.page) || 1); const limit = Math.min(100, Math.max(1, Number(query.limit) || 25)); const term = query.search?.trim();
    const where: any = { deletedAt: null, tenant: { kind: TenantKind.VENDOR }, ...(query.vendorId ? { tenantId: query.vendorId } : {}) };
    if (term) where.OR = [{ productCode: { contains: term, mode: 'insensitive' } }, { currentRevision: { productName: { contains: term, mode: 'insensitive' } } }, { tenant: { name: { contains: term, mode: 'insensitive' } } }, { tenant: { vendorProfile: { legalBusinessName: { contains: term, mode: 'insensitive' } } } }];
    const [total, rows] = await this.prisma.$transaction([this.prisma.product.count({ where }), this.prisma.product.findMany({ where, include: productInclude, orderBy: { updatedAt: 'desc' }, skip: (page - 1) * limit, take: limit })]);
    return { items: rows.filter((row: any) => row.currentRevision).map((row: any) => this.productSummary(row)), pagination: { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) } };
  }

  private productSummary(row: any) {
    const r = row.currentRevision; return { id: row.id, productCode: row.productCode, name: r?.productName || row.productCode, type: r?.type, subType: r?.subType, cityName: r?.cityName || null, stateName: r?.stateName || null, countryName: r?.countryName || null, destination: [r?.cityName, r?.stateName, r?.countryName].filter(Boolean).join(', '), vendor: { id: row.tenant.id, name: row.tenant.vendorProfile?.legalBusinessName || row.tenant.name }, status: row.status, experienceMasterId: row.experienceMasterId || null };
  }

  async suggestions() {
    await this.refreshSuggestions();
    const rows: any[] = await this.prisma.productMatchSuggestion.findMany({ where: { status: ProductMatchSuggestionStatus.PENDING }, include: { sourceProduct: { include: productInclude }, candidateProduct: { include: productInclude } }, orderBy: { createdAt: 'desc' }, take: 100 });
    return rows.map((row) => ({ id: row.id, confidence: row.confidence, fingerprint: row.fingerprint, source: this.productSummary(row.sourceProduct), candidate: this.productSummary(row.candidateProduct) }));
  }

  async masters() {
    const rows: any[] = await this.prisma.experienceMaster.findMany({ include: { products: { include: productInclude, orderBy: { updatedAt: 'desc' } }, placements: true }, orderBy: { updatedAt: 'desc' } });
    return rows.map((master) => ({ ...master, products: master.products.map((item: any) => this.productSummary(item)) }));
  }

  async createMaster(actor: AuthUser, dto: CreateExperienceMasterDto) {
    const source: any = await this.product(dto.productId);
    const master: any = await this.prisma.$transaction(async (tx) => {
      const created = await tx.experienceMaster.create({ data: { id: randomUUID(), canonicalName: dto.canonicalName.trim(), type: source.currentRevision.type, subType: source.currentRevision.subType || null, cityName: source.currentRevision.cityName, stateName: source.currentRevision.stateName, countryName: source.currentRevision.countryName, displayMode: dto.displayMode ?? ExperienceDisplayMode.SINGLE_OFFER, selectionPolicy: dto.selectionPolicy ?? OfferSelectionPolicy.CHEAPEST, createdById: actor.sub, updatedById: actor.sub } });
      await tx.product.update({ where: { id: source.id }, data: { experienceMasterId: created.id } });
      await tx.experienceOfferPlacement.create({ data: { experienceMasterId: created.id, productId: source.id, placementType: 'PREFERRED', priority: 0, reason: 'Initial canonical offer' } });
      await this.audit.write(tx, { actor, action: 'EXPERIENCE_MASTER_CREATED', entityType: 'ExperienceMaster', entityId: created.id, afterState: { canonicalName: created.canonicalName, productId: source.id } });
      return created;
    });
    return this.detail(master.id);
  }

  async detail(id: string) {
    const master: any = await this.prisma.experienceMaster.findUnique({ where: { id }, include: { products: { include: productInclude, orderBy: { updatedAt: 'desc' } }, placements: true } });
    if (!master) throw new NotFoundException('Experience master not found');
    return { ...master, products: master.products.map((item: any) => this.productSummary(item)) };
  }

  async link(actor: AuthUser, masterId: string, dto: LinkExperienceProductDto) {
    const source: any = await this.product(dto.productId); const master = await this.prisma.experienceMaster.findUnique({ where: { id: masterId }, select: { id: true } }); if (!master) throw new NotFoundException('Experience master not found');
    const linked: any = await this.prisma.product.findUnique({ where: { id: source.id }, select: { experienceMasterId: true } });
    if (linked?.experienceMasterId && linked.experienceMasterId !== masterId) throw new ConflictException('Product is already linked to another experience master');
    await this.prisma.$transaction(async (tx) => {
      await tx.product.update({ where: { id: source.id }, data: { experienceMasterId: masterId } });
      await tx.experienceOfferPlacement.upsert({ where: { experienceMasterId_productId: { experienceMasterId: masterId, productId: source.id } }, update: { priority: dto.priority ?? 0, reason: dto.reason?.trim() || null }, create: { experienceMasterId: masterId, productId: source.id, priority: dto.priority ?? 0, reason: dto.reason?.trim() || null } });
      await tx.productMatchSuggestion.updateMany({ where: { OR: [{ sourceProductId: source.id }, { candidateProductId: source.id }], status: ProductMatchSuggestionStatus.PENDING }, data: { status: ProductMatchSuggestionStatus.ACCEPTED, experienceMasterId: masterId } });
      await this.audit.write(tx, { actor, action: 'EXPERIENCE_PRODUCT_LINKED', entityType: 'ExperienceMaster', entityId: masterId, afterState: { productId: source.id, reason: dto.reason || null } });
    });
    return this.detail(masterId);
  }

  async unlink(actor: AuthUser, masterId: string, productId: string) {
    const count = await this.prisma.product.count({ where: { experienceMasterId: masterId } }); if (count <= 1) throw new ConflictException('An experience master must keep at least one product');
    await this.prisma.$transaction(async (tx) => { await tx.product.update({ where: { id: productId }, data: { experienceMasterId: null } }); await tx.experienceOfferPlacement.deleteMany({ where: { experienceMasterId: masterId, productId } }); await this.audit.write(tx, { actor, action: 'EXPERIENCE_PRODUCT_UNLINKED', entityType: 'ExperienceMaster', entityId: masterId, afterState: { productId } }); });
    return this.detail(masterId);
  }

  async update(actor: AuthUser, id: string, dto: UpdateExperienceMasterDto) {
    await this.detail(id); const updated = await this.prisma.experienceMaster.update({ where: { id }, data: { ...(dto.canonicalName === undefined ? {} : { canonicalName: dto.canonicalName.trim() }), ...(dto.displayMode === undefined ? {} : { displayMode: dto.displayMode }), ...(dto.selectionPolicy === undefined ? {} : { selectionPolicy: dto.selectionPolicy }), updatedById: actor.sub } });
    await this.audit.write(this.prisma, { actor, action: 'EXPERIENCE_MASTER_UPDATED', entityType: 'ExperienceMaster', entityId: id, afterState: dto as Prisma.InputJsonValue }); return updated;
  }

  async rejectSuggestion(actor: AuthUser, id: string) { const row = await this.prisma.productMatchSuggestion.update({ where: { id }, data: { status: ProductMatchSuggestionStatus.REJECTED } }); await this.audit.write(this.prisma, { actor, action: 'EXPERIENCE_MATCH_REJECTED', entityType: 'ProductMatchSuggestion', entityId: id }); return row; }
}
