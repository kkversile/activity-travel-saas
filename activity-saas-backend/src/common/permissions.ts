import { OrganizationRole, UserRole } from '@prisma/client';
import { AuthUser } from './auth.types';

export const PERMISSIONS = [
  'vendor.profile.view', 'vendor.profile.edit', 'document.view', 'document.upload', 'document.review',
  'product.view', 'product.edit', 'product.submit', 'product.publish', 'rateplan.view', 'rateplan.edit',
  'inventory.view', 'inventory.edit', 'schedule.view', 'schedule.edit', 'resource.view', 'resource.edit', 'booking.view', 'booking.confirm', 'booking.cancel', 'booking.cancel.agent', 'booking.cancel.vendor', 'booking.cancel.admin', 'booking.create', 'booking.view.own', 'booking.view.vendor', 'booking.confirm.vendor', 'booking.reject.vendor', 'booking.view.admin', 'booking.manual.decide', 'booking.expiry.run', 'refund.view', 'refund.manage', 'financial.cancellation.resolve', 'financial.event.view', 'payout.view', 'settlement.view', 'settlement.manage', 'settlement.hold', 'settlement.policy.manage', 'reconciliation.view', 'vendor.adjustment.manage', 'payout.release.request', 'payout.release.approve', 'payout.release', 'payout.reconcile', 'finance.config.manage', 'audit.view',
  'commercial.vendor.view', 'commercial.vendor.edit', 'commercial.internal.view', 'commercial.internal.edit', 'commercial.agent-groups.manage', 'commercial.quote.internal', 'marketplace.search', 'marketplace.view', 'eligibility.inspect', 'agent.governance.view', 'agent.governance.edit', 'marketplace.channel.manage', 'fulfilment.view.vendor', 'fulfilment.edit.vendor', 'fulfilment.view.agent', 'fulfilment.view.admin', 'fulfilment.retry.admin', 'manifest.view', 'manifest.checkin', 'voucher.share',
  'supplier.quality.view.own', 'supplier.quality.view.admin', 'supplier.quality.policy.manage', 'supplier.quality.snapshot.manage', 'supplier.quality.issue.manage', 'supplier.tier.manage',
  'demand.view.admin', 'demand.manage', 'demand.policy.manage', 'demand.target.manage', 'demand.view.vendor', 'demand.respond.vendor',
  'distribution.view', 'distribution.channel.manage', 'distribution.contract.manage', 'distribution.mapping.manage', 'distribution.inventory-rule.manage', 'distribution.credential.manage', 'distribution.event.view', 'distribution.inspect',
  'buybox.admin.view', 'buybox.admin.manage', 'buybox.vendor.view', 'buybox.vendor.bid', 'platform.settings.manage',
  'agent.dashboard.view', 'agent.finance.view', 'agent.reports.view', 'agent.profile.view', 'agent.profile.edit', 'agent.team.manage',
] as const;
export type Permission = (typeof PERMISSIONS)[number];

