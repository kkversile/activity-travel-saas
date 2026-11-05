import { BookingStatus } from '@prisma/client';
import { BookingsService } from './bookings.service';
import { bookingRequestFingerprint } from './booking-fingerprint';

describe('BookingsService idempotency', () => {
  it('uses the full include on fast retry and rejects a changed customer identity', async () => {
    const projection = { forAgent: jest.fn().mockReturnValue({ id: 'b1', snapshot: {}, travellers: [], timeline: [] }) };
    const dto: any = { ratePlanId: 'plan-1', sessionId: 'session-1', travellers: [{ travellerType: 'ADULT', quantity: 1 }], customerName: ' Kiran ', customerEmail: 'A@EXAMPLE.COM', bookingAnswers: {}, travellerDetails: [] };
    const fingerprint = bookingRequestFingerprint({ agentTenantId: 'agent-1', ratePlanId: 'plan-1', sessionId: 'session-1', searchAttemptId: null, travellers: [{ travellerType: 'ADULT', quantity: 1 }], units: null, travellerDetails: [], pickupDetails: null, bookingAnswers: {}, customerName: 'Kiran', customerEmail: 'a@example.com' });
    const prisma: any = { booking: { findFirst: jest.fn().mockResolvedValue({ id: 'b1', requestFingerprint: fingerprint }) } };
    const service = new BookingsService(prisma, {} as any, {} as any, {} as any, {} as any, {} as any, {} as any, {} as any, {} as any, projection as any);
    await expect((service as any).create({ role: 'TRAVEL_AGENT', tenantId: 'agent-1', sub: 'user-1' }, dto, 'attempt-1')).resolves.toEqual(expect.objectContaining({ id: 'b1' }));
    expect(prisma.booking.findFirst).toHaveBeenCalledWith(expect.objectContaining({ include: expect.objectContaining({ operationalSnapshot: true, events: expect.anything() }) }));
    await expect((service as any).create({ role: 'TRAVEL_AGENT', tenantId: 'agent-1', sub: 'user-1' }, { ...dto, customerName: 'Ravi' }, 'attempt-1')).rejects.toMatchObject({ response: expect.objectContaining({ code: 'IDEMPOTENCY_KEY_REUSED' }) });
  });
});

describe('BookingsService Admin API channel filters', () => {
  it('includes partner-specific API channel codes and retains search as an independent filter', async () => {
    const prisma: any = {
      booking: { count: jest.fn().mockResolvedValue(0), findMany: jest.fn().mockResolvedValue([]) },
      publicIdentifier: { findMany: jest.fn().mockResolvedValue([]) },
    };
    const projection: any = { forAdmin: jest.fn((row) => row) };
    const service = new BookingsService(prisma, {} as any, {} as any, {} as any, {} as any, {} as any, {} as any, {} as any, {} as any, projection);

    await service.adminList({ channelType: 'PARTNER_API', q: 'APP-0003' } as any);

    const where = prisma.booking.count.mock.calls[0][0].where;
    expect(where.AND).toHaveLength(2);
    expect(where.AND[0]).toEqual({ OR: [
      { distributionChannel: { is: { type: 'PARTNER_API' } } },
      { distributionChannelId: null, channel: 'VOYA_API' },
    ] });
    expect(where.AND[1].OR).toContainEqual({ bookingCode: { contains: 'APP-0003', mode: 'insensitive' } });
    expect(prisma.booking.findMany.mock.calls[0][0].where.AND).toEqual(where.AND);

    await service.adminList({ channelType: 'DIRECT' } as any);
    expect(prisma.booking.count.mock.calls[1][0].where.AND[0].OR).toContainEqual({ distributionChannelId: null, channel: 'VOYA_WEB' });
  });

  it('returns the partner APP public ID in the Admin booking snapshot', async () => {
    const booking = {
      id: 'booking-1', distributionChannelId: 'channel-1', channel: 'TRAVEL_OTA_BLUE',
      operationalSnapshot: { channelSnapshot: { id: 'channel-1', code: 'TRAVEL_OTA_BLUE', name: 'Blue Travel OTA', type: 'PARTNER_API' } },
      product: null, ratePlan: null,
    };
    const prisma: any = {
      booking: { count: jest.fn().mockResolvedValue(1), findMany: jest.fn().mockResolvedValue([booking]) },
      publicIdentifier: { findMany: jest.fn(({ where }: any) => Promise.resolve(where.entityType === 'DISTRIBUTION_CHANNEL' ? [{ entityId: 'channel-1', publicCode: 'APP-0003' }] : [])) },
    };
    const projection: any = { forAdmin: jest.fn((row) => ({ snapshot: row.operationalSnapshot })) };
    const service = new BookingsService(prisma, {} as any, {} as any, {} as any, {} as any, {} as any, {} as any, {} as any, {} as any, projection);

    const result = await service.adminList({ channelType: 'PARTNER_API' } as any);

    expect(result.items[0].snapshot.channelSnapshot).toMatchObject({ publicCode: 'APP-0003', code: 'TRAVEL_OTA_BLUE' });
  });
});

