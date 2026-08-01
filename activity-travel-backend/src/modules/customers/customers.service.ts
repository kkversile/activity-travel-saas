import { ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";
import { paginated, parsePaginationQuery } from "../../common/pagination/pagination";
import { CreateCustomerDto, CustomerQueryDto, UpdateCustomerDto } from "./dto/customer.dto";

@Injectable()
export class CustomersService {
  constructor(private readonly prisma: PrismaService) {}

  async list(tenantId: string, query: CustomerQueryDto) {
    const parsed = parsePaginationQuery(query, ["name", "email", "createdAt", "updatedAt"], "name");
    const where = {
      tenantId,
      ...(query.country ? { country: { contains: query.country, mode: "insensitive" as const } } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(parsed.search ? { OR: [{ name: { contains: parsed.search, mode: "insensitive" as const } }, { email: { contains: parsed.search, mode: "insensitive" as const } }, { phone: { contains: parsed.search, mode: "insensitive" as const } }] } : {})
    };
    const [data, total] = await this.prisma.$transaction([
      this.prisma.customer.findMany({ where, include: { _count: { select: { bookings: true } } }, orderBy: { [parsed.sortBy]: parsed.sortOrder }, skip: (parsed.page - 1) * parsed.pageSize, take: parsed.pageSize }),
      this.prisma.customer.count({ where })
    ]);
    const customerIds = data.map((customer) => customer.id);
    const aggregates = customerIds.length ? await this.prisma.booking.groupBy({ by: ["customerId"], where: { tenantId, customerId: { in: customerIds }, status: { in: ["CONFIRMED", "COMPLETED"] } }, _sum: { totalMinor: true }, _max: { createdAt: true } }) : [];
    const aggregateByCustomer = new Map(aggregates.map((row) => [row.customerId, row]));
    return paginated(data.map((customer) => { const aggregate = aggregateByCustomer.get(customer.id); return { ...customer, totalSpentMinor: aggregate?._sum.totalMinor ?? 0, lastBookingAt: aggregate?._max.createdAt ?? null }; }), parsed.page, parsed.pageSize, total);
  }

  async get(tenantId: string, id: string) {
    const customer = await this.prisma.customer.findFirst({ where: { id, tenantId }, include: { bookings: { orderBy: { createdAt: "desc" }, take: 20, include: { activity: true, schedule: true, passengers: true, payments: { include: { refunds: true } } } } } });
    if (!customer) throw new NotFoundException("Customer not found");
    return customer;
  }

  async create(tenantId: string, dto: CreateCustomerDto) { const result = await this.prisma.customer.create({ data: { tenantId, name: dto.name, email: dto.email.toLowerCase(), phone: dto.phone, country: dto.country, notes: dto.notes, status: dto.status } }); await this.prisma.auditLog.create({ data: { tenantId, action: "CUSTOMER_CREATED", entityType: "Customer", entityId: result.id } }); return result; }

  async update(tenantId: string, id: string, dto: UpdateCustomerDto) {
    await this.get(tenantId, id);
    const result = await this.prisma.customer.update({ where: { id }, data: { name: dto.name, email: dto.email?.toLowerCase(), phone: dto.phone, country: dto.country, notes: dto.notes, status: dto.status } });
    await this.prisma.auditLog.create({ data: { tenantId, action: "CUSTOMER_UPDATED", entityType: "Customer", entityId: id } });
    return result;
  }

  async remove(tenantId: string, id: string) {
    const customer = await this.get(tenantId, id);
    if (customer.bookings.length > 0) throw new ConflictException("Customer with bookings cannot be deleted");
    await this.prisma.customer.update({ where: { id }, data: { status: "ARCHIVED" } });
    await this.prisma.auditLog.create({ data: { tenantId, action: "CUSTOMER_ARCHIVED", entityType: "Customer", entityId: id } });
    return { success: true };
  }
}