const catalogue: Permission[] = ['vendor.profile.view', 'document.view', 'document.upload', 'product.view', 'product.edit', 'product.submit', 'rateplan.view', 'rateplan.edit', 'schedule.view', 'schedule.edit', 'inventory.view', 'resource.view', 'commercial.vendor.view', 'commercial.vendor.edit'];
const operations: Permission[] = ['vendor.profile.view', 'document.view', 'product.view', 'rateplan.view', 'schedule.view', 'schedule.edit', 'inventory.view', 'inventory.edit', 'resource.view', 'resource.edit', 'booking.view', 'booking.confirm', 'booking.cancel', 'fulfilment.view.vendor', 'fulfilment.edit.vendor', 'manifest.view', 'manifest.checkin'];
const finance: Permission[] = ['vendor.profile.view', 'document.view', 'payout.view', 'settlement.view', 'reconciliation.view', 'fulfilment.view.vendor'];
const viewer: Permission[] = ['vendor.profile.view', 'product.view', 'rateplan.view', 'schedule.view', 'inventory.view', 'resource.view', 'booking.view', 'fulfilment.view.vendor'];
// Normal admins operate the marketplace but do not bypass platform governance.
// Sensitive controls are explicitly reserved for SUPER_ADMIN and are also
// guarded at the controller/service boundary (permissions are not UI-only).
const normalAdmin: Permission[] = PERMISSIONS.filter((permission) => ![
  'platform.settings.manage',
  'finance.config.manage',
  'payout.release',
  'payout.reconcile',
].includes(permission));
const agent: Record<OrganizationRole, Permission[]> = {
  OWNER: ['agent.dashboard.view', 'agent.finance.view', 'agent.reports.view', 'agent.profile.view', 'agent.profile.edit', 'agent.team.manage', 'marketplace.search', 'marketplace.view', 'booking.create', 'booking.view.own', 'booking.cancel.agent', 'fulfilment.view.agent', 'voucher.share'],
  CATALOGUE: ['agent.dashboard.view', 'agent.reports.view', 'agent.profile.view', 'marketplace.search', 'marketplace.view', 'booking.create', 'booking.view.own', 'booking.cancel.agent', 'fulfilment.view.agent', 'voucher.share'],
  OPERATIONS: ['agent.dashboard.view', 'agent.reports.view', 'agent.profile.view', 'marketplace.search', 'marketplace.view', 'booking.create', 'booking.view.own', 'booking.cancel.agent', 'fulfilment.view.agent', 'voucher.share'],
  VIEWER: ['agent.dashboard.view', 'agent.reports.view', 'agent.profile.view', 'marketplace.search', 'marketplace.view', 'booking.view.own', 'fulfilment.view.agent'],
  FINANCE: ['agent.dashboard.view', 'agent.finance.view', 'agent.reports.view', 'agent.profile.view', 'booking.view.own'],
};

export function permissionsFor(user: Pick<AuthUser, 'role' | 'organizationRole'>): Set<Permission> {
  if (user.role === UserRole.SUPER_ADMIN) return new Set(PERMISSIONS);
  if (user.role === UserRole.ADMIN) return new Set(normalAdmin);
  if (user.role === UserRole.TRAVEL_AGENT) return new Set(user.organizationRole ? agent[user.organizationRole] : []);
  if (user.role !== UserRole.VENDOR) return new Set();
  const qualityOwn: Permission[] = ['supplier.quality.view.own']; const demandVendorView: Permission[] = ['demand.view.vendor']; const demandVendorRespond: Permission[] = ['demand.respond.vendor']; const vendorBuyBox: Permission[] = ['buybox.vendor.view', 'buybox.vendor.bid'];
  const roleMap: Record<OrganizationRole, Permission[]> = { OWNER: ['vendor.profile.view', 'vendor.profile.edit', 'document.view', 'document.upload', 'product.view', 'product.edit', 'product.submit', 'rateplan.view', 'rateplan.edit', 'commercial.vendor.view', 'commercial.vendor.edit', 'inventory.view', 'inventory.edit', 'schedule.view', 'schedule.edit', 'resource.view', 'resource.edit', 'booking.view', 'booking.confirm', 'booking.cancel', 'booking.cancel.vendor', 'booking.view.vendor', 'booking.confirm.vendor', 'booking.reject.vendor', 'fulfilment.view.vendor', 'fulfilment.edit.vendor', 'manifest.view', 'manifest.checkin', 'payout.view', 'settlement.view', 'audit.view', ...vendorBuyBox, ...qualityOwn, ...demandVendorView, ...demandVendorRespond], CATALOGUE: [...catalogue, 'booking.view.vendor', 'fulfilment.view.vendor', ...vendorBuyBox, ...qualityOwn, ...demandVendorView, ...demandVendorRespond], OPERATIONS: [...operations, 'booking.view.vendor', 'booking.confirm.vendor', 'booking.reject.vendor', ...vendorBuyBox, ...qualityOwn, ...demandVendorView, ...demandVendorRespond], FINANCE: [...finance, 'booking.view.vendor', ...qualityOwn], VIEWER: [...viewer, 'booking.view.vendor', ...vendorBuyBox, ...qualityOwn, ...demandVendorView] };
  return new Set(user.organizationRole ? roleMap[user.organizationRole] : []);
}

export function hasPermission(user: Pick<AuthUser, 'role' | 'organizationRole'>, permission: Permission) {
  return permissionsFor(user).has(permission);
}