describe('BookingsService marketplace selection locks', () => {
  const user: any = { role: 'TRAVEL_AGENT', tenantId: 'agent-1', sub: 'user-1' };
  const context: any = { plan: { id: 'plan-1', variant: { product: { id: 'product-1', experienceMasterId: 'master-1' } } } };
  const dto: any = { searchAttemptId: '11111111-1111-4111-8111-111111111111', ratePlanId: 'plan-1', sessionId: 'session-1' };

  it('accepts only the locked product, rate plan, and session for the agent search attempt', async () => {
    const lock = { id: 'lock-1', expiresAt: new Date(Date.now() + 60_000) };
    const service = new BookingsService({ experienceSelectionLock: { findFirst: jest.fn().mockResolvedValue(lock) } } as any, {} as any, {} as any, {} as any, {} as any, {} as any, {} as any, {} as any, {} as any, {} as any);
    await expect((service as any).assertSearchSelection((service as any).prisma, user.tenantId, context, dto)).resolves.toBe(lock);
    expect((service as any).prisma.experienceSelectionLock.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ agentTenantId: 'agent-1', searchAttemptId: dto.searchAttemptId, productId: 'product-1', ratePlanId: 'plan-1', sessionId: 'session-1' }) }));
  });

  it('rejects a missing or expired selection lock', async () => {
    const service = new BookingsService({ experienceSelectionLock: { findFirst: jest.fn().mockResolvedValue(null) } } as any, {} as any, {} as any, {} as any, {} as any, {} as any, {} as any, {} as any, {} as any, {} as any);
    await expect((service as any).assertSearchSelection((service as any).prisma, user.tenantId, context, dto)).rejects.toMatchObject({ status: 409 });
  });
});

describe('BookingsService canonical traveller rules', () => {
  const service = () => new BookingsService({} as any, {} as any, {} as any, {} as any, {} as any, {} as any, {} as any, {} as any, {} as any, {} as any);
  const normalized = { quantitiesByType: { ADULT: 2 } };

  it('requires exactly one lead traveller', () => {
    expect(() => (service() as any).validateTravellerDetails([
      { travellerType: 'ADULT', quantity: 1, isLead: true },
      { travellerType: 'ADULT', quantity: 1, isLead: false },
    ], normalized)).not.toThrow();
    expect(() => (service() as any).validateTravellerDetails([
      { travellerType: 'ADULT', quantity: 1, isLead: false },
      { travellerType: 'ADULT', quantity: 1, isLead: false },
    ], normalized)).toThrow('LEAD_TRAVELLER_REQUIRED');
    expect(() => (service() as any).validateTravellerDetails([
      { travellerType: 'ADULT', quantity: 1, isLead: true },
      { travellerType: 'ADULT', quantity: 1, isLead: true },
    ], normalized)).toThrow('MULTIPLE_LEAD_TRAVELLERS');
  });
});

