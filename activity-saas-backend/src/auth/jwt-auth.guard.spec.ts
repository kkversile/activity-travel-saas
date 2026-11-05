import { ImpersonationSessionStatus, OrganizationRole, UserRole } from '@prisma/client';
import { ForbiddenException } from '@nestjs/common';
import { JwtAuthGuard } from './jwt-auth.guard';

describe('JwtAuthGuard trusted user reload', () => {
  it('uses organizationRole and active state from PostgreSQL', async () => {
    const jwt = { verifyAsync: jest.fn().mockResolvedValue({ sub: 'u1', role: UserRole.VENDOR, tenantId: 't1' }) };
    const prisma = { user: { findUnique: jest.fn().mockResolvedValue({ id: 'u1', email: 'v@example.com', fullName: 'Vendor', role: UserRole.VENDOR, tenantId: 't1', organizationRole: OrganizationRole.FINANCE, active: true }) } };
    const request: any = { headers: { authorization: 'Bearer token' } };
    const context: any = { switchToHttp: () => ({ getRequest: () => request }) };
    await expect(new JwtAuthGuard(jwt as any, prisma as any).canActivate(context)).resolves.toBe(true);
    expect(request.user.organizationRole).toBe(OrganizationRole.FINANCE);
    expect(request.user.active).toBe(true);
  });

  it('keeps impersonation read-only while allowing the session to end', async () => {
    const expiresAt = new Date(Date.now() + 60_000);
    const jwt = { verifyAsync: jest.fn().mockResolvedValue({ sub: 'vendor-1', role: UserRole.VENDOR, tenantId: 'tenant-1', isImpersonating: true, impersonationSessionId: 'session-1', impersonatorId: 'super-1' }) };
    const prisma = {
      user: {
        findUnique: jest.fn().mockResolvedValue({ id: 'vendor-1', email: 'v@example.com', fullName: 'Vendor', role: UserRole.VENDOR, tenantId: 'tenant-1', organizationRole: OrganizationRole.OWNER, active: true }),
        findFirst: jest.fn().mockResolvedValue({ id: 'super-1', email: 'super@example.com' }),
      },
      impersonationSession: { findUnique: jest.fn().mockResolvedValue({ id: 'session-1', originalAdminId: 'super-1', targetUserId: 'vendor-1', status: ImpersonationSessionStatus.ACTIVE, expiresAt }) },
    };
    const createContext = (method: string, originalUrl: string) => {
      const request: any = { headers: { authorization: 'Bearer token' }, method, originalUrl };
      const context: any = { switchToHttp: () => ({ getRequest: () => request }) };
      return { request, context };
    };
    const guard = new JwtAuthGuard(jwt as any, prisma as any);

    const read = createContext('GET', '/products');
    await expect(guard.canActivate(read.context)).resolves.toBe(true);
    const write = createContext('POST', '/products/drafts');
    await expect(guard.canActivate(write.context)).rejects.toBeInstanceOf(ForbiddenException);
    const end = createContext('POST', '/auth/impersonation/end');
    await expect(guard.canActivate(end.context)).resolves.toBe(true);
  });
});
