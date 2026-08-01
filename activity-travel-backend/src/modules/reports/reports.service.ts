import { Injectable } from "@nestjs/common";
import { BookingStatus, CatalogStatus } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import { paginated, parsePaginationQuery } from "../../common/pagination/pagination";

@Injectable()
export class ReportsService {
  constructor(private readonly prisma: PrismaService) {}

  async bookings(tenantId: string, query: { page?: number; pageSize?: number; search?: string; from?: string; to?: string; status?: string; activityId?: string }, status?: "CANCELLED") {
    const p = parsePaginationQuery(query, ["createdAt", "totalMinor", "status"], "createdAt");
    const where = { tenantId, ...(status ? { status } : query.status ? { status: query.status as BookingStatus } : {}), ...(query.activityId ? { activityId: query.activityId } : {}), ...(p.search ? { OR: [{ reference: { contains: p.search, mode: "insensitive" as const } }, { customerName: { contains: p.search, mode: "insensitive" as const } }] } : {}), ...(query.from || query.to ? { createdAt: { ...(query.from ? { gte: new Date(query.from) } : {}), ...(query.to ? { lte: new Date(query.to) } : {}) } } : {}) };
    const [data, total] = await this.prisma.$transaction([
      this.prisma.booking.findMany({ where, orderBy: { createdAt: "desc" }, skip: (p.page - 1) * p.pageSize, take: p.pageSize, select: { id: true, reference: true, customerName: true, status: true, totalMinor: true, currency: true, createdAt: true } }),
      this.prisma.booking.count({ where })
    ]);
    return paginated(data, p.page, p.pageSize, total);
  }

  async revenue(tenantId: string, query: { from?: string; to?: string }) {
    const where = { tenantId, status: { in: [BookingStatus.CONFIRMED, BookingStatus.COMPLETED] }, ...(query.from || query.to ? { createdAt: { ...(query.from ? { gte: new Date(query.from) } : {}), ...(query.to ? { lte: new Date(query.to) } : {}) } } : {}) };
    const rows = await this.prisma.booking.findMany({ where, select: { totalMinor: true, taxMinor: true, discountMinor: true, currency: true } });
    return { data: rows, totals: { bookings: rows.length, totalMinor: rows.reduce((sum, row) => sum + row.totalMinor, 0), taxMinor: rows.reduce((sum, row) => sum + row.taxMinor, 0), discountMinor: rows.reduce((sum, row) => sum + row.discountMinor, 0) } };
  }

  async capacity(tenantId: string, query: { page?: number; pageSize?: number; from?: string; to?: string; activityId?: string; variantId?: string }) {
    const p = parsePaginationQuery(query, ["startsAt", "capacity", "bookedSeats"], "startsAt");
    const where = { activity: { tenantId }, ...(query.activityId ? { activityId: query.activityId } : {}), ...(query.variantId ? { variantId: query.variantId } : {}), ...(query.from || query.to ? { startsAt: { ...(query.from ? { gte: new Date(query.from) } : {}), ...(query.to ? { lte: new Date(query.to) } : {}) } } : {}) };
    const [data, total] = await this.prisma.$transaction([
      this.prisma.activitySchedule.findMany({ where, orderBy: { startsAt: "asc" }, skip: (p.page - 1) * p.pageSize, take: p.pageSize, select: { id: true, startsAt: true, capacity: true, bookedSeats: true, activity: { select: { id: true, name: true } } } }),
      this.prisma.activitySchedule.count({ where })
    ]);
    return paginated(data.map((row) => ({ ...row, available: Math.max(0, row.capacity - row.bookedSeats) })), p.page, p.pageSize, total);
  }

