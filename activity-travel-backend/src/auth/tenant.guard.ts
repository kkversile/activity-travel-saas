import { CanActivate, ExecutionContext, ForbiddenException, Injectable, UnauthorizedException } from "@nestjs/common";
import type { Request } from "express";
import { PrismaService } from "../prisma/prisma.service";
import type { RequestContextUser } from "./auth.types";

@Injectable()
export class TenantAccessGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request & { user?: RequestContextUser; tenantId?: string }>();
    if (!request.user) throw new UnauthorizedException();
    const tenantId = request.header("x-tenant-id");
    if (!tenantId) throw new ForbiddenException("x-tenant-id header is required");
    if (request.user.role === "PLATFORM_ADMIN") {
      const tenant = await this.prisma.tenant.findUnique({ where: { id: tenantId }, select: { id: true } });
      if (!tenant) throw new ForbiddenException("Tenant not found");
      request.tenantId = tenantId;
      return true;
    }
    const membership = await this.prisma.tenantMembership.findUnique({
      where: { tenantId_userId: { tenantId, userId: request.user.id } },
      select: { role: true }
    });
    if (!membership) throw new ForbiddenException("User is not a member of this tenant");
    request.tenantId = tenantId;
    request.user.tenantRole = membership.role;
    return true;
  }
}
