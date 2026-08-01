import { Injectable, NotFoundException } from "@nestjs/common";
import { CatalogStatus as PrismaCatalogStatus } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import { paginated, parsePaginationQuery } from "../../common/pagination/pagination";
import { CreateDestinationDto, UpdateDestinationDto } from "./dto/destination.dto";
import { DestinationQueryDto } from "./dto/destination-query.dto";

@Injectable()
export class DestinationsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(tenantId: string, query: DestinationQueryDto) {
    const parsed = parsePaginationQuery(query, ["name", "slug", "createdAt", "updatedAt"], "name");
    const where = {
      tenantId,
      ...(query.country ? { country: { equals: query.country, mode: "insensitive" as const } } : {}),
      ...(query.state ? { state: { equals: query.state, mode: "insensitive" as const } } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(parsed.search ? { OR: [{ name: { contains: parsed.search, mode: "insensitive" as const } }, { slug: { contains: parsed.search, mode: "insensitive" as const } }] } : {})
    };
    const [data, total] = await this.prisma.$transaction([
      this.prisma.destination.findMany({ where, include: { _count: { select: { activities: true } } }, orderBy: { [parsed.sortBy]: parsed.sortOrder }, skip: (parsed.page - 1) * parsed.pageSize, take: parsed.pageSize }),
      this.prisma.destination.count({ where })
    ]);
    return paginated(data, parsed.page, parsed.pageSize, total);
  }

  async create(tenantId: string, dto: CreateDestinationDto) {
    const result = await this.prisma.destination.create({ data: { tenantId, name: dto.city, slug: `${dto.country}-${dto.city}`.toLowerCase().replace(/[^a-z0-9]+/g, "-"), country: dto.country, state: dto.state, city: dto.city, latitude: dto.latitude === undefined ? undefined : Number(dto.latitude), longitude: dto.longitude === undefined ? undefined : Number(dto.longitude), description: dto.description, timezone: dto.timezone ?? "Asia/Kolkata", status: dto.status as PrismaCatalogStatus | undefined } });
    await this.prisma.auditLog.create({ data: { tenantId, action: "DESTINATION_CREATED", entityType: "Destination", entityId: result.id } });
    return result;
  }

  async get(tenantId: string, id: string) {
    const result = await this.prisma.destination.findFirst({ where: { id, tenantId }, include: { _count: { select: { activities: true } } } });
    if (!result) throw new NotFoundException("Destination not found");
    return result;
  }

  async update(tenantId: string, id: string, dto: UpdateDestinationDto) {
    await this.get(tenantId, id);
    const result = await this.prisma.destination.update({ where: { id }, data: { name: dto.city, city: dto.city, country: dto.country, state: dto.state, timezone: dto.timezone, latitude: dto.latitude === undefined ? undefined : Number(dto.latitude), longitude: dto.longitude === undefined ? undefined : Number(dto.longitude), description: dto.description, status: dto.status as PrismaCatalogStatus | undefined } });
    await this.prisma.auditLog.create({ data: { tenantId, action: "DESTINATION_UPDATED", entityType: "Destination", entityId: id } });
    return result;
  }

  async remove(tenantId: string, id: string) {
    await this.get(tenantId, id);
    await this.prisma.destination.update({ where: { id }, data: { status: "ARCHIVED" } });
    await this.prisma.auditLog.create({ data: { tenantId, action: "DESTINATION_ARCHIVED", entityType: "Destination", entityId: id } });
    return { success: true };
  }
}
