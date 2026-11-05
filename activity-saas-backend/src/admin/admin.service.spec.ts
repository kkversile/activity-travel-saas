import { DocumentReviewStatus, ProductStatus, UserRole, VendorVerificationStatus } from '@prisma/client';
import { AdminService } from './admin.service';

const actor = { sub: 'admin-1', email: 'admin@voya.test', role: UserRole.SUPER_ADMIN, tenantId: null } as any;
const lookupPrisma = (value: Record<string, any>) => ({
  vendorProfile: { findMany: jest.fn().mockResolvedValue([]) },
  voucherVersion: { findMany: jest.fn().mockResolvedValue([]) },
  ...value,
});

describe('AdminService governance', () => {
  it('blocks normal Admin from managing platform accounts at the service boundary', async () => {
    const normalAdmin = { ...actor, role: UserRole.ADMIN };
    const prisma: any = { user: { findUnique: jest.fn(), findFirst: jest.fn() } };
    const service = new AdminService(prisma, {} as any, {} as any);

    await expect(service.createAdmin(normalAdmin, { fullName: 'Other Admin', email: 'other@voya.test', password: 'ChangeMe@123' })).rejects.toThrow('Only a Super Admin can manage platform accounts');
    await expect(service.setAdminStatus(normalAdmin, 'admin-2', false)).rejects.toThrow('Only a Super Admin can manage platform accounts');
    await expect(service.resetAdminPassword(normalAdmin, 'admin-2', 'ChangeMe@123')).rejects.toThrow('Only a Super Admin can manage platform accounts');
    await expect(service.resetManagedUserPassword(normalAdmin, 'vendor-user', 'ChangeMe@123')).rejects.toThrow('Only a Super Admin can manage platform accounts');
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
    expect(prisma.user.findFirst).not.toHaveBeenCalled();
  });
  it('returns stable public approval IDs without replacing action UUIDs', async () => {
    const tx: any = {
      $queryRaw: jest.fn(),
      publicIdentifier: {
        findUnique: jest.fn().mockResolvedValue(null),
        findMany: jest.fn().mockResolvedValue([]),
        upsert: jest.fn().mockImplementation(({ create }: any) => create),
      },
    };
    const prisma: any = {
      publicIdentifier: {},
      vendorProfile: { findMany: jest.fn().mockResolvedValue([{ id: 'vendor-profile-uuid', tenantId: 'vendor-tenant', legalBusinessName: 'Demo Vendor', verificationStatus: 'PENDING', updatedAt: new Date('2026-10-30T12:00:00Z') }]) },
      $transaction: jest.fn((callback: any) => callback(tx)),
    };
    const service = new AdminService(prisma, {} as any, {} as any);

    await expect(service.approvals('VENDOR')).resolves.toMatchObject([{ id: 'vendor-profile-uuid', publicCode: 'APR-000001', type: 'VENDOR' }]);
    expect(tx.publicIdentifier.upsert).toHaveBeenCalledWith(expect.objectContaining({ create: expect.objectContaining({ entityType: 'APPROVAL', entityId: 'VENDOR:vendor-profile-uuid', publicCode: 'APR-000001' }) }));
  });

  it('resolves public product IDs to navigable Admin records', async () => {
    const prisma: any = lookupPrisma({
      publicIdentifier: { findMany: jest.fn().mockResolvedValue([{ entityType: 'PRODUCT', entityId: 'product-uuid', publicCode: 'TA-GA-0318' }]) },
      product: { findUnique: jest.fn().mockResolvedValue({ productCode: 'TA-GA-0318', currentRevision: { productName: 'North Goa Tour', cityName: 'Panaji', stateName: 'Goa' } }) },
    });
    const service = new AdminService(prisma, {} as any, {} as any);

    await expect(service.globalLookup('TA-GA-0318')).resolves.toMatchObject({ items: [{ id: 'product-uuid', publicCode: 'TA-GA-0318', title: 'North Goa Tour', page: 'products' }] });
    expect(prisma.publicIdentifier.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { publicCode: { contains: 'TA-GA-0318', mode: 'insensitive' } }, take: 25 }));
  });

  it('includes stable public agent IDs in the Admin agent list', async () => {
    const agent = { id: 'agent-tenant-uuid', kind: 'TRAVEL_AGENT', name: 'Coastal Travel', agentProfile: { legalBusinessName: 'Coastal Travel Pvt Ltd' }, agentCommercialProfile: null, users: [] };
    const prisma: any = {
      tenant: { findMany: jest.fn().mockResolvedValue([agent]) },
      publicIdentifier: { findMany: jest.fn().mockResolvedValue([{ entityId: agent.id, publicCode: 'AGT-000042' }]) },
      booking: { aggregate: jest.fn().mockResolvedValue({ _count: { _all: 0 }, _sum: { amount: null } }) },
    };
    const service = new AdminService(prisma, {} as any, {} as any);

    await expect(service.agents()).resolves.toMatchObject([{ id: agent.id, publicCode: 'AGT-000042', name: agent.name }]);
    expect(prisma.publicIdentifier.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { entityType: 'AGENT', entityId: { in: [agent.id] } } }));
  });

  it('resolves API partner public IDs to the Distribution Admin page', async () => {
    const prisma: any = lookupPrisma({
      publicIdentifier: { findMany: jest.fn().mockResolvedValue([{ entityType: 'DISTRIBUTION_CHANNEL', entityId: 'channel-uuid', publicCode: 'APP-0003' }]) },
      distributionChannel: { findUnique: jest.fn().mockResolvedValue({ code: 'VOYA_API', name: 'Acme Distribution', type: 'PARTNER_API', active: true }) },
    });
    const service = new AdminService(prisma, {} as any, {} as any);

    await expect(service.globalLookup('APP-0003')).resolves.toMatchObject({ items: [{ id: 'channel-uuid', entityType: 'DISTRIBUTION_CHANNEL', publicCode: 'APP-0003', title: 'Acme Distribution', detail: 'APP-0003 · VOYA_API · PARTNER_API · Active', page: 'distribution' }] });
  });

  it('searches platform coupons by their public ID and returns the customer code', async () => {
    const prisma: any = lookupPrisma({
      publicIdentifier: { findMany: jest.fn().mockResolvedValue([{ entityType: 'PLATFORM_COUPON', entityId: 'coupon-uuid', publicCode: 'CPN-0007' }]) },
      platformCoupon: { findUnique: jest.fn().mockResolvedValue({ code: 'GOAFEST', name: 'Goa Fest', status: 'ACTIVE' }) },
    });
    const service = new AdminService(prisma, {} as any, {} as any);

    await expect(service.globalLookup('CPN-0007')).resolves.toMatchObject({ items: [{ id: 'coupon-uuid', publicCode: 'CPN-0007', title: 'Goa Fest', detail: 'CPN-0007 · GOAFEST · ACTIVE', page: 'promotions' }] });
  });

  it('searches commission invoice IDs and returns the Finance record', async () => {
    const prisma: any = lookupPrisma({
      publicIdentifier: { findMany: jest.fn().mockResolvedValue([{ entityType: 'COMMISSION_INVOICE', entityId: 'invoice-uuid', publicCode: 'INV/2627/000184' }]) },
      commissionInvoice: { findUnique: jest.fn().mockResolvedValue({ invoiceNumber: 'INV/2627/000184', vendorLegalName: 'Demo Vendor', status: 'ISSUED', totalAmount: '118.00', currency: 'INR' }) },
    });
    const service = new AdminService(prisma, {} as any, {} as any);

    await expect(service.globalLookup('INV/2627/000184')).resolves.toMatchObject({ items: [{ id: 'invoice-uuid', publicCode: 'INV/2627/000184', title: 'Commission invoice · Demo Vendor', detail: 'INV/2627/000184 · ISSUED · 118 INR', page: 'settlements' }] });
  });

  it('resolves vendor document IDs to the owning vendor', async () => {
    const prisma: any = lookupPrisma({
      publicIdentifier: { findMany: jest.fn().mockResolvedValue([{ entityType: 'VENDOR_DOCUMENT', entityId: 'document-uuid', publicCode: 'DOC-004188' }]) },
      vendorDocument: { findUnique: jest.fn().mockResolvedValue({ type: 'GST_CERTIFICATE', currentStatus: 'VERIFIED', tenant: { name: 'Vendor', vendorProfile: { legalBusinessName: 'Demo Vendor' } } }) },
    });
    const service = new AdminService(prisma, {} as any, {} as any);

    await expect(service.globalLookup('DOC-004188')).resolves.toMatchObject({ items: [{ id: 'document-uuid', entityType: 'VENDOR_DOCUMENT', publicCode: 'DOC-004188', title: 'Demo Vendor · GST CERTIFICATE', detail: 'DOC-004188 · VERIFIED', page: 'vendors' }] });
  });

  it('resolves vendor voucher prefixes and generated voucher codes', async () => {
    const prisma: any = lookupPrisma({
      publicIdentifier: { findMany: jest.fn().mockResolvedValue([]) },
      vendorProfile: { findMany: jest.fn().mockResolvedValue([{ tenantId: 'vendor-uuid', voucherShortCode: 'GCE', legalBusinessName: 'Goa Coastal Excursions', operatingCity: 'Panaji', tenant: { name: 'Goa Coastal' } }]) },
      voucherVersion: { findMany: jest.fn().mockResolvedValue([{ id: 'voucher-uuid', voucherCode: 'GCE-7H2K-91QZ', status: 'CURRENT', booking: { id: 'booking-uuid', bookingCode: 'BK-26110482', customerName: 'Riya Shah' } }]) },
    });
    const service = new AdminService(prisma, {} as any, {} as any);

    await expect(service.globalLookup('GCE')).resolves.toMatchObject({ items: [
      { id: 'vendor-uuid', entityType: 'VENDOR_SHORT_CODE', publicCode: 'GCE', title: 'Goa Coastal Excursions', detail: 'GCE · Panaji', page: 'vendors' },
      { id: 'booking-uuid', entityType: 'VOUCHER', publicCode: 'GCE-7H2K-91QZ', title: 'Riya Shah', detail: 'GCE-7H2K-91QZ · CURRENT · BK-26110482', page: 'bookings' },
    ] });
  });

  it('assigns stable prototype-format public IDs to promotions and platform coupons', async () => {
    const coupon = { id: 'coupon-uuid', code: 'GOAFEST', name: 'Goa Fest', discountType: 'PERCENT', discountValue: 12, startsAt: new Date('2026-11-01'), endsAt: new Date('2026-11-15'), status: 'PENDING_APPROVAL', redeemedCount: 0 };
    const tx: any = {
      platformCoupon: { create: jest.fn().mockResolvedValue(coupon) },
      publicIdentifier: {
        findMany: jest.fn().mockResolvedValue([]),
        upsert: jest.fn().mockImplementation(({ create }: any) => create),
      },
      publicIdentifierSequence: { upsert: jest.fn().mockResolvedValue({ lastValue: 1 }) },
    };
    const prisma: any = { $transaction: jest.fn((callback: any) => callback(tx)) };
    const audit = { write: jest.fn() };
    const service = new AdminService(prisma, audit as any, {} as any);

    await expect(service.createPlatformCoupon(actor, { code: 'goafest', name: 'Goa Fest', discountType: 'PERCENT', discountValue: '12', startsAt: '2026-11-01', endsAt: '2026-11-15' })).resolves.toMatchObject({ id: 'coupon-uuid', publicCode: 'CPN-0001', code: 'GOAFEST' });
    expect(tx.publicIdentifier.upsert).toHaveBeenCalledWith(expect.objectContaining({ create: expect.objectContaining({ entityType: 'PLATFORM_COUPON', entityId: 'coupon-uuid', publicCode: 'CPN-0001' }) }));
    expect(audit.write).toHaveBeenCalledWith(tx, expect.objectContaining({ afterState: expect.objectContaining({ publicCode: 'CPN-0001', code: 'GOAFEST' }) }));
  });

  it('returns stored promotion and coupon public IDs on Admin list endpoints', async () => {
    const promotion = { id: 'promotion-uuid', productId: 'product-1', name: 'Early bird', promotionType: 'EARLY_BIRD', discountPercent: '10', discountAmount: null, startsAt: new Date('2026-11-01'), endsAt: new Date('2026-11-15'), bookingStartsAt: null, bookingEndsAt: null, validWeekdays: [], stackWithPlatform: false, fundingOwner: 'SUPPLIER', maxDiscountedBookings: null, active: true, product: { productCode: 'TA-GA-0001', currentRevision: { productName: 'Goa tour' }, tenant: { id: 'vendor-1', name: 'Vendor', vendorProfile: null } } };
    const coupon = { id: 'coupon-uuid', code: 'GOAFEST', redeemedCount: 3 };
    const prisma: any = {
      promotion: { findMany: jest.fn().mockResolvedValue([promotion]) },
      platformCoupon: { findMany: jest.fn().mockResolvedValue([coupon]) },
      publicIdentifier: { findMany: jest.fn().mockImplementation(({ where }: any) => Promise.resolve([{ entityId: where.entityId.in[0], publicCode: where.entityType === 'PROMOTION' ? 'PRM-0002' : 'CPN-0001' }])) },
      bookingEconomicsSnapshot: { count: jest.fn().mockResolvedValue(0) },
    };
    const service = new AdminService(prisma, {} as any, {} as any);

    await expect(service.promotions()).resolves.toMatchObject([{ id: 'promotion-uuid', publicCode: 'PRM-0002' }]);
    await expect(service.platformCoupons()).resolves.toMatchObject([{ id: 'coupon-uuid', publicCode: 'CPN-0001', code: 'GOAFEST', bookings: 3 }]);
  });

  it('includes pending agent wallet credits in the approvals queue with maker-checker context', async () => {
    const prisma: any = {
      agentWalletCreditApprovalRequest: { findMany: jest.fn().mockResolvedValue([{ id: 'credit-1', agentTenantId: 'agent-1', amount: '250.00', paymentMethod: 'UPI', reference: 'UPI-123', reason: 'Verified receipt', status: 'PENDING', requestedById: 'maker-1', createdAt: new Date('2026-11-01T10:00:00Z'), agentTenant: { id: 'agent-1', name: 'Demo Agent' }, requestedBy: { id: 'maker-1', fullName: 'Maker Admin', email: 'maker@test' } }]) },
    };
    const service = new AdminService(prisma, {} as any, {} as any);
    await expect(service.approvals('AGENT_WALLET_CREDIT', 'checker-1')).resolves.toEqual([expect.objectContaining({ id: 'credit-1', type: 'AGENT_WALLET_CREDIT', ownerName: 'Demo Agent', requesterName: 'Maker Admin', paymentMethod: 'UPI', reference: 'UPI-123', requestReason: 'Verified receipt', canDecide: true, amount: 250 })]);
    await expect(service.approvals('AGENT_WALLET_CREDIT', 'maker-1')).resolves.toEqual([expect.objectContaining({ id: 'credit-1', canDecide: false })]);
  });

  it('includes agent commercial proposals with the proposed terms and blocks the maker from deciding', async () => {
    const prisma: any = {
      agentCommercialChangeRequest: { findMany: jest.fn().mockResolvedValue([{ id: 'change-1', tenantId: 'agent-1', status: 'PENDING', createdById: 'maker-1', proposedConfiguration: { commissionPercent: 12 }, requestReason: 'Agreed annual terms', createdAt: new Date('2026-11-01T10:00:00Z'), tenant: { id: 'agent-1', name: 'Demo Agent' }, createdBy: { id: 'maker-1', fullName: 'Maker Admin', email: 'maker@test' } }]) },
    };
    const service = new AdminService(prisma, {} as any, {} as any);
    await expect(service.approvals('AGENT_COMMERCIAL', 'checker-1')).resolves.toEqual([expect.objectContaining({ id: 'change-1', type: 'AGENT_COMMERCIAL', ownerName: 'Demo Agent', requesterName: 'Maker Admin', canDecide: true, proposedConfiguration: { commissionPercent: 12 }, requestReason: 'Agreed annual terms' })]);
    await expect(service.approvals('AGENT_COMMERCIAL', 'maker-1')).resolves.toEqual([expect.objectContaining({ id: 'change-1', canDecide: false })]);
  });

  it('returns vendor metrics and distinguishes onboarding defaults from currently effective rate-plan terms', async () => {
    const findFirst = jest.fn().mockResolvedValue({
      id: 'tenant-1', name: 'Demo Vendor', vendorProfile: { defaultSupplierModel: 'NET_RATE', defaultSupplierCommissionPercent: null },
      products: [{ id: 'product-1', variants: [{ ratePlans: [{ commercialVersions: [{ supplierModel: 'COMMISSIONABLE', supplierCommissionPercent: '18.0000' }] }] }] }],
    });
    const findMany = jest.fn().mockResolvedValue([
      { id: 'b1', status: 'CONFIRMED', bookingMode: 'MANUAL_ON_REQUEST', confirmedAt: new Date(), amount: 1200, cancellation: null },
      { id: 'b2', status: 'VENDOR_REJECTED', bookingMode: 'VENDOR_CONFIRMATION', confirmedAt: null, amount: 900, cancellation: null },
      { id: 'b3', status: 'PENDING_MANUAL_REVIEW', bookingMode: 'MANUAL_ON_REQUEST', confirmedAt: null, amount: 450, cancellation: null },
      { id: 'b4', status: 'CANCELLED', bookingMode: 'VENDOR_CONFIRMATION', confirmedAt: new Date(), amount: 300, cancellation: { initiator: 'VENDOR' } },
      { id: 'b5', status: 'CONFIRMATION_EXPIRED', bookingMode: 'VENDOR_CONFIRMATION', confirmedAt: null, amount: 0, cancellation: null },
    ]);
    const prisma: any = { tenant: { findFirst }, booking: { findMany } };
    const service = new AdminService(prisma, {} as any, {} as any);

    const vendor = await service.vendor('tenant-1');

    expect(vendor.metrics).toMatchObject({ bookings: 5, gmv: 2850, acceptanceRate: 50, cancellationsByVendor: 20, cancellationsByVendorCount: 1, rating: null, ratingAvailable: false });
    expect(vendor.commercialTerms).toMatchObject({ model: 'NET_RATE', commissionPercent: null, source: 'vendor onboarding defaults' });
    expect(vendor.ratePlanTerms).toMatchObject({ model: 'COMMISSIONABLE', commissionPercent: 18, source: 'active rate-plan commercial versions' });
    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({ select: expect.objectContaining({ bookingMode: true, confirmedAt: true, cancellation: expect.any(Object) }) }));
    const productsQuery = findFirst.mock.calls[0][0].include.products;
    expect(productsQuery.where).toEqual({ deletedAt: null });
    expect(productsQuery.include.variants.where).toEqual({ status: { not: 'ARCHIVED' }, archivedAt: null });
    const ratePlansQuery = productsQuery.include.variants.include.ratePlans;
    expect(ratePlansQuery.where).toEqual({ status: 'ACTIVE' });
    const versionsWhere = ratePlansQuery.include.commercialVersions.where;
    expect(versionsWhere).toMatchObject({ status: 'ACTIVE', effectiveFrom: { lte: expect.any(Date) } });
    expect(versionsWhere.OR).toHaveLength(2);
  });

  it('creates a vendor account with a random password and returns an invite requirement, never the password', async () => {
    const user = { id: 'vendor-user', email: 'vendor@example.com', fullName: 'Demo Vendor', role: UserRole.VENDOR, tenantId: 'tenant-1', active: true };
    const tx: any = { tenant: { create: jest.fn().mockResolvedValue({ id: 'tenant-1' }) }, user: { create: jest.fn().mockResolvedValue(user) }, vendorProfile: { create: jest.fn().mockResolvedValue({}) }, publicIdentifierSequence: { upsert: jest.fn().mockResolvedValue({ lastValue: 1 }) } };
    const prisma: any = { user: { findUnique: jest.fn().mockResolvedValue(null) }, $transaction: jest.fn((callback: any) => callback(tx)) };
    const service = new AdminService(prisma, { write: jest.fn() } as any, { enqueue: jest.fn() } as any);
    const result = await service.createVendor(actor, { vendorName: 'Demo Vendor', ownerName: 'Demo Owner', cityName: 'Malvan', mobile: '+919422018833', supplierType: 'DIRECT_OPERATOR', email: 'Vendor@example.com', commercialModel: 'COMMISSIONABLE', commissionPercent: 18, accountManagerName: 'Ops One' });
    expect(tx.user.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ email: 'vendor@example.com', fullName: 'Demo Owner', role: UserRole.VENDOR, passwordHash: expect.any(String), mustChangePassword: true }) }));
    expect(tx.vendorProfile.create).toHaveBeenCalledWith({ data: expect.objectContaining({ legalBusinessName: 'Demo Vendor', operatingCity: 'Malvan', registrationMobile: '+919422018833', supplierType: 'DIRECT_OPERATOR', accountManagerName: 'Ops One', defaultSupplierModel: 'COMMISSIONABLE', defaultSupplierCommissionPercent: 18, voucherShortCode: 'AAA' }) });
    expect(result).toMatchObject({ email: 'vendor@example.com', inviteRequired: true, vendorName: 'Demo Vendor' });
    expect(result).not.toHaveProperty('temporaryPassword');
  });

  it('requires a valid default commission for commission-based vendor setup', async () => {
    const service = new AdminService({} as any, {} as any, {} as any);
    await expect(service.createVendor(actor, { vendorName: 'Commission Vendor', email: 'vendor@example.com', commercialModel: 'COMMISSIONABLE' })).rejects.toThrow('Commission percent is required');
    await expect(service.createVendor(actor, { vendorName: 'Commission Vendor', email: 'vendor@example.com', commercialModel: 'NET_RATE', commissionPercent: 120 })).rejects.toThrow('Commission must be between 0 and 100');
  });

  it('shows vendor onboarding commercial defaults until rate-plan terms take over', async () => {
    const prisma: any = {
      tenant: { findMany: jest.fn().mockResolvedValue([{ id: 'tenant-1', name: 'Demo Vendor', vendorProfile: { defaultSupplierModel: 'NET_RATE', defaultSupplierCommissionPercent: 12.5 }, products: [], _count: { products: 0, vendorBookings: 0, payouts: 0 } }]) },
      publicIdentifier: { findMany: jest.fn().mockResolvedValue([]) },
    };
    const service = new AdminService(prisma, {} as any, {} as any);

    const [vendor] = await service.vendors();

    expect(vendor).toMatchObject({ commercialModel: 'NET_RATE', commissionPercent: 12.5 });
    expect(prisma.tenant.findMany).toHaveBeenCalledWith(expect.objectContaining({ include: expect.objectContaining({ vendorProfile: expect.objectContaining({ select: expect.objectContaining({ defaultSupplierModel: true, defaultSupplierCommissionPercent: true }) }) }) }));
  });

  it('does not average vendor commissions across different effective contracts', async () => {
    const prisma: any = {
      tenant: { findMany: jest.fn().mockResolvedValue([{
        id: 'tenant-mixed', name: 'Mixed Vendor',
        vendorProfile: { defaultSupplierModel: 'COMMISSIONABLE', defaultSupplierCommissionPercent: 18 },
        products: [{ variants: [{ ratePlans: [
          { commercialVersions: [{ supplierModel: 'COMMISSIONABLE', supplierCommissionPercent: 18 }] },
          { commercialVersions: [{ supplierModel: 'NET_RATE', supplierCommissionPercent: null }] },
        ] }] }],
        _count: { products: 1, vendorBookings: 0, payouts: 0 },
      }]) },
      publicIdentifier: { findMany: jest.fn().mockResolvedValue([]) },
    };
    const service = new AdminService(prisma, {} as any, {} as any);

    const [vendor] = await service.vendors();

    expect(vendor).toMatchObject({ commercialModel: 'MIXED', commissionPercent: null, commissionVaries: true, commissionValues: [18] });
    const versionsWhere = prisma.tenant.findMany.mock.calls[0][0].include.products.select.variants.select.ratePlans.select.commercialVersions.where;
    expect(versionsWhere).toMatchObject({ status: 'ACTIVE', effectiveFrom: { lte: expect.any(Date) } });
    expect(versionsWhere.OR).toHaveLength(2);
  });

  it('requires a different Admin to approve a vendor commercial change and persists only after approval', async () => {
    const request = { id: 'change-1', tenantId: 'tenant-1', proposedSupplierModel: 'COMMISSIONABLE', proposedCommissionPercent: 18, requestReason: 'Updated agreement', status: 'PENDING', createdById: 'admin-1' };
    const tx: any = {
      $queryRaw: jest.fn(),
      vendorCommercialChangeRequest: { findFirst: jest.fn().mockResolvedValue(request), update: jest.fn().mockResolvedValue({ ...request, status: 'APPROVED', reviewedById: 'admin-2' }) },
      vendorProfile: { update: jest.fn().mockResolvedValue({ tenantId: 'tenant-1' }) },
    };
    const prisma: any = { $transaction: jest.fn((callback: any) => callback(tx)) };
    const service = new AdminService(prisma, { write: jest.fn() } as any, { enqueue: jest.fn() } as any);

    await expect(service.reviewVendorCommercialChange(actor, 'tenant-1', 'change-1', 'APPROVED')).rejects.toThrow('A different Admin must review');
    await expect(service.reviewVendorCommercialChange({ ...actor, sub: 'admin-2' }, 'tenant-1', 'change-1', 'APPROVED')).resolves.toMatchObject({ status: 'APPROVED' });
    expect(tx.vendorProfile.update).toHaveBeenCalledWith({ where: { tenantId: 'tenant-1' }, data: { defaultSupplierModel: 'COMMISSIONABLE', defaultSupplierCommissionPercent: 18 } });
  });

  it('rejects unsupported vendor verification transitions', async () => {
    const prisma: any = { vendorProfile: { findUnique: jest.fn() } };
    const service = new AdminService(prisma, {} as any, {} as any);
    await expect(service.verification(actor, 't1', VendorVerificationStatus.PENDING)).rejects.toMatchObject({ status: 409 });
  });

  it('reviews only the latest document version', async () => {
    const latest = { id: 'v2', versionNumber: 2 };
    const tx: any = { vendorDocumentVersion: { findFirst: jest.fn().mockResolvedValue({ id: 'v1', versionNumber: 1, status: DocumentReviewStatus.PENDING, vendorDocumentId: 'd1', vendorDocument: { versions: [latest] } }), updateMany: jest.fn().mockResolvedValue({ count: 1 }) }, vendorDocument: { update: jest.fn() } };
    const prisma: any = {
      $transaction: jest.fn(async (callback: any) => callback(tx)),
      tenant: { findFirst: jest.fn().mockResolvedValue({ products: [] }) },
      booking: { findMany: jest.fn().mockResolvedValue([]) },
    };
    const service = new AdminService(prisma, { write: jest.fn() } as any, { enqueue: jest.fn() } as any);
    await expect(service.document(actor, 't1', 'v1', DocumentReviewStatus.VERIFIED)).rejects.toMatchObject({ status: 409 });
    tx.vendorDocumentVersion.findFirst.mockResolvedValue({ id: 'v2', versionNumber: 2, status: DocumentReviewStatus.PENDING, vendorDocumentId: 'd1', vendorDocument: { versions: [latest] } });
    await expect(service.document(actor, 't1', 'v2', DocumentReviewStatus.VERIFIED)).resolves.toBeDefined();
    expect(tx.vendorDocument.update).toHaveBeenCalledWith({ where: { id: 'd1' }, data: { currentStatus: DocumentReviewStatus.VERIFIED } });
  });

  it('archives only live products and records the lifecycle event', async () => {
    const tx: any = { $queryRaw: jest.fn(), product: { findFirst: jest.fn().mockResolvedValue({ id: 'p1', tenantId: 't1', status: ProductStatus.LIVE, currentRevisionId: 'r1' }), update: jest.fn().mockResolvedValue({ id: 'p1', status: ProductStatus.ARCHIVED }) } };
    const prisma: any = { $transaction: jest.fn((callback: any) => callback(tx)) };
    const audit = { write: jest.fn() };
    const outbox = { enqueue: jest.fn() };
    const service = new AdminService(prisma, audit as any, outbox as any);
    await expect(service.archiveProduct(actor, 'p1')).resolves.toMatchObject({ status: ProductStatus.ARCHIVED });
    expect(tx.product.update).toHaveBeenCalledWith({ where: { id: 'p1' }, data: { status: ProductStatus.ARCHIVED } });
    expect(audit.write).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ action: 'PRODUCT_ARCHIVED' }));
    expect(outbox.enqueue).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ eventType: 'PRODUCT_ARCHIVED' }));
  });
});
