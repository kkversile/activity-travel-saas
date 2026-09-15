import { OrganizationRole, UserRole } from '@prisma/client';
import { hasPermission } from './permissions';

const user = (role: UserRole, organizationRole: OrganizationRole | null = null) => ({ role, organizationRole });

describe('Phase 1 permission matrix', () => {
  it('allows owner catalogue and operations work but keeps governance platform-only', () => {
    expect(hasPermission(user(UserRole.VENDOR, OrganizationRole.OWNER), 'product.edit')).toBe(true);
    expect(hasPermission(user(UserRole.VENDOR, OrganizationRole.OWNER), 'booking.confirm')).toBe(true);
    expect(hasPermission(user(UserRole.VENDOR, OrganizationRole.OWNER), 'commercial.vendor.view')).toBe(true);
    expect(hasPermission(user(UserRole.VENDOR, OrganizationRole.OWNER), 'commercial.vendor.edit')).toBe(true);
    expect(hasPermission(user(UserRole.VENDOR, OrganizationRole.OWNER), 'product.publish')).toBe(false);
  });
  it('separates organization capabilities', () => {
    expect(hasPermission(user(UserRole.VENDOR, OrganizationRole.CATALOGUE), 'payout.view')).toBe(false);
    expect(hasPermission(user(UserRole.VENDOR, OrganizationRole.OPERATIONS), 'product.publish')).toBe(false);
    expect(hasPermission(user(UserRole.VENDOR, OrganizationRole.FINANCE), 'product.edit')).toBe(false);
    expect(hasPermission(user(UserRole.VENDOR, OrganizationRole.VIEWER), 'booking.cancel')).toBe(false);
    expect(hasPermission(user(UserRole.VENDOR, OrganizationRole.VIEWER), 'payout.view')).toBe(false);
    expect(hasPermission(user(UserRole.VENDOR, OrganizationRole.CATALOGUE), 'product.edit')).toBe(true);
    expect(hasPermission(user(UserRole.VENDOR, OrganizationRole.CATALOGUE), 'inventory.edit')).toBe(false);
    expect(hasPermission(user(UserRole.VENDOR, OrganizationRole.OPERATIONS), 'inventory.edit')).toBe(true);
    expect(hasPermission(user(UserRole.VENDOR, OrganizationRole.OPERATIONS), 'rateplan.edit')).toBe(false);
    expect(hasPermission(user(UserRole.VENDOR, OrganizationRole.FINANCE), 'payout.view')).toBe(true);
    expect(hasPermission(user(UserRole.VENDOR, OrganizationRole.FINANCE), 'booking.confirm')).toBe(false);
    expect(hasPermission(user(UserRole.VENDOR, OrganizationRole.VIEWER), 'product.view')).toBe(true);
    expect(hasPermission(user(UserRole.ADMIN), 'product.publish')).toBe(true);
  });

  it('does not inherit vendor permissions for travel agents', () => {
    const agent = user(UserRole.TRAVEL_AGENT, OrganizationRole.OWNER);
    expect(hasPermission(agent, 'vendor.profile.edit')).toBe(false);
    expect(hasPermission(agent, 'document.upload')).toBe(false);
    expect(hasPermission(agent, 'product.edit')).toBe(false);
    expect(hasPermission(agent, 'product.submit')).toBe(false);
    expect(hasPermission(agent, 'rateplan.edit')).toBe(false);
    expect(hasPermission(agent, 'inventory.edit')).toBe(false);
    expect(hasPermission(agent, 'booking.confirm')).toBe(false);
    expect(hasPermission(agent, 'payout.view')).toBe(false);
  });

  it('applies the explicit Agent organization matrix', () => {
    for (const role of [OrganizationRole.OWNER, OrganizationRole.CATALOGUE, OrganizationRole.OPERATIONS, OrganizationRole.VIEWER]) {
      expect(hasPermission(user(UserRole.TRAVEL_AGENT, role), 'marketplace.search')).toBe(true);
      expect(hasPermission(user(UserRole.TRAVEL_AGENT, role), 'marketplace.view')).toBe(true);
    }
    expect(hasPermission(user(UserRole.TRAVEL_AGENT, OrganizationRole.FINANCE), 'marketplace.search')).toBe(false);
    expect(hasPermission(user(UserRole.VENDOR, OrganizationRole.OWNER), 'eligibility.inspect')).toBe(false);
    expect(hasPermission(user(UserRole.VENDOR, OrganizationRole.OWNER), 'marketplace.channel.manage')).toBe(false);
    expect(hasPermission(user(UserRole.VENDOR, OrganizationRole.OWNER), 'commercial.internal.view')).toBe(false);
  });
});
