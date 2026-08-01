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
    const request = context.switchToHttp().getRequest<Request & { user?: RequestContextUser }>();
    const customRoles = request.user?.customRolePermissions?.roles;
    if (request.user?.customRoleId) {
      const permissions = request.user.customRolePermissions ?? {};
      const moduleName = request.path.split("/").filter(Boolean).find((segment) => segment !== "api" && segment !== "v1") ?? "global";
      const method = request.method.toUpperCase();
      const action = method === "GET" ? "view" : method === "DELETE" ? "delete" : method === "PATCH" || method === "PUT" ? "edit" : /cancel|no-show/.test(request.path) ? "cancel" : /confirm|complete|approve|capture|process|publish/.test(request.path) ? "approve" : "create";
      const modulePermissions = permissions[moduleName];
      const globalPermissions = permissions.global;
      const explicitPermissions = Array.isArray(modulePermissions) ? modulePermissions : Array.isArray(globalPermissions) ? globalPermissions : undefined;
      if (explicitPermissions && explicitPermissions.map(String).includes(action)) return true;
      if (!explicitPermissions && roles?.length && Array.isArray(customRoles) && roles.some((role) => customRoles.includes(role))) return true;
      throw new ForbiddenException("Insufficient custom-role permissions");
    }
    if (!roles?.length) return true;
    const actual = request.user?.role === "PLATFORM_ADMIN" ? "PLATFORM_ADMIN" : request.user?.tenantRole;
    if (!actual || !roles.includes(actual)) throw new ForbiddenException("Insufficient permissions");
    return true;
  }
}
