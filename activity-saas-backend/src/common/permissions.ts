import { OrganizationRole, UserRole } from '@prisma/client';
import { AuthUser } from './auth.types';

export const PERMISSIONS = [
  'vendor.profile.view', 'vendor.profile.edit', 'document.view', 'document.upload', 'document.review',
  'product.view', 'product.edit', 'product.submit', 'product.publish', 'rateplan.view', 'rateplan.edit',
  'inventory.view', 'inventory.edit', 'schedule.view', 'schedule.edit', 'resource.view', 'resource.edit', 'booking.view', 'booking.confirm', 'booking.cancel', 'booking.cancel.agent', 'booking.cancel.vendor', 'booking.cancel.admin', 'booking.create', 'booking.view.own', 'booking.view.vendor', 'booking.confirm.vendor', 'booking.reject.vendor', 'booking.view.admin', 'booking.manual.decide', 'booking.expiry.run', 'refund.view', 'refund.manage', 'financial.cancellation.resolve', 'financial.event.view', 'payout.view', 'settlement.view', 'settlement.manage', 'settlement.hold', 'settlement.policy.manage', 'reconciliation.view', 'vendor.adjustment.manage', 'payout.release', 'payout.reconcile', 'finance.config.manage', 'audit.view',
  'commercial.vendor.view', 'commercial.vendor.edit', 'commercial.internal.view', 'commercial.internal.edit', 'commercial.agent-groups.manage', 'commercial.quote.internal', 'marketplace.search', 'marketplace.view', 'eligibility.inspect', 'agent.governance.view', 'agent.governance.edit', 'marketplace.channel.manage', 'fulfilment.view.vendor', 'fulfilment.edit.vendor', 'fulfilment.view.agent', 'fulfilment.view.admin', 'fulfilment.retry.admin', 'manifest.view', 'manifest.checkin', 'voucher.share',
  'supplier.quality.view.own', 'supplier.quality.view.admin', 'supplier.quality.policy.manage', 'supplier.quality.snapshot.manage', 'supplier.quality.issue.manage', 'supplier.tier.manage',
] as const;
export type Permission = (typeof PERMISSIONS)[number];

const catalogue: Permission[] = ['vendor.profile.view', 'document.view', 'document.upload', 'product.view', 'product.edit', 'product.submit', 'rateplan.view', 'rateplan.edit', 'schedule.view', 'schedule.edit', 'inventory.view', 'resource.view', 'commercial.vendor.view', 'commercial.vendor.edit'];
const operations: Permission[] = ['vendor.profile.view', 'document.view', 'product.view', 'rateplan.view', 'schedule.view', 'schedule.edit', 'inventory.view', 'inventory.edit', 'resource.view', 'resource.edit', 'booking.view', 'booking.confirm', 'booking.cancel', 'fulfilment.view.vendor', 'fulfilment.edit.vendor', 'manifest.view', 'manifest.checkin'];
const finance: Permission[] = ['vendor.profile.view', 'document.view', 'payout.view', 'settlement.view', 'reconciliation.view', 'fulfilment.view.vendor'];
const viewer: Permission[] = ['vendor.profile.view', 'product.view', 'rateplan.view', 'schedule.view', 'inventory.view', 'resource.view', 'booking.view', 'fulfilment.view.vendor'];
const agent: Record<OrganizationRole, Permission[]> = {
  OWNER: ['marketplace.search', 'marketplace.view', 'booking.create', 'booking.view.own', 'booking.cancel.agent', 'fulfilment.view.agent', 'voucher.share'],
  CATALOGUE: ['marketplace.search', 'marketplace.view', 'booking.create', 'booking.view.own', 'booking.cancel.agent', 'fulfilment.view.agent', 'voucher.share'],
  OPERATIONS: ['marketplace.search', 'marketplace.view', 'booking.create', 'booking.view.own', 'booking.cancel.agent', 'fulfilment.view.agent', 'voucher.share'],
  VIEWER: ['marketplace.search', 'marketplace.view', 'booking.create', 'booking.view.own', 'booking.cancel.agent', 'fulfilment.view.agent', 'voucher.share'],
  FINANCE: [],
};

export function permissionsFor(user: Pick<AuthUser, 'role' | 'organizationRole'>): Set<Permission> {
  if (user.role === UserRole.ADMIN) return new Set(PERMISSIONS);
  if (user.role === UserRole.SUB_ADMIN) return new Set(['vendor.profile.view', 'document.view', 'document.review', 'product.view', 'product.publish', 'booking.view', 'booking.view.admin', 'booking.manual.decide', 'booking.expiry.run', 'payout.view', 'settlement.view', 'reconciliation.view', 'audit.view', 'commercial.internal.view', 'commercial.internal.edit', 'commercial.agent-groups.manage', 'commercial.quote.internal', 'eligibility.inspect', 'agent.governance.view', 'agent.governance.edit', 'marketplace.channel.manage', 'fulfilment.view.admin', 'fulfilment.retry.admin', 'manifest.view', 'supplier.quality.view.admin', 'supplier.quality.policy.manage', 'supplier.quality.snapshot.manage', 'supplier.quality.issue.manage', 'supplier.tier.manage']);
  if (user.role === UserRole.TRAVEL_AGENT) return new Set(user.organizationRole ? agent[user.organizationRole] : []);
  if (user.role !== UserRole.VENDOR) return new Set();
  const qualityOwn: Permission[] = ['supplier.quality.view.own'];
  const roleMap: Record<OrganizationRole, Permission[]> = { OWNER: ['vendor.profile.view', 'vendor.profile.edit', 'document.view', 'document.upload', 'product.view', 'product.edit', 'product.submit', 'rateplan.view', 'rateplan.edit', 'inventory.view', 'inventory.edit', 'schedule.view', 'schedule.edit', 'resource.view', 'resource.edit', 'booking.view', 'booking.confirm', 'booking.cancel', 'booking.cancel.vendor', 'booking.view.vendor', 'booking.confirm.vendor', 'booking.reject.vendor', 'fulfilment.view.vendor', 'fulfilment.edit.vendor', 'manifest.view', 'manifest.checkin', 'payout.view', 'settlement.view', 'audit.view', ...qualityOwn], CATALOGUE: [...catalogue, 'booking.view.vendor', 'fulfilment.view.vendor', ...qualityOwn], OPERATIONS: [...operations, 'booking.view.vendor', 'booking.confirm.vendor', 'booking.reject.vendor', ...qualityOwn], FINANCE: [...finance, 'booking.view.vendor', 'refund.view', ...qualityOwn], VIEWER: [...viewer, 'booking.view.vendor', ...qualityOwn] };
  return new Set(user.organizationRole ? roleMap[user.organizationRole] : []);
}

export function hasPermission(user: Pick<AuthUser, 'role' | 'organizationRole'>, permission: Permission) {
  return permissionsFor(user).has(permission);
}