describe('BookingsService supplier failover selection', () => {
  it('selects an eligible linked vendor and enforces the configured price-gap allowance', async () => {
    const eligibility: any = { evaluate: jest.fn().mockResolvedValue({ eligible: true, capacityConsumption: 1 }) };
    const commercial: any = { evaluateInternal: jest.fn().mockResolvedValue({ ready: true, bookingMode: 'VENDOR_CONFIRMATION', finalAmount: '103', currency: 'INR', ratePlanCommercialVersionId: 'cv-2' }) };
    const policy: any = { load: jest.fn().mockResolvedValue({ policy: [], fingerprint: 'policy-2' }) };
    const plan: any = { id: 'plan-2', variant: { id: 'variant-2', product: { id: 'product-2', tenantId: 'vendor-2', experienceMasterId: 'master-1', currentRevision: { id: 'revision-2', bookingQuestions: [], fulfilmentPolicy: { mode: 'AUTO' } } } }, channelMappings: [{ enabled: true, channel: { code: 'VOYA_AGENT', active: true, id: 'channel-1' } }], scheduleMappings: [{ scheduleTemplate: { sessions: [{ id: 'session-2', serviceDate: new Date('2026-11-10'), scheduleTemplate: {} }] } }] };
    const tx: any = { product: { findUnique: jest.fn().mockResolvedValue({ experienceMasterId: 'master-1' }) }, ratePlan: { findMany: jest.fn().mockResolvedValue([plan]) } };
    const service = new BookingsService({} as any, {} as any, {} as any, {} as any, eligibility, commercial, {} as any, policy, {} as any, {} as any);
    const candidate = await (service as any).findAutoFailoverCandidate(tx, { productId: 'product-1', vendorTenantId: 'vendor-1', agentTenantId: 'agent-1', channel: 'VOYA_AGENT', serviceDate: new Date('2026-11-10'), amount: 100, units: 1, travellers: [{ travellerType: 'ADULT', quantity: 1 }], operationalSnapshot: { confirmationPolicySnapshot: { selectionRule: { autoFailover: true, absorbPriceGap: 'LOWER_OF_50_OR_5_PERCENT' } } } });
    expect(candidate.plan.id).toBe('plan-2');
    expect(commercial.evaluateInternal).toHaveBeenCalledWith(expect.objectContaining({ ratePlanId: 'plan-2' }), tx);
  });

  it('does not select a fallback when the configured gap cannot be absorbed', async () => {
    const eligibility: any = { evaluate: jest.fn().mockResolvedValue({ eligible: true, capacityConsumption: 1 }) };
    const commercial: any = { evaluateInternal: jest.fn().mockResolvedValue({ ready: true, bookingMode: 'VENDOR_CONFIRMATION', finalAmount: '151', currency: 'INR', ratePlanCommercialVersionId: 'cv-2' }) };
    const tx: any = { product: { findUnique: jest.fn().mockResolvedValue({ experienceMasterId: 'master-1' }) }, ratePlan: { findMany: jest.fn().mockResolvedValue([{ id: 'plan-2', variant: { product: { id: 'product-2', tenantId: 'vendor-2' } }, channelMappings: [{ enabled: true, channel: { code: 'VOYA_AGENT', active: true } }], scheduleMappings: [{ scheduleTemplate: { sessions: [{ id: 'session-2', serviceDate: new Date('2026-11-10') }] } }] }]) } };
    const service = new BookingsService({} as any, {} as any, {} as any, {} as any, eligibility, commercial, {} as any, { load: jest.fn() } as any, {} as any, {} as any);
    const candidate = await (service as any).findAutoFailoverCandidate(tx, { productId: 'product-1', vendorTenantId: 'vendor-1', agentTenantId: 'agent-1', channel: 'VOYA_AGENT', serviceDate: new Date('2026-11-10'), amount: 100, units: 1, travellers: [{ travellerType: 'ADULT', quantity: 1 }], operationalSnapshot: { confirmationPolicySnapshot: { selectionRule: { autoFailover: true, absorbPriceGap: 'LOWER_OF_50_OR_5_PERCENT' } } } });
    expect(candidate).toBeNull();
  });

  it('exposes supplier API failures through the same transactional failover path', async () => {
    const service = new BookingsService({} as any, {} as any, {} as any, {} as any, {} as any, {} as any, {} as any, {} as any, {} as any, {} as any);
    const process = jest.spyOn(service as any, 'processVendorFailure').mockResolvedValue({ outcome: 'FAILOVERED' });
    await expect(service.vendorApiFailure({ role: 'VENDOR', tenantId: 'vendor-1', sub: 'user-1' } as any, 'booking-1', { reason: 'supplier timeout' })).resolves.toEqual({ outcome: 'FAILOVERED' });
    expect(process).toHaveBeenCalledWith(expect.objectContaining({ tenantId: 'vendor-1' }), 'booking-1', { reason: 'supplier timeout' }, 'VENDOR_API_FAILURE');
  });
});

