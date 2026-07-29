import type { UserRole } from "@prisma/client";

export interface AuthenticatedUser {
  id: string;
  email: string;
  displayName: string;
  role: UserRole;
  tenantId?: string;
}

export interface RequestContextUser extends AuthenticatedUser {
  tenantRole?: UserRole;
}
