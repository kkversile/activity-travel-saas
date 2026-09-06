import { ForbiddenException } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { AuthUser } from './auth.types';

export function requireTenant(user: AuthUser): string {
  if (!user.tenantId) throw new ForbiddenException('A tenant-scoped account is required');
  return user.tenantId;
}

export function isPlatformRole(user: AuthUser): boolean {
  return user.role === UserRole.ADMIN || user.role === UserRole.SUB_ADMIN;
}
