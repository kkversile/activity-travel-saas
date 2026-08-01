import { Injectable, NotFoundException } from "@nestjs/common";
import { BookingStatus } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import { paginated, parsePaginationQuery } from "../../common/pagination/pagination";
import { AgentQueryDto, CreateAgentDto, UpdateAgentDto } from "./dto/agent.dto";

@Injectable()
export class AgentsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(tenantId: string, q: AgentQueryDto) {
    const p = parsePaginationQuery(q, ["company", "createdAt", "updatedAt"], "company");
    const where = { tenantId, ...(q.status ? { status: q.status } : {}), ...(p.search ? { OR: [{ company: { contains: p.search, mode: "insensitive" as const } }, { contactPerson: { contains: p.search, mode: "insensitive" as const } }, { email: { contains: p.search, mode: "insensitive" as const } }] } : {}) };
    const [data, total] = await this.prisma.$transaction([
      this.prisma.agent.findMany({ where, include: { _count: { select: { bookings: true, commissionRules: true } } }, orderBy: { [p.sortBy]: p.sortOrder }, skip: (p.page - 1) * p.pageSize, take: p.pageSize }),
      this.prisma.agent.count({ where })
    ]);
    const ids = data.map((agent) => agent.id);
    const revenue = ids.length === 0 ? [] : await this.prisma.booking.groupBy({ by: ["agentId"], where: { tenantId, agentId: { in: ids }, status: { in: [BookingStatus.CONFIRMED, BookingStatus.COMPLETED] } }, _sum: { totalMinor: true } });
    const revenueByAgent = new Map(revenue.map((item) => [item.agentId, item._sum.totalMinor ?? 0]));
    return paginated(data.map((agent) => ({ ...agent, revenueMinor: revenueByAgent.get(agent.id) ?? 0 })), p.page, p.pageSize, total);
  }

  async get(tenantId: string, id: string) {
    const item = await this.prisma.agent.findFirst({ where: { id, tenantId }, include: { commissionRules: { include: { activity: { select: { id: true, name: true } } } }, bookings: { orderBy: { createdAt: "desc" }, take: 50, select: { id: true, reference: true, status: true, totalMinor: true, currency: true, createdAt: true, activity: { select: { name: true } } } } } });
    if (!item) throw new NotFoundException("Agent not found");
    return item;
  }

  async create(tenantId: string, d: CreateAgentDto) {
    const result = await this.prisma.agent.create({ data: { tenantId, ...d, email: d.email.toLowerCase() } });
    await this.prisma.auditLog.create({ data: { tenantId, action: "AGENT_CREATED", entityType: "Agent", entityId: result.id } });
    return result;
  }

  async update(tenantId: string, id: string, d: UpdateAgentDto) {
    await this.get(tenantId, id);
    const result = await this.prisma.agent.update({ where: { id }, data: { ...d, email: d.email?.toLowerCase() } });
    await this.prisma.auditLog.create({ data: { tenantId, action: "AGENT_UPDATED", entityType: "Agent", entityId: id } });
    return result;
  }

  async remove(tenantId: string, id: string) {
    await this.get(tenantId, id);
    await this.prisma.agent.update({ where: { id }, data: { status: "ARCHIVED" } });
    await this.prisma.auditLog.create({ data: { tenantId, action: "AGENT_ARCHIVED", entityType: "Agent", entityId: id } });
    return { success: true };
  }
}
