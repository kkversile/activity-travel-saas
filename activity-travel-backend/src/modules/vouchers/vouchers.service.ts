import { Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";
import { paginated, parsePaginationQuery } from "../../common/pagination/pagination";
import { CreateVoucherModuleDto, UpdateVoucherDto, VoucherQueryDto } from "./dto/voucher.dto";
@Injectable()
export class VouchersService { constructor(private readonly prisma: PrismaService) {}
  async list(tenantId: string, q: VoucherQueryDto) { const p = parsePaginationQuery(q, ["code", "createdAt", "validTo"], "createdAt"); const where = { tenantId, ...(q.isActive === undefined ? {} : { isActive: q.isActive }), ...(p.search ? { code: { contains: p.search.toUpperCase() } } : {}) }; const [data, total] = await this.prisma.$transaction([this.prisma.voucher.findMany({ where, orderBy: { [p.sortBy]: p.sortOrder }, skip: (p.page - 1) * p.pageSize, take: p.pageSize }), this.prisma.voucher.count({ where })]); return paginated(data, p.page, p.pageSize, total); }
  async get(tenantId: string, id: string) { const item = await this.prisma.voucher.findFirst({ where: { id, tenantId } }); if (!item) throw new NotFoundException("Voucher not found"); return item; }
  async create(tenantId: string, d: CreateVoucherModuleDto) { const result = await this.prisma.voucher.create({ data: { tenantId, code: d.code.toUpperCase(), discountMinor: d.discountMinor, discountPercent: d.discountPercent, validFrom: d.validFrom ? new Date(d.validFrom) : undefined, validTo: d.validTo ? new Date(d.validTo) : undefined, maxRedemptions: d.maxRedemptions } }); await this.prisma.auditLog.create({ data: { tenantId, action: "VOUCHER_CREATED", entityType: "Voucher", entityId: result.id } }); return result; }
  async update(tenantId: string, id: string, d: UpdateVoucherDto) { await this.get(tenantId, id); const result = await this.prisma.voucher.update({ where: { id }, data: { ...d, validTo: d.validTo ? new Date(d.validTo) : undefined } }); await this.prisma.auditLog.create({ data: { tenantId, action: "VOUCHER_UPDATED", entityType: "Voucher", entityId: id } }); return result; }
  async remove(tenantId: string, id: string) { await this.get(tenantId, id); await this.prisma.voucher.update({ where: { id }, data: { isActive: false } }); await this.prisma.auditLog.create({ data: { tenantId, action: "VOUCHER_ARCHIVED", entityType: "Voucher", entityId: id } }); return { success: true }; }
}
