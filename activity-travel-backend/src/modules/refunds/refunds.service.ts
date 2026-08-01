import { ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma, RefundStatus } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import { paginated, parsePaginationQuery } from "../../common/pagination/pagination";
import { CreateRefundDto, RefundQueryDto } from "./dto/refund.dto";

@Injectable()
export class RefundsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(tenantId: string, q: RefundQueryDto) {
    const p = parsePaginationQuery(q, ["createdAt", "requestedAt", "requestedAmountMinor", "status"], "createdAt");
    const where = { tenantId, ...(q.status ? { status: q.status as RefundStatus } : {}), ...(q.search ? { OR: [{ reason: { contains: q.search, mode: "insensitive" as const } }, { payment: { providerReference: { contains: q.search, mode: "insensitive" as const } } }, { payment: { booking: { reference: { contains: q.search, mode: "insensitive" as const } } } }] } : {}) };
    const [data, total] = await this.prisma.$transaction([
      this.prisma.refund.findMany({ where, include: { payment: { include: { booking: true } } }, orderBy: { [p.sortBy]: p.sortOrder }, skip: (p.page - 1) * p.pageSize, take: p.pageSize }),
      this.prisma.refund.count({ where })
    ]);
    return paginated(data, p.page, p.pageSize, total);
  }

  async get(tenantId: string, id: string) {
    const item = await this.prisma.refund.findFirst({ where: { id, tenantId }, include: { payment: { include: { booking: true } } } });
    if (!item) throw new NotFoundException("Refund not found");
    return item;
  }

  async create(tenantId: string, d: CreateRefundDto) {
    return this.prisma.$transaction(async (tx) => {
      const payment = await tx.payment.findFirst({ where: { id: d.paymentId, tenantId, status: "CAPTURED" }, include: { refunds: true } });
      if (!payment) throw new NotFoundException("Captured payment not found");
      const refunded = payment.refunds.filter((item) => item.status !== RefundStatus.FAILED).reduce((sum, item) => sum + (item.approvedAmountMinor ?? item.requestedAmountMinor), 0);
      if (refunded + d.amountMinor > payment.amountMinor) throw new ConflictException("Refund exceeds captured payment");
      const refund = await tx.refund.create({ data: { tenantId, paymentId: payment.id, requestedAmountMinor: d.amountMinor, reason: d.reason.trim() } });
      await tx.auditLog.create({ data: { tenantId, action: "REFUND_REQUESTED", entityType: "Refund", entityId: refund.id } });
      return refund;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }

  async approve(tenantId: string, id: string) {
    const refund = await this.get(tenantId, id);
    if (refund.status !== RefundStatus.REQUESTED) throw new ConflictException("Refund is not awaiting approval");
    const marked = await this.prisma.refund.updateMany({ where: { id, tenantId, status: RefundStatus.REQUESTED }, data: { status: RefundStatus.APPROVED, approvedAmountMinor: refund.requestedAmountMinor } });
    if (marked.count !== 1) throw new ConflictException("Refund is not awaiting approval");
    const updated = await this.prisma.refund.findUniqueOrThrow({ where: { id } });
    await this.prisma.auditLog.create({ data: { tenantId, action: "REFUND_APPROVED", entityType: "Refund", entityId: id } });
    return updated;
  }

  async process(tenantId: string, id: string) {
    const refund = await this.get(tenantId, id);
    if (refund.status !== RefundStatus.APPROVED) throw new ConflictException("Refund must be approved before processing");
    const updated = await this.prisma.$transaction(async (tx) => {
      const marked = await tx.refund.updateMany({ where: { id, tenantId, status: RefundStatus.APPROVED }, data: { status: RefundStatus.PROCESSED, processedAt: new Date(), providerReference: `mock-refund-${id}` } });
      if (marked.count !== 1) throw new ConflictException("Refund must be approved before processing");
      const processed = await tx.refund.findUniqueOrThrow({ where: { id } });
      const refunds = await tx.refund.findMany({ where: { tenantId, paymentId: refund.paymentId, status: RefundStatus.PROCESSED }, select: { approvedAmountMinor: true, requestedAmountMinor: true } });
      const totalRefunded = refunds.reduce((sum, item) => sum + (item.approvedAmountMinor ?? item.requestedAmountMinor), 0);
      const payment = await tx.payment.findUniqueOrThrow({ where: { id: refund.paymentId }, select: { amountMinor: true } });
      if (totalRefunded >= payment.amountMinor) await tx.payment.updateMany({ where: { id: refund.paymentId, tenantId }, data: { status: "REFUNDED" } });
      await tx.auditLog.create({ data: { tenantId, action: "REFUND_PROCESSED", entityType: "Refund", entityId: id, metadata: { totalRefunded } } });
      return processed;
    });
    return updated;
  }
}
