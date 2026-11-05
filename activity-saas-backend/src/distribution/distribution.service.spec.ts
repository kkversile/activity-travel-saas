import { createHash } from 'crypto';
import { DistributionAuthGuard, DistributionCapabilityGuard } from './distribution-auth.guard';
import { ChannelEligibilityService } from './channel-eligibility.service';
import { channelAvailability, channelPublishedCapacity } from './distribution-math';
import { DistributionService } from './distribution.service';

describe('Distribution core', () => {
  it('applies buffer before maximum published capacity', () => expect(channelPublishedCapacity(10, 2, 5)).toBe(5));
  it('returns zero when the buffer exceeds remaining capacity', () => expect(channelPublishedCapacity(1, 2)).toBe(0));
  it('does not expose quantity in AVAILABLE_ONLY mode at the projection boundary', () => { const response = channelAvailability(10, 2, undefined, true); expect(response.available).toBe(true); expect(response.remainingCapacity).toBe(8); });
  it('returns unavailable for a closed session', () => expect(channelAvailability(10, 0, undefined, false).available).toBe(false));

  it('rejects a missing API key', async () => { const guard = new DistributionAuthGuard({} as any); await expect(guard.canActivate({ switchToHttp: () => ({ getRequest: () => ({ headers: {} }) }) } as any)).rejects.toThrow('Missing distribution API key'); });
  it('authenticates a valid key and resolves channel context', async () => { const raw = 'voya_test.secret'; const db: any = { channelApiCredential: { findUnique: jest.fn().mockResolvedValue({ id: 'cred', channelId: 'ch', keyPrefix: 'voya_test', keyHash: createHash('sha256').update(raw).digest('hex'), scopes: ['CATALOG_READ'], status: 'ACTIVE', expiresAt: null, channel: { id: 'ch', code: 'PARTNER', name: 'Partner', type: 'PARTNER_API', active: true, contracts: [{ id: 'contract', versionNumber: 1, status: 'ACTIVE', effectiveFrom: new Date('2020-01-01'), effectiveTo: null, allowedCurrencies: ['INR'], availabilityHorizonDays: 30 }] } }), update: jest.fn() } }; const request: any = { headers: { 'x-api-key': raw } }; await expect(new DistributionAuthGuard(db).canActivate({ switchToHttp: () => ({ getRequest: () => request }) } as any)).resolves.toBe(true); expect(request.distributionContext.channelId).toBe('ch'); });
  it('rejects a key signed for a different secret', async () => { const db: any = { channelApiCredential: { findUnique: jest.fn().mockResolvedValue({ keyPrefix: 'voya_test', keyHash: '00'.repeat(32), status: 'ACTIVE', expiresAt: null, channel: { active: true, contracts: [{ status: 'ACTIVE', effectiveFrom: new Date('2020-01-01'), effectiveTo: null }] } }) } }; await expect(new DistributionAuthGuard(db).canActivate({ switchToHttp: () => ({ getRequest: () => ({ headers: { 'x-api-key': 'voya_test.wrong' } }) }) } as any)).rejects.toThrow('Invalid distribution API key'); });
  it('rejects a revoked credential', async () => { const db: any = { channelApiCredential: { findUnique: jest.fn().mockResolvedValue({ keyPrefix: 'voya_test', keyHash: createHash('sha256').update('voya_test.secret').digest('hex'), status: 'REVOKED', expiresAt: null, channel: { active: true, contracts: [{ status: 'ACTIVE', effectiveFrom: new Date('2020-01-01'), effectiveTo: null }] } }) } }; await expect(new DistributionAuthGuard(db).canActivate({ switchToHttp: () => ({ getRequest: () => ({ headers: { 'x-api-key': 'voya_test.secret' } }) }) } as any)).rejects.toThrow('inactive or expired'); });
  it('rejects a credential when the channel contract is unavailable', async () => { const db: any = { channelApiCredential: { findUnique: jest.fn().mockResolvedValue({ keyPrefix: 'voya_test', keyHash: createHash('sha256').update('voya_test.secret').digest('hex'), status: 'ACTIVE', expiresAt: null, channel: { active: true, contracts: [] } }) } }; await expect(new DistributionAuthGuard(db).canActivate({ switchToHttp: () => ({ getRequest: () => ({ headers: { 'x-api-key': 'voya_test.secret' } }) }) } as any)).rejects.toThrow('contract is inactive'); });
  it('intersects credential scopes with active contract capabilities', async () => { const raw = 'voya_intersection.secret'; const db: any = { channelApiCredential: { findUnique: jest.fn().mockResolvedValue({ id: 'cred', channelId: 'ch', keyPrefix: 'voya_intersection', keyHash: createHash('sha256').update(raw).digest('hex'), scopes: ['CATALOG_READ', 'EVENT_READ'], status: 'ACTIVE', expiresAt: null, channel: { id: 'ch', code: 'PARTNER', name: 'Partner', type: 'PARTNER_API', active: true, contracts: [{ id: 'contract', versionNumber: 2, status: 'ACTIVE', capabilities: ['CATALOG_READ'], effectiveFrom: new Date('2020-01-01'), effectiveTo: null, allowedCurrencies: ['INR'], availabilityHorizonDays: 30 }] } }), update: jest.fn() } }; const request: any = { headers: { 'x-api-key': raw } }; await new DistributionAuthGuard(db).canActivate({ switchToHttp: () => ({ getRequest: () => request }) } as any); expect(request.distributionContext.capabilities).toEqual(['CATALOG_READ']); });
  it('denies a capability absent from effective contract power', () => { const guard = new DistributionCapabilityGuard({ getAllAndOverride: () => ['EVENT_READ'] } as any); expect(() => guard.canActivate({ getHandler: () => undefined, getClass: () => undefined, switchToHttp: () => ({ getRequest: () => ({ distributionContext: { capabilities: ['CATALOG_READ'] } }) }) } as any)).toThrow('effective contract capability'); });
  it('preserves stable hierarchy and inventory reason codes', async () => { const db: any = { distributionChannel: { findUnique: jest.fn().mockResolvedValue({ id: 'ch', active: true }) }, channelContract: { findFirst: jest.fn().mockResolvedValue({ status: 'ACTIVE', effectiveFrom: new Date('2020-01-01'), effectiveTo: null, allowedCurrencies: ['INR'] }) }, productChannelMapping: { findUnique: jest.fn().mockResolvedValue({ status: 'ACTIVE', productId: 'other' }) }, variantChannelMapping: { findUnique: jest.fn().mockResolvedValue({ status: 'ACTIVE', variantId: 'v' }) }, ratePlanChannelMapping: { findUnique: jest.fn().mockResolvedValue({ status: 'ACTIVE', ratePlanId: 'r', inventoryRule: null }) }, ratePlan: { findUnique: jest.fn().mockResolvedValue({ id: 'r', variantId: 'v', variant: { productId: 'p', product: { tenant: { kind: 'VENDOR', vendorProfile: { verificationStatus: 'VERIFIED' } }, status: 'LIVE', currentRevision: { status: 'PUBLISHED', fulfilmentPolicy: { mode: 'AUTO', reviewRequired: false } } } }, status: 'ACTIVE', validFrom: new Date('2020-01-01'), validTo: new Date('2030-01-01') }) } }; await expect(new ChannelEligibilityService(db).evaluate({ channelId: 'ch', productId: 'p', variantId: 'v', ratePlanId: 'r' })).resolves.toMatchObject({ eligible: false, reasonCodes: expect.arrayContaining(['CHANNEL_MAPPING_HIERARCHY_MISMATCH', 'CHANNEL_INVENTORY_NOT_EXPOSED']) }); });

  it('returns a stable reason when the channel is missing', async () => { const db: any = { distributionChannel: { findUnique: jest.fn().mockResolvedValue(null) } }; await expect(new ChannelEligibilityService(db).evaluate({ channelCode: 'MISSING', productId: 'p', variantId: 'v', ratePlanId: 'r' })).resolves.toMatchObject({ eligible: false, reasonCodes: ['CHANNEL_NOT_FOUND'] }); });
  it('fails closed when an active channel has no active contract', async () => { const db: any = { distributionChannel: { findUnique: jest.fn().mockResolvedValue({ id: 'ch', active: true }) }, channelContract: { findFirst: jest.fn().mockResolvedValue(null) }, productChannelMapping: { findUnique: jest.fn().mockResolvedValue(null) }, variantChannelMapping: { findUnique: jest.fn().mockResolvedValue(null) }, ratePlanChannelMapping: { findUnique: jest.fn().mockResolvedValue(null) }, ratePlan: { findUnique: jest.fn().mockResolvedValue(null) } }; await expect(new ChannelEligibilityService(db).evaluate({ channelId: 'ch', productId: 'p', variantId: 'v', ratePlanId: 'r' })).resolves.toMatchObject({ eligible: false, reasonCodes: expect.arrayContaining(['CHANNEL_CONTRACT_MISSING']) }); });
  it('enforces required capability metadata', () => { const guard = new DistributionCapabilityGuard({ getAllAndOverride: () => ['PRICING_READ'] } as any); expect(() => guard.canActivate({ getHandler: () => undefined, getClass: () => undefined, switchToHttp: () => ({ getRequest: () => ({ distributionContext: { capabilities: ['CATALOG_READ'] } }) }) } as any)).toThrow('lacks the required capability'); });
});

