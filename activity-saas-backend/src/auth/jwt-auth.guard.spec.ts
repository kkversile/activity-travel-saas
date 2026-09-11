import { OrganizationRole, UserRole } from '@prisma/client';
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
});
