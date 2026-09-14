import { OrganizationRole, UserRole } from '@prisma/client';
import { hasPermission } from '../common/permissions';

describe('Demand security boundary', () => {
  it('allows explicit admin/vendor permissions but no Agent demand APIs', () => {
    expect(hasPermission({ role: UserRole.ADMIN, organizationRole: null }, 'demand.manage')).toBe(true);
    expect(hasPermission({ role: UserRole.VENDOR, organizationRole: OrganizationRole.OWNER }, 'demand.view.vendor')).toBe(true);
    expect(hasPermission({ role: UserRole.VENDOR, organizationRole: OrganizationRole.OWNER }, 'demand.manage')).toBe(false);
    expect(hasPermission({ role: UserRole.TRAVEL_AGENT, organizationRole: OrganizationRole.OWNER }, 'demand.view.admin')).toBe(false);
  });
});

