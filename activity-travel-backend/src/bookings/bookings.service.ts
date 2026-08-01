import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { ActivityStatus, BookingStatus, PassengerType, Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { paginated, parsePaginationQuery } from "../common/pagination/pagination";
import { BookingQueryDto } from "./dto/booking-query.dto";
import { CreateBookingDto } from "./dto/create-booking.dto";
import { CreateVoucherDto } from "./dto/voucher.dto";
import { UpdateBookingDto } from "./dto/update-booking.dto";

@Injectable()
export class BookingsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(tenantId: string, dto: CreateBookingDto) {
    await this.releaseExpiredHolds(tenantId);
    const existing = await this.findByIdempotency(tenantId, dto.idempotencyKey);
    if (existing) return existing;

    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        return await this.prisma.$transaction(async (tx) => {
          const activity = await tx.activity.findFirst({
            where: { id: dto.activityId, tenantId, status: ActivityStatus.PUBLISHED },
            include: { pricePlans: { where: { isActive: true }, orderBy: { validFrom: "desc" }, take: 1 } }
          });
          if (!activity || activity.pricePlans.length === 0) throw new NotFoundException("Published activity or active price plan not found");
          if (dto.agentId && !(await tx.agent.findFirst({ where: { id: dto.agentId, tenantId }, select: { id: true } }))) throw new NotFoundException("Agent not found for tenant");
          if (dto.supplierId) {
            if (!(await tx.supplier.findFirst({ where: { id: dto.supplierId, tenantId }, select: { id: true } }))) throw new NotFoundException("Supplier not found for tenant");
            if (!(await tx.supplierActivity.findFirst({ where: { tenantId, supplierId: dto.supplierId, activityId: dto.activityId, status: "ACTIVE" }, select: { id: true } }))) throw new NotFoundException("Supplier is not assigned to this activity");
          }
          const schedule = await tx.activitySchedule.findFirst({ where: { id: dto.scheduleId, activityId: dto.activityId, activity: { tenantId }, isBookable: true, startsAt: { gt: new Date() } } });
          if (!schedule) throw new NotFoundException("Bookable schedule not found");
          if (schedule.startsAt.getTime() - Date.now() < schedule.cutoffMinutes * 60000) throw new BadRequestException("Booking cutoff has passed");

          const seatCount = dto.passengers.filter((passenger) => passenger.type !== PassengerType.INFANT).length;
          if (seatCount < 1) throw new BadRequestException("At least one non-infant passenger is required");
          const updated = await tx.activitySchedule.updateMany({ where: { id: schedule.id, bookedSeats: { lte: schedule.capacity - seatCount } }, data: { bookedSeats: { increment: seatCount } } });
          if (updated.count !== 1) throw new BadRequestException("Insufficient capacity");

          const price = activity.pricePlans[0];
          const subtotalMinor = dto.passengers.reduce((sum, passenger) => sum + (passenger.type === PassengerType.ADULT ? price.adultMinor : passenger.type === PassengerType.CHILD ? price.childMinor : price.infantMinor), 0);
          const taxMinor = Math.round(subtotalMinor * price.taxPercent / 100);
          const commissionMinor = Math.round(subtotalMinor * price.commissionPercent / 100);
          const voucherCandidate = dto.voucherCode ? await tx.voucher.findFirst({ where: { tenantId, code: dto.voucherCode.toUpperCase(), isActive: true, OR: [{ validFrom: null }, { validFrom: { lte: new Date() } }], AND: [{ OR: [{ validTo: null }, { validTo: { gte: new Date() } }] }] } }) : null;
          const voucher = voucherCandidate && (voucherCandidate.maxRedemptions === null || voucherCandidate.redemptionCount < voucherCandidate.maxRedemptions) ? voucherCandidate : null;
          const discountMinor = voucher ? Math.min(subtotalMinor, voucher.discountMinor ?? Math.round(subtotalMinor * (voucher.discountPercent ?? 0) / 100)) : 0;
          const totalMinor = Math.max(0, subtotalMinor + taxMinor - discountMinor);
          const customer = await tx.customer.upsert({ where: { tenantId_email: { tenantId, email: dto.customerEmail.toLowerCase() } }, update: { name: dto.customerName, phone: dto.customerPhone }, create: { tenantId, name: dto.customerName, email: dto.customerEmail.toLowerCase(), phone: dto.customerPhone } });
          const booking = await tx.booking.create({
            data: {
              tenantId, activityId: activity.id, scheduleId: schedule.id, supplierId: dto.supplierId, agentId: dto.agentId, source: dto.source ?? (dto.agentId ? "AGENT" : "DIRECT"),
              reference: `ACT-${Date.now()}-${Math.floor(Math.random() * 100000)}`,
              status: BookingStatus.HOLD, customerId: customer.id, customerName: dto.customerName, customerEmail: dto.customerEmail.toLowerCase(), customerPhone: dto.customerPhone,
              currency: price.currency, subtotalMinor, taxMinor, discountMinor, commissionMinor, totalMinor, idempotencyKey: dto.idempotencyKey,
              notes: dto.notes, voucherCode: dto.voucherCode, holdExpiresAt: new Date(Date.now() + 15 * 60 * 1000), passengers: { create: dto.passengers.map((passenger) => ({ ...passenger, tenantId })) }
            }, include: { activity: true, schedule: true, passengers: true }
          });
          if (voucher) {
            const redeemed = await tx.voucher.updateMany({ where: { id: voucher.id, OR: [{ maxRedemptions: null }, { redemptionCount: { lt: voucher.maxRedemptions ?? 0 } }] }, data: { redemptionCount: { increment: 1 } } });
            if (redeemed.count !== 1) throw new BadRequestException("Voucher redemption limit reached");
          }
          await tx.auditLog.create({ data: { tenantId, action: "BOOKING_CREATED", entityType: "Booking", entityId: booking.id, metadata: { reference: booking.reference } } });
          return booking;
        }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 5000, timeout: 10000 });
      } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && (error.code === "P2034" || error.code === "P2002")) {
          const concurrent = await this.findByIdempotency(tenantId, dto.idempotencyKey);
          if (concurrent) return concurrent;
          continue;
        }
        throw error;
      }
    }
    throw new BadRequestException("Booking could not be created safely; please retry");
  }

  async list(tenantId: string, query: BookingQueryDto = new BookingQueryDto()) {
    await this.releaseExpiredHolds(tenantId);
    const parsed = parsePaginationQuery(query, ["createdAt", "reference", "totalMinor", "status"], "createdAt");
    const where = { tenantId, ...(query.status ? { status: query.status } : {}), ...(query.paymentStatus ? { payments: { some: { status: query.paymentStatus } } } : {}), ...(query.activityId ? { activityId: query.activityId } : {}), ...(query.agentId ? { agentId: query.agentId } : {}), ...(query.supplierId ? { supplierId: query.supplierId } : {}), ...(query.source ? { source: query.source } : {}), ...(query.destination ? { activity: { tenantId, destination: { contains: query.destination, mode: "insensitive" as const } } } : {}), ...(query.scheduleFrom || query.scheduleTo ? { schedule: { startsAt: { ...(query.scheduleFrom ? { gte: new Date(query.scheduleFrom) } : {}), ...(query.scheduleTo ? { lte: new Date(query.scheduleTo) } : {}) } } } : {}), ...(query.bookingFrom || query.bookingTo ? { createdAt: { ...(query.bookingFrom ? { gte: new Date(query.bookingFrom) } : {}), ...(query.bookingTo ? { lte: new Date(query.bookingTo) } : {}) } } : {}), ...(query.amountMin !== undefined || query.amountMax !== undefined ? { totalMinor: { ...(query.amountMin !== undefined ? { gte: query.amountMin } : {}), ...(query.amountMax !== undefined ? { lte: query.amountMax } : {}) } } : {}), ...(parsed.search ? { OR: [{ reference: { contains: parsed.search, mode: "insensitive" as const } }, { customerName: { contains: parsed.search, mode: "insensitive" as const } }, { customerEmail: { contains: parsed.search, mode: "insensitive" as const } }] } : {}) };
    const [data, total] = await this.prisma.$transaction([
      this.prisma.booking.findMany({ where, include: { activity: true, schedule: true, passengers: true, agent: { select: { id: true, company: true } }, supplier: { select: { id: true, company: true } }, payments: { select: { status: true } } }, orderBy: { [parsed.sortBy]: parsed.sortOrder }, skip: (parsed.page - 1) * parsed.pageSize, take: parsed.pageSize }),
      this.prisma.booking.count({ where })
    ]);
    return paginated(data, parsed.page, parsed.pageSize, total);
  }

  async confirm(tenantId: string, id: string) {
    const booking = await this.getById(tenantId, id);
    if (booking.status === BookingStatus.CONFIRMED) return booking;
    if (booking.status !== BookingStatus.HOLD || (booking.holdExpiresAt && booking.holdExpiresAt <= new Date())) throw new BadRequestException("Only active holds can be confirmed");
    const marked = await this.prisma.booking.updateMany({ where: { id, tenantId, status: BookingStatus.HOLD, holdExpiresAt: { gt: new Date() } }, data: { status: BookingStatus.CONFIRMED, holdExpiresAt: null } });
    if (marked.count !== 1) throw new BadRequestException("Only active holds can be confirmed");
    const updated = await this.prisma.booking.findUniqueOrThrow({ where: { id }, include: { activity: true, schedule: true, passengers: true } });
    await this.prisma.auditLog.create({ data: { tenantId, action: "BOOKING_CONFIRMED", entityType: "Booking", entityId: id } });
    return updated;
  }

  async cancel(tenantId: string, id: string) {
    const booking = await this.getById(tenantId, id);
    if (booking.status === BookingStatus.CANCELLED) return booking;
    if (booking.status !== BookingStatus.HOLD && booking.status !== BookingStatus.CONFIRMED) throw new BadRequestException("Booking cannot be cancelled");
    const seats = booking.passengers.filter((passenger) => passenger.type !== PassengerType.INFANT).length;
    const hoursBefore = Math.max(0, (booking.schedule.startsAt.getTime() - Date.now()) / 3600000);
    const rule = booking.activity.cancellationRules.filter((item) => item.hoursBefore <= hoursBefore).sort((a, b) => b.hoursBefore - a.hoursBefore)[0];
    const refundMinor = Math.round(booking.totalMinor * (rule?.refundPercent ?? 0) / 100);
    const updated = await this.prisma.$transaction(async (tx) => {
      const marked = await tx.booking.updateMany({ where: { id, tenantId, status: { in: [BookingStatus.HOLD, BookingStatus.CONFIRMED] } }, data: { status: BookingStatus.CANCELLED, cancelledAt: new Date(), holdExpiresAt: null, refundMinor } });
      if (marked.count !== 1) return tx.booking.findUniqueOrThrow({ where: { id }, include: { activity: true, schedule: true, passengers: true } });
      await tx.activitySchedule.updateMany({ where: { id: booking.scheduleId, bookedSeats: { gte: seats } }, data: { bookedSeats: { decrement: seats } } });
      return tx.booking.findUniqueOrThrow({ where: { id }, include: { activity: true, schedule: true, passengers: true } });
    });
    await this.prisma.auditLog.create({ data: { tenantId, action: "BOOKING_CANCELLED", entityType: "Booking", entityId: id } });
    return updated;
  }

  async complete(tenantId: string, id: string) { return this.transition(tenantId, id, BookingStatus.COMPLETED, [BookingStatus.CONFIRMED]); }
  async noShow(tenantId: string, id: string) { return this.transition(tenantId, id, BookingStatus.NO_SHOW, [BookingStatus.CONFIRMED]); }

  private async transition(tenantId: string, id: string, next: BookingStatus, allowed: BookingStatus[]) {
    const booking = await this.getById(tenantId, id);
    if (!allowed.includes(booking.status)) throw new BadRequestException(`Booking cannot transition to ${next}`);
    const marked = await this.prisma.booking.updateMany({ where: { id, tenantId, status: { in: allowed } }, data: { status: next } });
    if (marked.count !== 1) throw new BadRequestException(`Booking cannot transition to ${next}`);
    const updated = await this.prisma.booking.findUniqueOrThrow({ where: { id }, include: { activity: true, schedule: true, passengers: true } });
    await this.prisma.auditLog.create({ data: { tenantId, action: `BOOKING_${next}`, entityType: "Booking", entityId: id } });
    return updated;
  }

  async getById(tenantId: string, id: string) {
    const booking = await this.prisma.booking.findFirst({ where: { id, tenantId }, include: { activity: { include: { cancellationRules: true } }, schedule: true, passengers: true, agent: true, supplier: true, payments: { include: { refunds: true } }, invoices: true } });
    if (!booking) throw new NotFoundException("Booking not found");
    const auditHistory = await this.prisma.auditLog.findMany({ where: { tenantId, entityType: "Booking", entityId: id }, orderBy: { createdAt: "asc" }, take: 100 });
    return { ...booking, auditHistory };
  }

  async update(tenantId: string, id: string, dto: UpdateBookingDto) {
    const current = await this.prisma.booking.findFirst({ where: { id, tenantId }, select: { id: true, activityId: true, customerId: true, customerEmail: true } });
    if (!current) throw new NotFoundException("Booking not found");
    if (dto.agentId && !(await this.prisma.agent.findFirst({ where: { id: dto.agentId, tenantId, status: "ACTIVE" }, select: { id: true } }))) throw new NotFoundException("Agent not found for tenant");
    if (dto.supplierId) {
      if (!(await this.prisma.supplier.findFirst({ where: { id: dto.supplierId, tenantId, status: "ACTIVE" }, select: { id: true } }))) throw new NotFoundException("Supplier not found for tenant");
      if (!(await this.prisma.supplierActivity.findFirst({ where: { tenantId, supplierId: dto.supplierId, activityId: current.activityId, status: "ACTIVE" }, select: { id: true } }))) throw new NotFoundException("Supplier is not assigned to this activity");
    }
    const email = dto.customerEmail?.toLowerCase();
    const result = await this.prisma.$transaction(async (tx) => {
      let customerId = current.customerId;
      if (email || dto.customerName !== undefined || dto.customerPhone !== undefined) {
        const customer = email
          ? await tx.customer.upsert({ where: { tenantId_email: { tenantId, email } }, update: { ...(dto.customerName !== undefined ? { name: dto.customerName } : {}), ...(dto.customerPhone !== undefined ? { phone: dto.customerPhone } : {}) }, create: { tenantId, email, name: dto.customerName ?? "Guest customer", phone: dto.customerPhone } })
          : current.customerId ? await tx.customer.update({ where: { id: current.customerId }, data: { ...(dto.customerName !== undefined ? { name: dto.customerName } : {}), ...(dto.customerPhone !== undefined ? { phone: dto.customerPhone } : {}) } }) : null;
        customerId = customer?.id ?? customerId;
      }
      return tx.booking.update({ where: { id }, data: { ...(dto.customerName !== undefined ? { customerName: dto.customerName } : {}), ...(email ? { customerEmail: email } : {}), ...(dto.customerPhone !== undefined ? { customerPhone: dto.customerPhone } : {}), ...(dto.notes !== undefined ? { notes: dto.notes } : {}), ...(dto.source !== undefined ? { source: dto.source } : {}), ...(dto.agentId !== undefined ? { agentId: dto.agentId } : {}), ...(dto.supplierId !== undefined ? { supplierId: dto.supplierId } : {}), ...(customerId ? { customerId } : {}) }, include: { activity: true, schedule: true, passengers: true, agent: true, supplier: true } });
    });
    await this.prisma.auditLog.create({ data: { tenantId, action: "BOOKING_UPDATED", entityType: "Booking", entityId: id } });
    return result;
  }

  async listVouchers(tenantId: string, query: { page?: number; pageSize?: number; search?: string } = {}) { const p = parsePaginationQuery(query, ["createdAt", "code"], "createdAt"); const where = { tenantId, ...(p.search ? { code: { contains: p.search.toUpperCase() } } : {}) }; const [data, total] = await this.prisma.$transaction([this.prisma.voucher.findMany({ where, orderBy: { createdAt: "desc" }, skip: (p.page - 1) * p.pageSize, take: p.pageSize }), this.prisma.voucher.count({ where })]); return paginated(data, p.page, p.pageSize, total); }
  createVoucher(tenantId: string, dto: CreateVoucherDto) { return this.prisma.voucher.create({ data: { tenantId, code: dto.code.toUpperCase(), discountMinor: dto.discountMinor, discountPercent: dto.discountPercent, validFrom: dto.validFrom ? new Date(dto.validFrom) : undefined, validTo: dto.validTo ? new Date(dto.validTo) : undefined, maxRedemptions: dto.maxRedemptions } }); }
  async listCustomers(tenantId: string, query: { page?: number; pageSize?: number; search?: string } = {}) { const p = parsePaginationQuery(query, ["name", "email", "createdAt"], "name"); const where = { tenantId, ...(p.search ? { OR: [{ name: { contains: p.search, mode: "insensitive" as const } }, { email: { contains: p.search, mode: "insensitive" as const } }] } : {}) }; const [data, total] = await this.prisma.$transaction([this.prisma.customer.findMany({ where, include: { _count: { select: { bookings: true } } }, orderBy: { name: p.sortOrder as "asc" | "desc" }, skip: (p.page - 1) * p.pageSize, take: p.pageSize }), this.prisma.customer.count({ where })]); return paginated(data, p.page, p.pageSize, total); }

  private findByIdempotency(tenantId: string, idempotencyKey: string) {
    return this.prisma.booking.findUnique({ where: { tenantId_idempotencyKey: { tenantId, idempotencyKey } }, include: { activity: true, schedule: true, passengers: true } });
  }

  private async releaseExpiredHolds(tenantId: string): Promise<void> {
    const expired = await this.prisma.booking.findMany({ where: { tenantId, status: BookingStatus.HOLD, holdExpiresAt: { lt: new Date() } }, select: { id: true, scheduleId: true, passengers: { select: { type: true } } } });
    for (const booking of expired) {
      const seats = booking.passengers.filter((passenger) => passenger.type !== PassengerType.INFANT).length;
      await this.prisma.$transaction(async (tx) => {
        const marked = await tx.booking.updateMany({ where: { id: booking.id, tenantId, status: BookingStatus.HOLD }, data: { status: BookingStatus.CANCELLED, cancelledAt: new Date() } });
        if (marked.count === 1) {
          await tx.activitySchedule.updateMany({ where: { id: booking.scheduleId, bookedSeats: { gte: seats } }, data: { bookedSeats: { decrement: seats } } });
        }
      });
    }
  }
}
