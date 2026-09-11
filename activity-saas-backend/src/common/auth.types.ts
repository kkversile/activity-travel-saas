import { OrganizationRole, UserRole } from '@prisma/client';

export interface AuthUser {
  sub: string;
  email: string;
  fullName?: string;
  role: UserRole;
  tenantId: string | null;
  organizationRole?: OrganizationRole | null;
  active?: boolean;
}
