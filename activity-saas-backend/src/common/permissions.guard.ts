import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthUser } from './auth.types';
import { PERMISSIONS_KEY } from './permissions.decorator';
import { hasPermission, Permission } from './permissions';

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}
  canActivate(context: ExecutionContext) {
    const required = this.reflector.getAllAndOverride<Permission[]>(PERMISSIONS_KEY, [context.getHandler(), context.getClass()]);
    if (!required?.length) return true;
    const user = context.switchToHttp().getRequest<{ user: AuthUser }>().user;
    if (user && required.every((permission) => hasPermission(user, permission))) return true;
    throw new ForbiddenException('You do not have permission to perform this action');
  }
}
