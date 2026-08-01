import { Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";
import { paginated, parsePaginationQuery } from "../../common/pagination/pagination";

type CommissionInput = { agentId?: string; activityId?: string; commissionPercent: number; fixedMinor?: number };

@Injectable()
export class AgentCommissionsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(tenantId: string, q: { page?: number; pageSize?: number; agentId?: string; activityId?: string; status?: "ACTIVE" | "INACTIVE" | "ARCHIVED"; sortBy?: string; sortOrder?: "asc" | "desc" }) {
    const p = parsePaginationQuery(q, ["createdAt", "commissionPercent", "fixedMinor"], "createdAt");
    const where = { tenantId, ...(q.agentId ? { agentId: q.agentId } : {}), ...(q.activityId ? { activityId: q.activityId } : {}), ...(q.status ? { status: q.status } : {}) };
    const [data, total] = await this.prisma.$transaction([this.prisma.agentCommission.findMany({ where, include: { agent: { select: { id: true, company: true } }, activity: { select: { id: true, name: true } } }, orderBy: { [p.sortBy]: p.sortOrder }, skip: (p.page - 1) * p.pageSize, take: p.pageSize }), this.prisma.agentCommission.count({ where })]);
    return paginated(data, p.page, p.pageSize, total);
  }

  async get(tenantId: string, id: string) { const row = await this.prisma.agentCommission.findFirst({ where: { id, tenantId } }); if (!row) throw new NotFoundException("Agent commission not found"); return row; }

  async create(tenantId: string, d: CommissionInput) {
    await this.validateReferences(tenantId, d.agentId, d.activityId);
    const result = await this.prisma.agentCommission.create({ data: { tenantId, ...d } });
    await this.prisma.auditLog.create({ data: { tenantId, action: "AGENT_COMMISSION_CREATED", entityType: "AgentCommission", entityId: result.id } });
    return result;
  }

  async update(tenantId: string, id: string, d: { commissionPercent?: number; fixedMinor?: number; status?: "ACTIVE" | "INACTIVE" | "ARCHIVED" }) { await this.get(tenantId, id); const result = await this.prisma.agentCommission.update({ where: { id }, data: d }); await this.prisma.auditLog.create({ data: { tenantId, action: "AGENT_COMMISSION_UPDATED", entityType: "AgentCommission", entityId: id } }); return result; }
  async remove(tenantId: string, id: string) { await this.get(tenantId, id); await this.prisma.agentCommission.update({ where: { id }, data: { status: "ARCHIVED" } }); await this.prisma.auditLog.create({ data: { tenantId, action: "AGENT_COMMISSION_ARCHIVED", entityType: "AgentCommission", entityId: id } }); return { success: true }; }

  private async validateReferences(tenantId: string, agentId?: string, activityId?: string) {
    if (agentId && !(await this.prisma.agent.findFirst({ where: { id: agentId, tenantId }, select: { id: true } }))) throw new NotFoundException("Agent not found for tenant");
    if (activityId && !(await this.prisma.activity.findFirst({ where: { id: activityId, tenantId }, select: { id: true } }))) throw new NotFoundException("Activity not found for tenant");
  }
}