  async cancellations(tenantId: string, query: { page?: number; pageSize?: number; search?: string; from?: string; to?: string }) { return this.bookings(tenantId, query, "CANCELLED"); }
  async payments(tenantId: string, query: { page?: number; pageSize?: number; search?: string; status?: string; from?: string; to?: string }) { const p = parsePaginationQuery(query, ["createdAt", "amountMinor", "status"], "createdAt"); const where = { tenantId, ...(query.status ? { status: query.status as "PENDING" | "CAPTURED" | "FAILED" | "REFUNDED" } : {}), ...(p.search ? { OR: [{ providerReference: { contains: p.search, mode: "insensitive" as const } }, { booking: { reference: { contains: p.search, mode: "insensitive" as const } } }] } : {}), ...(query.from || query.to ? { createdAt: { ...(query.from ? { gte: new Date(query.from) } : {}), ...(query.to ? { lte: new Date(query.to) } : {}) } } : {}) }; const [data, total] = await this.prisma.$transaction([this.prisma.payment.findMany({ where, orderBy: { createdAt: "desc" }, skip: (p.page - 1) * p.pageSize, take: p.pageSize, select: { id: true, amountMinor: true, currency: true, status: true, providerReference: true, createdAt: true, booking: { select: { reference: true } } } }), this.prisma.payment.count({ where })]); return paginated(data, p.page, p.pageSize, total); }
  async refunds(tenantId: string, query: { page?: number; pageSize?: number; search?: string; status?: string; from?: string; to?: string }) {
    const p = parsePaginationQuery(query, ["createdAt", "requestedAmountMinor", "status"], "createdAt");
    const where = { tenantId, ...(query.status ? { status: query.status as "REQUESTED" | "APPROVED" | "PROCESSED" | "FAILED" } : {}), ...(p.search ? { reason: { contains: p.search, mode: "insensitive" as const } } : {}), ...(query.from || query.to ? { createdAt: { ...(query.from ? { gte: new Date(query.from) } : {}), ...(query.to ? { lte: new Date(query.to) } : {}) } } : {}) };
    const [data, total] = await this.prisma.$transaction([
      this.prisma.refund.findMany({ where, orderBy: { createdAt: "desc" }, skip: (p.page - 1) * p.pageSize, take: p.pageSize, select: { id: true, requestedAmountMinor: true, approvedAmountMinor: true, status: true, reason: true, createdAt: true, payment: { select: { booking: { select: { reference: true } } } } } }),
      this.prisma.refund.count({ where })
    ]);
    return paginated(data, p.page, p.pageSize, total);
  }
  async partners(tenantId: string, query: { page?: number; pageSize?: number; search?: string; status?: string }, kind: "supplier" | "agent") { const p = parsePaginationQuery(query, ["company", "createdAt", "status"], "company"); const where = { tenantId, ...(query.status ? { status: query.status as CatalogStatus } : {}), ...(p.search ? { company: { contains: p.search, mode: "insensitive" as const } } : {}) }; if (kind === "supplier") { const [data, total] = await this.prisma.$transaction([this.prisma.supplier.findMany({ where, orderBy: { company: "asc" }, skip: (p.page - 1) * p.pageSize, take: p.pageSize }), this.prisma.supplier.count({ where })]); return paginated(data, p.page, p.pageSize, total); } const [data, total] = await this.prisma.$transaction([this.prisma.agent.findMany({ where, orderBy: { company: "asc" }, skip: (p.page - 1) * p.pageSize, take: p.pageSize }), this.prisma.agent.count({ where })]); return paginated(data, p.page, p.pageSize, total); }
  async activities(tenantId: string, query: { page?: number; pageSize?: number; search?: string; status?: string }) { const p = parsePaginationQuery(query, ["name", "createdAt", "updatedAt"], "name"); const where = { tenantId, ...(query.status ? { status: query.status as "DRAFT" | "PUBLISHED" | "ARCHIVED" } : {}), ...(p.search ? { name: { contains: p.search, mode: "insensitive" as const } } : {}) }; const [data, total] = await this.prisma.$transaction([this.prisma.activity.findMany({ where, orderBy: { name: "asc" }, skip: (p.page - 1) * p.pageSize, take: p.pageSize, select: { id: true, name: true, status: true, destination: true, _count: { select: { bookings: true, schedules: true } } } }), this.prisma.activity.count({ where })]); return paginated(data, p.page, p.pageSize, total); }

  async exportCsv(tenantId: string, kind: "bookings" | "capacity" | "cancellations" | "payments" | "refunds" | "agents" | "suppliers" | "activities" | "revenue", query: { search?: string; from?: string; to?: string; status?: string; activityId?: string; variantId?: string }) {
    const rows: unknown[] = [];
    if (kind === "revenue") {
      const result = await this.revenue(tenantId, query);
      rows.push({ metric: "bookings", value: result.totals.bookings }, { metric: "revenueMinor", value: result.totals.totalMinor }, { metric: "taxMinor", value: result.totals.taxMinor }, { metric: "discountMinor", value: result.totals.discountMinor });
    }
    for (let page = 1; kind !== "revenue" && page <= 10; page += 1) {
      const result = kind === "bookings" ? await this.bookings(tenantId, { ...query, page, pageSize: 100 }) : kind === "cancellations" ? await this.cancellations(tenantId, { ...query, page, pageSize: 100 }) : kind === "capacity" ? await this.capacity(tenantId, { ...query, page, pageSize: 100 }) : kind === "payments" ? await this.payments(tenantId, { ...query, page, pageSize: 100 }) : kind === "refunds" ? await this.refunds(tenantId, { ...query, page, pageSize: 100 }) : kind === "agents" ? await this.partners(tenantId, { ...query, page, pageSize: 100 }, "agent") : kind === "suppliers" ? await this.partners(tenantId, { ...query, page, pageSize: 100 }, "supplier") : await this.activities(tenantId, { ...query, page, pageSize: 100 });
      if (Array.isArray(result.data)) rows.push(...result.data);
      if (!result.meta?.hasNextPage) break;
    }
    const flatten = (value: unknown): string => JSON.stringify(value ?? "");
    const keys = [...new Set(rows.flatMap((row) => row && typeof row === "object" ? Object.keys(row) : []))];
    return [keys.join(","), ...rows.map((row) => keys.map((key) => flatten((row as Record<string, unknown>)[key]).replace(/\r?\n/g, "")).join(","))].join("\n");
  }

}
