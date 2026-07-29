import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { Request } from "express";
import type { UserRole } from "@prisma/client";
import { ROLES_KEY } from "./roles.decorator";
import type { RequestContextUser } from "./auth.types";

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const roles = this.reflector.getAllAndOverride<UserRole[]>(ROLES_KEY, [context.getHandler(), context.getClass()]);
    if (!roles?.length) return true;
    const request = context.switchToHttp().getRequest<Request & { user?: RequestContextUser }>();
    const actual = request.user?.role === "PLATFORM_ADMIN" ? "PLATFORM_ADMIN" : request.user?.tenantRole;
    if (!actual || !roles.includes(actual)) throw new ForbiddenException("Insufficient permissions");
    return true;
  }
}