describe('BookingsService supplier allocation enforcement', () => {
  const eligibility: any = { evaluate: jest.fn().mockResolvedValue({ eligible: true }) };
  const service = () => new BookingsService({} as any, {} as any, {} as any, {} as any, eligibility, {} as any, {} as any, {} as any, {} as any, {} as any);
  const input = { experienceMasterId: 'master-1', productId: 'product-b', vendorTenantId: 'vendor-b', serviceDate: new Date('2026-11-10'), channelCode: 'VOYA_AGENT', agentTenantId: 'agent-1', travellers: [{ travellerType: 'ADULT', quantity: 1 }] };
  const tx = (counts: any[]) => ({
    $queryRawUnsafe: jest.fn().mockResolvedValue([{ id: 'master-1' }]),
    experienceOfferPlacement: { findMany: jest.fn().mockResolvedValue([{ productId: 'product-a', priority: 10 }, { productId: 'product-b', priority: 0 }]) },
    product: { findMany: jest.fn().mockResolvedValue([{ id: 'product-a', tenantId: 'vendor-a' }, { id: 'product-b', tenantId: 'vendor-b' }]) },
    ratePlan: { findMany: jest.fn().mockResolvedValue(['product-a', 'product-b'].map((productId) => ({ id: `plan-${productId}`, currency: 'INR', variant: { id: `variant-${productId}`, productId }, scheduleMappings: [{ scheduleTemplate: { sessions: [{ id: `session-${productId}` }] } }] }))) },
    booking: { groupBy: jest.fn().mockResolvedValue(counts) },
  });

  it('accepts the least-allocated supplier and serializes on the master row', async () => {
    const client = tx([{ vendorTenantId: 'vendor-a', _count: { _all: 4 } }, { vendorTenantId: 'vendor-b', _count: { _all: 3 } }]);
    await expect((service() as any).enforceSupplierAllocation(client, { ...input, allocation: 'ROUND_ROBIN' })).resolves.toBeUndefined();
    expect(client.$queryRawUnsafe).toHaveBeenCalledWith(expect.stringContaining('FOR UPDATE'), 'master-1');
  });

  it('rejects a stale supplier choice after another booking advanced the round robin', async () => {
    const client = tx([{ vendorTenantId: 'vendor-a', _count: { _all: 4 } }, { vendorTenantId: 'vendor-b', _count: { _all: 3 } }]);
    await expect((service() as any).enforceSupplierAllocation(client, { ...input, vendorTenantId: 'vendor-a', productId: 'product-a', allocation: 'ROUND_ROBIN' })).rejects.toMatchObject({ response: expect.objectContaining({ code: 'SUPPLIER_ALLOCATION_CHANGED' }) });
  });

  it('assigns the 30% split slot to the next supplier in admin placement order', async () => {
    const client = tx([{ vendorTenantId: 'vendor-a', _count: { _all: 7 } }]);
    await expect((service() as any).enforceSupplierAllocation(client, { ...input, allocation: 'SPLIT_70_30' })).resolves.toBeUndefined();
    await expect((service() as any).enforceSupplierAllocation(tx([{ vendorTenantId: 'vendor-a', _count: { _all: 7 } }]), { ...input, vendorTenantId: 'vendor-a', productId: 'product-a', allocation: 'SPLIT_70_30' })).rejects.toMatchObject({ response: expect.objectContaining({ code: 'SUPPLIER_ALLOCATION_CHANGED' }) });
  });
});

