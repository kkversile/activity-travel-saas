import { OrganizationRole, UserRole } from '@prisma/client';
import { permissionsFor } from '../common/permissions';
describe('Supplier quality security', () => {
  it('gives vendors only own-view quality access and admins manage access', () => { expect(permissionsFor({ role: UserRole.VENDOR, organizationRole: OrganizationRole.OWNER })).toContain('supplier.quality.view.own'); expect(permissionsFor({ role: UserRole.VENDOR, organizationRole: OrganizationRole.OWNER })).not.toContain('supplier.quality.view.admin'); expect(permissionsFor({ role: UserRole.ADMIN, organizationRole: null })).toContain('supplier.tier.manage'); });
});
