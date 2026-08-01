import { ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { BookingStatus, PaymentStatus, Prisma } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import { paginated, parsePaginationQuery } from "../../common/pagination/pagination";
import { CreatePaymentDto, PaymentQueryDto, PaymentWebhookDto } from "./dto/payment.dto";
import { MockPaymentProvider, PaymentProvider } from "./payment-provider";

@Injectable()
export class PaymentsService {
  private readonly provider: PaymentProvider = new MockPaymentProvider();
  constructor(private readonly prisma: PrismaService) {}

  async list(tenantId: string, q: PaymentQueryDto) {
    const p = parsePaginationQuery(q, ["createdAt", "amountMinor", "status"], "createdAt");
    const where = { tenantId, ...(q.status ? { status: q.status } : {}), ...(q.method ? { method: q.method } : {}), ...(q.bookingId ? { bookingId: q.bookingId } : {}), ...(q.minAmountMinor !== undefined || q.maxAmountMinor !== undefined ? { amountMinor: { ...(q.minAmountMinor !== undefined ? { gte: q.minAmountMinor } : {}), ...(q.maxAmountMinor !== undefined ? { lte: q.maxAmountMinor } : {}) } } : {}), ...(q.capturedFrom || q.capturedTo ? { capturedAt: { ...(q.capturedFrom ? { gte: new Date(q.capturedFrom) } : {}), ...(q.capturedTo ? { lte: new Date(q.capturedTo) } : {}) } } : {}), ...(q.failedFrom || q.failedTo ? { failedAt: { ...(q.failedFrom ? { gte: new Date(q.failedFrom) } : {}), ...(q.failedTo ? { lte: new Date(q.failedTo) } : {}) } } : {}), ...(q.search ? { OR: [{ providerReference: { contains: q.search, mode: "insensitive" as const } }, { booking: { reference: { contains: q.search, mode: "insensitive" as const } } }, { booking: { customerName: { contains: q.search, mode: "insensitive" as const } } }] } : {}) };
    const [data, total] = await this.prisma.$transaction([
      this.prisma.payment.findMany({ where, include: { booking: { select: { id: true, reference: true, customerName: true } }, refunds: true }, orderBy: { [p.sortBy]: p.sortOrder }, skip: (p.page - 1) * p.pageSize, take: p.pageSize }),
      this.prisma.payment.count({ where }),
    ]);
    return paginated(data, p.page, p.pageSize, total);
  }

  async get(tenantId: string, id: string) { const item = await this.prisma.payment.findFirst({ where: { id, tenantId }, include: { booking: true, refunds: true } }); if (!item) throw new NotFoundException("Payment not found"); return item; }

  async create(tenantId: string, d: CreatePaymentDto) {
    try {
      return await this.prisma.$transaction(async (tx) => {
        const booking = await tx.booking.findFirst({ where: { id: d.bookingId, tenantId }, select: { id: true, currency: true, totalMinor: true, status: true } });
        if (!booking) throw new NotFoundException("Booking not found");
        if (booking.status !== BookingStatus.HOLD && booking.status !== BookingStatus.CONFIRMED) throw new ConflictException("Booking is not in a payable state");
        if (d.currency.toUpperCase() !== booking.currency.toUpperCase()) throw new ConflictException("Payment currency does not match booking currency");
        const existing = await tx.payment.findFirst({ where: { tenantId, idempotencyKey: d.idempotencyKey } });
        if (existing) return existing;
        const total = await tx.payment.aggregate({ _sum: { amountMinor: true }, where: { tenantId, bookingId: booking.id, status: { in: [PaymentStatus.PENDING, PaymentStatus.CAPTURED] } } });
        if ((total._sum.amountMinor ?? 0) + d.amountMinor > booking.totalMinor) throw new ConflictException("Payment exceeds booking total");
        const payment = await tx.payment.create({ data: { tenantId, bookingId: booking.id, amountMinor: d.amountMinor, currency: d.currency.toUpperCase(), method: d.method, idempotencyKey: d.idempotencyKey, providerReference: `mock:${d.idempotencyKey}` } });
        await tx.auditLog.create({ data: { tenantId, action: "PAYMENT_CREATED", entityType: "Payment", entityId: payment.id, metadata: { bookingId: booking.id, amountMinor: d.amountMinor } } });
        return payment;
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    }
    catch (error) { if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") { const concurrent = await this.prisma.payment.findFirst({ where: { tenantId, idempotencyKey: d.idempotencyKey } }); if (concurrent) return concurrent; } throw error; }
  }

  async capture(tenantId: string, id: string) {
    const payment = await this.get(tenantId, id); if (payment.status === PaymentStatus.CAPTURED) return payment; if (payment.status !== PaymentStatus.PENDING) throw new ConflictException("Payment is not capturable");
    await this.provider.capture(payment.id, payment.amountMinor, payment.currency);
    return this.prisma.$transaction(async (tx) => { const marked = await tx.payment.updateMany({ where: { id, tenantId, status: PaymentStatus.PENDING }, data: { status: PaymentStatus.CAPTURED, capturedAt: new Date() } }); if (marked.count !== 1) { const current = await tx.payment.findFirst({ where: { id, tenantId }, include: { booking: true, refunds: true } }); if (current?.status === PaymentStatus.CAPTURED) return current; throw new ConflictException("Payment is not capturable"); } const booking = await tx.booking.updateMany({ where: { id: payment.bookingId, tenantId, status: { in: [BookingStatus.HOLD, BookingStatus.CONFIRMED] } }, data: { status: BookingStatus.CONFIRMED, holdExpiresAt: null } }); if (booking.count !== 1) throw new ConflictException("Booking is not in a payable state"); await tx.auditLog.create({ data: { tenantId, action: "PAYMENT_CAPTURED", entityType: "Payment", entityId: id } }); return tx.payment.findUniqueOrThrow({ where: { id }, include: { booking: true, refunds: true } }); }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }

  async fail(tenantId: string, id: string) { const payment = await this.get(tenantId, id); if (payment.status !== PaymentStatus.PENDING) throw new ConflictException("Payment is not pending"); await this.provider.fail(payment.id); await this.prisma.$transaction(async (tx) => { const updated = await tx.payment.updateMany({ where: { id, tenantId, status: PaymentStatus.PENDING }, data: { status: PaymentStatus.FAILED, failedAt: new Date() } }); if (updated.count === 1) await tx.auditLog.create({ data: { tenantId, action: "PAYMENT_FAILED", entityType: "Payment", entityId: id } }); }); return this.get(tenantId, id); }

  async handleWebhook(tenantId: string, dto: PaymentWebhookDto) {
    if (dto.status !== PaymentStatus.CAPTURED && dto.status !== PaymentStatus.FAILED) throw new ConflictException("Webhook status must be CAPTURED or FAILED");
    const payment = await this.get(tenantId, dto.paymentId);
    const duplicate = await this.prisma.paymentWebhookEvent.findFirst({ where: { tenantId, eventId: dto.eventId } });
    if (duplicate) return { duplicate: true, payment: await this.get(tenantId, dto.paymentId) };
    try {
      return await this.prisma.$transaction(async (tx) => {
        await tx.paymentWebhookEvent.create({ data: { tenantId, eventId: dto.eventId, paymentId: dto.paymentId, provider: dto.provider, status: dto.status, payload: dto.payload as Prisma.InputJsonObject | undefined } });
        if (dto.status === PaymentStatus.CAPTURED) {
          await tx.payment.updateMany({ where: { id: payment.id, tenantId, status: PaymentStatus.PENDING }, data: { status: PaymentStatus.CAPTURED, capturedAt: new Date() } });
          const booking = await tx.booking.updateMany({ where: { id: payment.bookingId, tenantId, status: { in: [BookingStatus.HOLD, BookingStatus.CONFIRMED] } }, data: { status: BookingStatus.CONFIRMED, holdExpiresAt: null } });
          if (booking.count !== 1) throw new ConflictException("Booking is not in a payable state");
        } else await tx.payment.updateMany({ where: { id: payment.id, tenantId, status: PaymentStatus.PENDING }, data: { status: PaymentStatus.FAILED, failedAt: new Date() } });
        await tx.auditLog.create({ data: { tenantId, action: `PAYMENT_WEBHOOK_${dto.status}`, entityType: "Payment", entityId: payment.id, metadata: { eventId: dto.eventId, provider: dto.provider } } });
        return { duplicate: false, payment: await tx.payment.findUniqueOrThrow({ where: { id: payment.id }, include: { booking: true, refunds: true } }) };
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return { duplicate: true, payment: await this.get(tenantId, dto.paymentId) };
      throw error;
    }
  }
}