describe('BookingsService vendor booking search parity', () => {
  it('returns paginated vendor bookings with server-side queue filters and a total count', async () => {
    const row = { id: 'booking-2', bookingCode: 'BK-2', vendorTenantId: 'vendor-1' };
    const prisma: any = {
      publicIdentifier: { findMany: jest.fn().mockResolvedValue([]) },
      booking: { count: jest.fn().mockResolvedValue(61), findMany: jest.fn().mockResolvedValue([row]) },
    };
    const service = new BookingsService(prisma, {} as any, {} as any, {} as any, {} as any, {} as any, {} as any, {} as any, {} as any, { forVendor: (booking: any) => booking } as any);

    const result = await service.vendorPage({ role: 'VENDOR', tenantId: 'vendor-1' } as any, { status: BookingStatus.CONFIRMED, page: 3, limit: 25 } as any);

    expect(prisma.booking.count).toHaveBeenCalledWith({ where: { vendorTenantId: 'vendor-1', status: BookingStatus.CONFIRMED } });
    expect(prisma.booking.findMany).toHaveBeenCalledWith(expect.objectContaining({ skip: 50, take: 25, where: { vendorTenantId: 'vendor-1', status: BookingStatus.CONFIRMED } }));
    expect(result).toEqual({ items: [row], pagination: { page: 3, limit: 25, total: 61, totalPages: 3 } });
  });

  it('exports every matching page instead of stopping at the first hundred bookings', async () => {
    const service = new BookingsService({} as any, {} as any, {} as any, {} as any, {} as any, {} as any, {} as any, {} as any, {} as any, {} as any);
    const row = (id: number) => ({ bookingCode: `BK-${id}`, snapshot: { productSnapshot: { productName: 'Trek' } }, serviceDate: '2026-11-04', agent: { name: 'Agent' }, status: 'CONFIRMED', travellers: [], amount: 100, currency: 'INR' });
    const vendorPage = jest.spyOn(service, 'vendorPage').mockImplementation(async (_user, query) => (query.page === 1
      ? { items: Array.from({ length: 100 }, (_, index) => row(index + 1)), pagination: { page: 1, limit: 100, total: 101, totalPages: 2 } }
      : { items: [row(101)], pagination: { page: 2, limit: 100, total: 101, totalPages: 2 } }) as any);

    const result = await service.vendorCsv({ role: 'VENDOR', tenantId: 'vendor-1' } as any, { q: 'Trek' } as any);

    expect(vendorPage).toHaveBeenCalledTimes(2);
    expect(vendorPage).toHaveBeenNthCalledWith(2, expect.anything(), expect.objectContaining({ q: 'Trek', page: 2, limit: 100 }));
    expect(result.trim().split('\r\n')).toHaveLength(102);
    expect(result).toContain('BK-101');
  });

  it('includes the full selected end date in vendor service-date filters', async () => {
    const prisma: any = {
      publicIdentifier: { findMany: jest.fn().mockResolvedValue([]) },
      booking: { findMany: jest.fn().mockResolvedValue([]) },
    };
    const service = new BookingsService(prisma, {} as any, {} as any, {} as any, {} as any, {} as any, {} as any, {} as any, {} as any, { forVendor: (row: any) => row } as any);

    await service.vendorList({ role: 'VENDOR', tenantId: 'vendor-1' } as any, { from: '2026-11-04', to: '2026-11-04' } as any);

    expect(prisma.booking.findMany.mock.calls[0][0].where.serviceDate).toEqual({
      gte: new Date('2026-11-04T00:00:00.000Z'),
      lt: new Date('2026-11-05T00:00:00.000Z'),
    });
  });

  it('scopes by vendor, applies channel filters, searches public ids, and projects public ids', async () => {
    const booking = { id: 'booking-1', bookingCode: 'VY-INTERNAL', vendorTenantId: 'vendor-1' };
    const prisma: any = {
      publicIdentifier: { findMany: jest.fn().mockResolvedValueOnce([{ entityId: 'booking-1' }]).mockResolvedValueOnce([{ entityId: 'booking-1', publicCode: 'VB-26-0042' }]) },
      booking: { findMany: jest.fn().mockResolvedValue([booking]) },
    };
    const projection: any = { forVendor: jest.fn((row) => ({ id: row.id, bookingCode: row.bookingCode, publicCode: row.publicCode })) };
    const service = new BookingsService(prisma, {} as any, {} as any, {} as any, {} as any, {} as any, {} as any, {} as any, {} as any, projection);

    const result = await service.vendorList({ role: 'VENDOR', tenantId: 'vendor-1' } as any, { q: 'VB-26-0042', channel: 'VOYA_AGENT' } as any);

    expect(prisma.booking.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        vendorTenantId: 'vendor-1',
        channel: 'VOYA_AGENT',
        OR: expect.arrayContaining([{ id: { in: ['booking-1'] } }]),
      }),
    }));
    expect(result).toEqual([{ id: 'booking-1', bookingCode: 'VY-INTERNAL', publicCode: 'VB-26-0042' }]);
  });
});

