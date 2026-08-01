import { ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";
import { paginated, parsePaginationQuery } from "../../common/pagination/pagination";
import { CreatePassengerDto, PassengerQueryDto, UpdatePassengerDto } from "./dto/passenger.dto";

@Injectable()
export class PassengersService {
  constructor(private readonly prisma: PrismaService) {}
  async list(tenantId: string, q: PassengerQueryDto) {
    const p = parsePaginationQuery(q, ["firstName", "lastName", "createdAt"], "lastName");
    const where = { tenantId, ...(q.bookingId ? { bookingId: q.bookingId } : {}), ...(p.search ? { OR: [{ firstName: { contains: p.search, mode: "insensitive" as const } }, { lastName: { contains: p.search, mode: "insensitive" as const } }] } : {}) };
    const [data, total] = await this.prisma.$transaction([this.prisma.passenger.findMany({ where, orderBy: { [p.sortBy]: p.sortOrder }, skip: (p.page - 1) * p.pageSize, take: p.pageSize, include: { booking: { select: { id: true, reference: true, customerName: true } } } }), this.prisma.passenger.count({ where })]);
    return paginated(data, p.page, p.pageSize, total);
  }
  async get(tenantId: string, id: string) { const item = await this.prisma.passenger.findFirst({ where: { id, tenantId }, include: { booking: { select: { id: true, reference: true, customerName: true } } } }); if (!item) throw new NotFoundException("Passenger not found"); return item; }
  async create(tenantId: string, d: CreatePassengerDto) { const booking = await this.prisma.booking.findFirst({ where: { id: d.bookingId, tenantId }, select: { id: true } }); if (!booking) throw new NotFoundException("Booking not found"); const result = await this.prisma.passenger.create({ data: { ...d, tenantId } }); await this.prisma.auditLog.create({ data: { tenantId, action: "PASSENGER_CREATED", entityType: "Passenger", entityId: result.id, metadata: { bookingId: d.bookingId } } }); return result; }
  async update(tenantId: string, id: string, d: UpdatePassengerDto) { await this.get(tenantId, id); const result = await this.prisma.passenger.update({ where: { id }, data: d }); await this.prisma.auditLog.create({ data: { tenantId, action: "PASSENGER_UPDATED", entityType: "Passenger", entityId: id } }); return result; }
  async remove(tenantId: string, id: string) { const current = await this.prisma.passenger.findFirst({ where: { id, tenantId }, include: { booking: { select: { id: true, status: true } } } }); if (!current) throw new NotFoundException("Passenger not found"); if (current.booking.status !== "HOLD") throw new ConflictException("Passengers on confirmed or completed bookings cannot be deleted"); await this.prisma.passenger.delete({ where: { id } }); await this.prisma.auditLog.create({ data: { tenantId, action: "PASSENGER_REMOVED", entityType: "Passenger", entityId: id, metadata: { bookingId: current.booking.id } } }); return { success: true }; }
}
