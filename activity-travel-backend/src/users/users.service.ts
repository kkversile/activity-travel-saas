import { ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { hashPassword } from "../auth/crypto";
import { CreateUserDto, UpdateUserDto } from "./users.dto";
import { UserQueryDto } from "./users.dto";
import { paginated, parsePaginationQuery } from "../common/pagination/pagination";

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async list(tenantId: string, query: UserQueryDto = new UserQueryDto()) {
    const parsed = parsePaginationQuery(query, ["createdAt"], "createdAt");
    const where = { tenantId, ...(query.status ? { user: { isActive: query.status === "ACTIVE" } } : {}), ...(parsed.search ? { user: { ...(query.status ? { isActive: query.status === "ACTIVE" } : {}), OR: [{ displayName: { contains: parsed.search, mode: "insensitive" as const } }, { email: { contains: parsed.search, mode: "insensitive" as const } }] } } : {}) };
    const [data, total] = await this.prisma.$transaction([
      this.prisma.tenantMembership.findMany({ where, include: { customRole: true, user: { select: { id: true, email: true, displayName: true, isActive: true, role: true, lastLoginAt: true, createdAt: true, _count: { select: { memberships: true } } } } }, orderBy: { createdAt: parsed.sortOrder as "asc" | "desc" }, skip: (parsed.page - 1) * parsed.pageSize, take: parsed.pageSize }),
      this.prisma.tenantMembership.count({ where }),
    ]);
    return paginated(data, parsed.page, parsed.pageSize, total);
  }

  async create(tenantId: string, dto: CreateUserDto) {
    const existing = await this.prisma.user.findUnique({ where: { email: dto.email.toLowerCase() } });
    if (existing) throw new ConflictException("Email is already registered");
    if (dto.customRoleId !== undefined && dto.customRoleId !== null) { const customRole = await this.prisma.customRole.findFirst({ where: { id: dto.customRoleId, tenantId, isActive: true } }); if (!customRole) throw new NotFoundException("Custom role not found for tenant"); }
    const user = await this.prisma.user.create({ data: { email: dto.email.toLowerCase(), displayName: dto.displayName, passwordHash: await hashPassword(dto.password), role: dto.role, tenantId } });
    await this.prisma.tenantMembership.create({ data: { tenantId, userId: user.id, role: dto.role, customRoleId: dto.customRoleId } });
    await this.prisma.auditLog.create({ data: { tenantId, action: "USER_CREATED", entityType: "User", entityId: user.id } });
    return { id: user.id, email: user.email, displayName: user.displayName, role: dto.role, customRoleId: dto.customRoleId, isActive: user.isActive };
  }

  async update(tenantId: string, id: string, dto: UpdateUserDto) {
    const membership = await this.prisma.tenantMembership.findUnique({ where: { tenantId_userId: { tenantId, userId: id } } });
    if (!membership) throw new NotFoundException("User membership not found");
    if (dto.customRoleId) { const customRole = await this.prisma.customRole.findFirst({ where: { id: dto.customRoleId, tenantId, isActive: true } }); if (!customRole) throw new NotFoundException("Custom role not found for tenant"); }
    const user = await this.prisma.user.update({ where: { id }, data: { displayName: dto.displayName, isActive: dto.isActive } });
    if (dto.role !== undefined || dto.customRoleId !== undefined) await this.prisma.tenantMembership.update({ where: { id: membership.id }, data: { ...(dto.role !== undefined ? { role: dto.role } : {}), ...(dto.customRoleId !== undefined ? { customRoleId: dto.customRoleId } : {}) } });
    if (dto.isActive === false) await this.prisma.refreshToken.updateMany({ where: { userId: id, revokedAt: null }, data: { revokedAt: new Date() } });
    await this.prisma.auditLog.create({ data: { tenantId, action: "USER_UPDATED", entityType: "User", entityId: id } });
    return user;
  }
}
