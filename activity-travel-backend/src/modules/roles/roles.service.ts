import { ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import { paginated, parsePaginationQuery } from "../../common/pagination/pagination";
import { CreateCustomRoleDto, RoleQueryDto, UpdateCustomRoleDto } from "./roles.dto";

const builtinRoles = [
  { id: "PLATFORM_ADMIN", name: "PLATFORM ADMIN", permissions: ["view", "create", "edit", "delete", "export", "approve", "cancel", "finance", "audit"] },
  { id: "PARTNER_ADMIN", name: "PARTNER ADMIN", permissions: ["view", "create", "edit", "delete", "export", "approve", "cancel", "finance", "audit"] },
  { id: "ACTIVITY_MANAGER", name: "ACTIVITY MANAGER", permissions: ["view", "create", "edit", "export"] },
  { id: "BOOKING_AGENT", name: "BOOKING AGENT", permissions: ["view", "create", "edit", "export"] },
  { id: "VIEWER", name: "VIEWER", permissions: ["view"] },
];

@Injectable()
export class RolesService {
  constructor(private readonly prisma: PrismaService) {}

  async list(tenantId: string, query: RoleQueryDto = new RoleQueryDto()) {
    const parsed = parsePaginationQuery(query, ["name"], "name");
    const search = parsed.search?.toLowerCase();
    const builtin = builtinRoles.filter((role) => !search || role.name.toLowerCase().includes(search)).sort((left, right) => parsed.sortOrder === "desc" ? right.name.localeCompare(left.name) : left.name.localeCompare(right.name));
    const customWhere = { tenantId, ...(query.status ? { isActive: query.status === "ACTIVE" } : {}), ...(search ? { name: { contains: parsed.search, mode: "insensitive" as const } } : {}) };
    const customTotal = await this.prisma.customRole.count({ where: customWhere });
    const offset = (parsed.page - 1) * parsed.pageSize;
    const builtinRows = builtin.slice(offset, offset + parsed.pageSize);
    const customSkip = Math.max(0, offset - builtin.length);
    const customTake = Math.max(0, parsed.pageSize - builtinRows.length);
    const custom = customTake === 0 ? [] : await this.prisma.customRole.findMany({ where: customWhere, orderBy: { [parsed.sortBy]: parsed.sortOrder }, skip: customSkip, take: customTake });
    return paginated([...builtinRows, ...custom.map((role) => ({ ...role, permissions: role.permissions as Record<string, unknown> }))], parsed.page, parsed.pageSize, builtin.length + customTotal);
  }

  async create(tenantId: string, dto: CreateCustomRoleDto) {
    const name = dto.name.trim();
    if (builtinRoles.some((role) => role.name === name.toUpperCase())) throw new ConflictException("Role name is reserved");
    try {
      const role = await this.prisma.customRole.create({ data: { tenantId, name, description: dto.description?.trim(), permissions: dto.permissions as Prisma.InputJsonObject } });
      await this.audit(tenantId, "ROLE_CREATED", role.id);
      return role;
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") throw new ConflictException("Role name already exists");
      throw error;
    }
  }

  async update(tenantId: string, id: string, dto: UpdateCustomRoleDto) {
    await this.getCustom(tenantId, id);
    const role = await this.prisma.customRole.update({ where: { id }, data: { ...(dto.name ? { name: dto.name.trim() } : {}), ...(dto.description !== undefined ? { description: dto.description?.trim() } : {}), ...(dto.permissions ? { permissions: dto.permissions as Prisma.InputJsonObject } : {}), ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}) } });
    await this.audit(tenantId, "ROLE_UPDATED", id);
    return role;
  }

  async remove(tenantId: string, id: string) {
    await this.getCustom(tenantId, id);
    const role = await this.prisma.customRole.update({ where: { id }, data: { isActive: false } });
    await this.audit(tenantId, "ROLE_ARCHIVED", id);
    return role;
  }

  private async getCustom(tenantId: string, id: string) {
    const role = await this.prisma.customRole.findFirst({ where: { id, tenantId } });
    if (!role) throw new NotFoundException("Custom role not found");
    return role;
  }

  private audit(tenantId: string, action: string, entityId: string) {
    return this.prisma.auditLog.create({ data: { tenantId, action, entityType: "CustomRole", entityId } });
  }
}
