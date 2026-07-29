import { ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { hashPassword } from "../auth/crypto";
import { CreateUserDto, UpdateUserDto } from "./users.dto";

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  list(tenantId: string) {
    return this.prisma.tenantMembership.findMany({ where: { tenantId }, include: { user: { select: { id: true, email: true, displayName: true, isActive: true, role: true, createdAt: true } } }, orderBy: { createdAt: "asc" } });
  }

  async create(tenantId: string, dto: CreateUserDto) {
    const existing = await this.prisma.user.findUnique({ where: { email: dto.email.toLowerCase() } });
    if (existing) throw new ConflictException("Email is already registered");
    const user = await this.prisma.user.create({ data: { email: dto.email.toLowerCase(), displayName: dto.displayName, passwordHash: await hashPassword(dto.password), role: dto.role, tenantId } });
    await this.prisma.tenantMembership.create({ data: { tenantId, userId: user.id, role: dto.role } });
    await this.prisma.auditLog.create({ data: { tenantId, action: "USER_CREATED", entityType: "User", entityId: user.id } });
    return { id: user.id, email: user.email, displayName: user.displayName, role: dto.role, isActive: user.isActive };
  }

  async update(tenantId: string, id: string, dto: UpdateUserDto) {
    const membership = await this.prisma.tenantMembership.findUnique({ where: { tenantId_userId: { tenantId, userId: id } } });
    if (!membership) throw new NotFoundException("User membership not found");
    const user = await this.prisma.user.update({ where: { id }, data: { displayName: dto.displayName, isActive: dto.isActive, ...(dto.role ? { role: dto.role } : {}) } });
    if (dto.role) await this.prisma.tenantMembership.update({ where: { id: membership.id }, data: { role: dto.role } });
    if (dto.isActive === false) await this.prisma.refreshToken.updateMany({ where: { userId: id, revokedAt: null }, data: { revokedAt: new Date() } });
    await this.prisma.auditLog.create({ data: { tenantId, action: "USER_UPDATED", entityType: "User", entityId: id } });
    return user;
  }
}