describe('BookingsService admin booking search parity', () => {
  it('searches activity names and vendor names shown in the Admin booking table', async () => {
    const prisma: any = {
      publicIdentifier: { findMany: jest.fn().mockResolvedValue([]) },
      booking: { count: jest.fn().mockResolvedValue(321), findMany: jest.fn().mockResolvedValue([]) },
    };
    const projection: any = { forAdmin: jest.fn((row) => row) };
    const service = new BookingsService(prisma, {} as any, {} as any, {} as any, {} as any, {} as any, {} as any, {} as any, {} as any, projection);

    const result = await service.adminList({ q: 'Munnar Tea Walk', channel: 'VOYA_AGENT', page: 3, limit: 50 } as any);

    expect(prisma.booking.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        channel: 'VOYA_AGENT',
        OR: expect.arrayContaining([
          { customerPhone: { contains: 'Munnar Tea Walk', mode: 'insensitive' } },
          { vendorTenant: { name: { contains: 'Munnar Tea Walk', mode: 'insensitive' } } },
          { product: { productCode: { contains: 'Munnar Tea Walk', mode: 'insensitive' } } },
          { product: { currentRevision: { productName: { contains: 'Munnar Tea Walk', mode: 'insensitive' } } } },
          { productRevision: { productName: { contains: 'Munnar Tea Walk', mode: 'insensitive' } } },
        ]),
      }),
      skip: 100,
      take: 50,
    }));
    expect(result.pagination).toEqual({ page: 3, limit: 50, total: 321, totalPages: 7 });
  });

  it('includes manual and vendor rejections in the combined rejected queue', async () => {
    const prisma: any = {
      publicIdentifier: { findMany: jest.fn().mockResolvedValue([]) },
      booking: { count: jest.fn().mockResolvedValue(0), findMany: jest.fn().mockResolvedValue([]) },
    };
    const service = new BookingsService(prisma, {} as any, {} as any, {} as any, {} as any, {} as any, {} as any, {} as any, {} as any, { forAdmin: (row: any) => row } as any);
    await service.adminList({ statusGroup: 'REJECTED' } as any);
    expect(prisma.booking.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { status: { in: [BookingStatus.VENDOR_REJECTED, BookingStatus.MANUAL_REJECTED] } },
    }));
  });
});
