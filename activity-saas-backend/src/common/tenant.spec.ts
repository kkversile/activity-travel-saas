import { UserRole } from '@prisma/client';
import { isPlatformRole } from './tenant';

describe('tenant authorization helpers', () => {
  it('recognizes only platform admin roles as cross-tenant', () => {
    expect(isPlatformRole({ sub: '1', email: 'a@x.com', role: UserRole.ADMIN, tenantId: null })).toBe(true);
    expect(isPlatformRole({ sub: '2', email: 's@x.com', role: UserRole.SUB_ADMIN, tenantId: null })).toBe(true);
    expect(isPlatformRole({ sub: '3', email: 'v@x.com', role: UserRole.VENDOR, tenantId: 'tenant-1' })).toBe(false);
  });
});
