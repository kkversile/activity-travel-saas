import { Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";
import { CatalogStatus as PrismaCatalogStatus } from "@prisma/client";
import { paginated, parsePaginationQuery } from "../../common/pagination/pagination";
import { CreateCategoryDto, UpdateCategoryDto } from "./dto/category.dto";
import { CategoryQueryDto } from "./dto/category-query.dto";

@Injectable()
export class CategoriesService {
  constructor(private readonly prisma: PrismaService) {}
  async list(tenantId: string, query: CategoryQueryDto) { const parsed = parsePaginationQuery(query, ["name", "slug", "createdAt", "updatedAt"], "name"); const where = { tenantId, ...(query.status ? { status: query.status as PrismaCatalogStatus } : {}), ...(parsed.search ? { OR: [{ name: { contains: parsed.search, mode: "insensitive" as const } }, { slug: { contains: parsed.search, mode: "insensitive" as const } }] } : {}) }; const [data, total] = await this.prisma.$transaction([this.prisma.category.findMany({ where, include: { _count: { select: { activities: true } } }, orderBy: { [parsed.sortBy]: parsed.sortOrder }, skip: (parsed.page - 1) * parsed.pageSize, take: parsed.pageSize }), this.prisma.category.count({ where })]); return paginated(data, parsed.page, parsed.pageSize, total); }
  async create(tenantId: string, dto: CreateCategoryDto, actorUserId?: string) { const result = await this.prisma.category.create({ data: { tenantId, name: dto.name, slug: dto.slug, description: dto.description, displayOrder: dto.displayOrder, status: dto.status as PrismaCatalogStatus | undefined } }); await this.prisma.auditLog.create({ data: { tenantId, actorUserId, action: "CATEGORY_CREATED", entityType: "Category", entityId: result.id, metadata: { name: result.name } } }); return result; }
  async get(tenantId: string, id: string) { const result = await this.prisma.category.findFirst({ where: { id, tenantId }, include: { _count: { select: { activities: true } } } }); if (!result) throw new NotFoundException("Category not found"); return result; }
  async update(tenantId: string, id: string, dto: UpdateCategoryDto, actorUserId?: string) { await this.get(tenantId, id); const result = await this.prisma.category.update({ where: { id }, data: { name: dto.name, slug: dto.slug, description: dto.description, displayOrder: dto.displayOrder, status: dto.status as PrismaCatalogStatus | undefined } }); await this.prisma.auditLog.create({ data: { tenantId, actorUserId, action: "CATEGORY_UPDATED", entityType: "Category", entityId: id } }); return result; }
  async remove(tenantId: string, id: string, actorUserId?: string) { await this.get(tenantId, id); await this.prisma.category.update({ where: { id }, data: { status: "ARCHIVED" } }); await this.prisma.auditLog.create({ data: { tenantId, actorUserId, action: "CATEGORY_ARCHIVED", entityType: "Category", entityId: id } }); return { success: true }; }
}