describe('API partner public IDs', () => {
  it('returns the APP public ID separately from a PARTNER_API channel code', async () => {
    const prisma: any = {
      distributionChannel: { findMany: jest.fn().mockResolvedValue([{ id: 'channel-1', code: 'VOYA_API', type: 'PARTNER_API' }]) },
      publicIdentifier: { findMany: jest.fn().mockResolvedValue([{ entityId: 'channel-1', publicCode: 'APP-0003' }]) },
    };
    const service = new DistributionService(prisma, {} as any, {} as any, {} as any, {} as any, {} as any);

    await expect(service.channels()).resolves.toEqual([{ id: 'channel-1', code: 'VOYA_API', type: 'PARTNER_API', publicCode: 'APP-0003' }]);
    expect(prisma.publicIdentifier.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { entityType: 'DISTRIBUTION_CHANNEL', entityId: { in: ['channel-1'] } } }));
  });

  it('allocates APP IDs only for partner API channels at creation', async () => {
    const channel = { id: 'channel-2', code: 'PARTNER_DEMO', type: 'PARTNER_API', name: 'Demo Partner' };
    const tx: any = {
      distributionChannel: { create: jest.fn().mockResolvedValue(channel) },
      publicIdentifier: { findMany: jest.fn().mockResolvedValue([]), upsert: jest.fn().mockImplementation(({ create }: any) => create) },
      publicIdentifierSequence: { upsert: jest.fn().mockResolvedValue({ lastValue: 1 }) },
    };
    const prisma: any = { $transaction: jest.fn((callback: any) => callback(tx)) };
    const audit = { write: jest.fn() };
    const outbox = { enqueue: jest.fn() };
    const service = new DistributionService(prisma, audit as any, outbox as any, {} as any, {} as any, {} as any);

    await expect(service.createChannel({ sub: 'admin-1' } as any, { code: 'PARTNER_DEMO', name: 'Demo Partner', type: 'PARTNER_API' } as any)).resolves.toMatchObject({ id: 'channel-2', code: 'PARTNER_DEMO', publicCode: 'APP-0001' });
    expect(tx.publicIdentifier.upsert).toHaveBeenCalledWith(expect.objectContaining({ create: expect.objectContaining({ entityType: 'DISTRIBUTION_CHANNEL', entityId: 'channel-2', publicCode: 'APP-0001' }) }));
    expect(outbox.enqueue).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ payload: expect.objectContaining({ publicCode: 'APP-0001' }) }));
  });

  it('allocates a public ID when an existing channel changes to PARTNER_API', async () => {
    const tx: any = {
      distributionChannel: {
        findUnique: jest.fn().mockResolvedValue({ id: 'channel-3', code: 'PARTNER_LATER', type: 'DIRECT', active: false, version: 1 }),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        findUniqueOrThrow: jest.fn().mockResolvedValue({ id: 'channel-3', code: 'PARTNER_LATER', type: 'PARTNER_API', active: false, version: 2 }),
      },
      publicIdentifier: {
        findUnique: jest.fn().mockResolvedValue(null),
        findMany: jest.fn().mockResolvedValue([]),
        upsert: jest.fn().mockImplementation(({ create }: any) => create),
      },
      publicIdentifierSequence: { upsert: jest.fn().mockResolvedValue({ lastValue: 1 }) },
    };
    const prisma: any = { $transaction: jest.fn((callback: any) => callback(tx)) };
    const service = new DistributionService(prisma, { write: jest.fn() } as any, { enqueue: jest.fn() } as any, {} as any, {} as any, {} as any);

    await expect(service.updateChannel({ sub: 'admin-1' } as any, 'channel-3', { type: 'PARTNER_API', expectedVersion: 1 } as any)).resolves.toMatchObject({ id: 'channel-3', publicCode: 'APP-0001' });
    expect(tx.publicIdentifier.upsert).toHaveBeenCalledWith(expect.objectContaining({ create: expect.objectContaining({ entityType: 'DISTRIBUTION_CHANNEL', entityId: 'channel-3', publicCode: 'APP-0001' }) }));
  });
});
