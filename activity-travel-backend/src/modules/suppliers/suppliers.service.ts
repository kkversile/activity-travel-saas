import { Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";
import { paginated, parsePaginationQuery } from "../../common/pagination/pagination";
import { CreateSupplierDto, SupplierQueryDto, UpdateSupplierDto } from "./dto/supplier.dto";
import { SupplierActivityDto } from "./dto/supplier-activity.dto";

@Injectable()
export class SuppliersService {
  constructor(private readonly prisma: PrismaService) {}

  async list(tenantId: string, q: SupplierQueryDto) {
    const p = parsePaginationQuery(q, ["company", "createdAt", "updatedAt"], "company");
    const where = { tenantId, ...(q.status ? { status: q.status } : {}), ...(p.search ? { OR: [{ company: { contains: p.search, mode: "insensitive" as const } }, { contactPerson: { contains: p.search, mode: "insensitive" as const } }, { email: { contains: p.search, mode: "insensitive" as const } }] } : {}) };
    const [data, total] = await this.prisma.$transaction([
      this.prisma.supplier.findMany({ where, include: { _count: { select: { activities: true, bookings: true } } }, orderBy: { [p.sortBy]: p.sortOrder }, skip: (p.page - 1) * p.pageSize, take: p.pageSize }),
      this.prisma.supplier.count({ where })
    ]);
    return paginated(data, p.page, p.pageSize, total);
  }

  async get(tenantId: string, id: string) {
    const item = await this.prisma.supplier.findFirst({ where: { id, tenantId }, include: { activities: { include: { activity: { select: { id: true, name: true, status: true } } } }, bookings: { orderBy: { createdAt: "desc" }, take: 50, select: { id: true, reference: true, status: true, totalMinor: true, currency: true, createdAt: true } } } });
    if (!item) throw new NotFoundException("Supplier not found");
    return item;
  }

  async create(tenantId: string, d: CreateSupplierDto) {
    const result = await this.prisma.supplier.create({ data: { tenantId, ...d, email: d.email.toLowerCase() } });
    await this.prisma.auditLog.create({ data: { tenantId, action: "SUPPLIER_CREATED", entityType: "Supplier", entityId: result.id } });
    return result;
  }

  async update(tenantId: string, id: string, d: UpdateSupplierDto) {
    await this.get(tenantId, id);
    const result = await this.prisma.supplier.update({ where: { id }, data: { ...d, email: d.email?.toLowerCase() } });
    await this.prisma.auditLog.create({ data: { tenantId, action: "SUPPLIER_UPDATED", entityType: "Supplier", entityId: id } });
    return result;
  }

  async remove(tenantId: string, id: string) {
    await this.get(tenantId, id);
    await this.prisma.supplier.update({ where: { id }, data: { status: "ARCHIVED" } });
    await this.prisma.auditLog.create({ data: { tenantId, action: "SUPPLIER_ARCHIVED", entityType: "Supplier", entityId: id } });
    return { success: true };
  }

  async listActivities(tenantId: string, supplierId: string) {
    await this.get(tenantId, supplierId);
    return this.prisma.supplierActivity.findMany({ where: { tenantId, supplierId }, include: { activity: { select: { id: true, name: true, status: true, destination: true } } }, orderBy: { createdAt: "desc" } });
  }

  async assignActivity(tenantId: string, supplierId: string, d: SupplierActivityDto) {
    await this.get(tenantId, supplierId);
    const activity = await this.prisma.activity.findFirst({ where: { id: d.activityId, tenantId }, select: { id: true } });
    if (!activity) throw new NotFoundException("Activity not found for tenant");
    const result = await this.prisma.supplierActivity.upsert({ where: { tenantId_supplierId_activityId: { tenantId, supplierId, activityId: d.activityId } }, update: { costMinor: d.costMinor, commissionPercent: d.commissionPercent, status: d.status }, create: { tenantId, supplierId, activityId: d.activityId, costMinor: d.costMinor, commissionPercent: d.commissionPercent, status: d.status } });
    await this.prisma.auditLog.create({ data: { tenantId, action: "SUPPLIER_ACTIVITY_ASSIGNED", entityType: "SupplierActivity", entityId: result.id, metadata: { supplierId, activityId: d.activityId } } });
    return result;
  }

  async archiveActivity(tenantId: string, supplierId: string, activityId: string) {
    await this.get(tenantId, supplierId);
    const result = await this.prisma.supplierActivity.updateMany({ where: { tenantId, supplierId, activityId }, data: { status: "ARCHIVED" } });
    if (result.count !== 1) throw new NotFoundException("Supplier activity link not found");
    await this.prisma.auditLog.create({ data: { tenantId, action: "SUPPLIER_ACTIVITY_ARCHIVED", entityType: "SupplierActivity", entityId: activityId, metadata: { supplierId, activityId } } });
    return { success: true };
  }
}
