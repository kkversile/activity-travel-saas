import { ExperienceMatchingService } from './experience-matching.service';

const admin = { sub: 'admin-1', role: 'ADMIN' } as any;
const superAdmin = { sub: 'super-1', role: 'SUPER_ADMIN' } as any;

function make() {
  const current = {
    id: 'rules-1', scope: 'VOYA_AGENT', status: 'LIVE',
    objective: 'MARGIN', priceWeight: 40, ratingWeight: 20,
    reliabilityWeight: 20, inventoryWeight: 10, contractWeight: 10,
    autoFailover: true, absorbPriceGap: 'LOWER_OF_50_OR_5_PERCENT',
    lockMinutes: 15, allocation: 'WINNER_TAKES_ALL', pendingConfiguration: null,
  };
  let pendingForApproval = false;
  const pendingConfiguration = { objective: 'MARGIN', priceWeight: 50, ratingWeight: 20, reliabilityWeight: 20, inventoryWeight: 10, contractWeight: 0, autoFailover: true, absorbPriceGap: 'LOWER_OF_50_OR_5_PERCENT', lockMinutes: 15, allocation: 'WINNER_TAKES_ALL' };
  const tx: any = {
    $queryRaw: jest.fn(),
    experienceSelectionRuleSet: {
      upsert: jest.fn().mockResolvedValue(current),
      findUnique: jest.fn().mockImplementation(() => Promise.resolve(pendingForApproval ? { ...current, pendingConfiguration, pendingUpdatedById: 'admin-1' } : current)),
      update: jest.fn().mockImplementation(({ data }: any) => Promise.resolve({ ...current, ...data, pendingConfiguration: data.pendingUpdatedById ? data.pendingConfiguration : null, pendingUpdatedById: data.pendingUpdatedById ?? null })),
    },
    publicIdentifier: { findUnique: jest.fn().mockResolvedValue(null), findMany: jest.fn().mockResolvedValue([]), upsert: jest.fn().mockImplementation(({ create }: any) => create) },
    publicIdentifierSequence: { upsert: jest.fn().mockResolvedValue({ lastValue: 1 }) },
  };
  const prisma: any = {
    experienceSelectionRuleSet: {
      upsert: jest.fn().mockResolvedValue(current),
      update: jest.fn().mockImplementation(({ data }: any) => Promise.resolve({ ...current, ...data })),
    },
    $transaction: jest.fn((callback: any) => callback(tx)),
    publicIdentifier: { findUnique: jest.fn().mockResolvedValue(null), findMany: jest.fn().mockResolvedValue([]), upsert: jest.fn() },
  };
  const audit: any = { write: jest.fn().mockResolvedValue(undefined) };
  return { service: new ExperienceMatchingService(prisma, audit), prisma, audit, tx, setPendingForApproval: () => { pendingForApproval = true; } };
}

describe('ExperienceMatchingService selection-rule governance', () => {
  it('prevents a normal admin from changing live rules without approval submission', async () => {
    const f = make();
    await expect(f.service.updateSelectionRules(admin, { scope: 'VOYA_AGENT', priceWeight: 50 })).rejects.toThrow('must submit');
    expect(f.prisma.$transaction).not.toHaveBeenCalled();
  });

  it('stores a normal admin proposal separately while leaving the live rules active', async () => {
    const f = make();
    const result = await f.service.updateSelectionRules(admin, { scope: 'VOYA_AGENT', priceWeight: 50, contractWeight: 0, submitForApproval: true });
    expect(result.status).toBe('PENDING_APPROVAL');
    expect(result.liveStatus).toBe('LIVE');
    expect(f.tx.$queryRaw).toHaveBeenCalledTimes(1);
    expect(f.tx.experienceSelectionRuleSet.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ pendingConfiguration: expect.objectContaining({ priceWeight: 50, contractWeight: 0 }), pendingUpdatedById: 'admin-1' }) }));
    expect(f.tx.experienceSelectionRuleSet.update.mock.calls[0][0].data.status).toBeUndefined();
    expect(f.audit.write).toHaveBeenCalledWith(f.tx, expect.objectContaining({ action: 'EXPERIENCE_SELECTION_RULES_SUBMITTED' }));
    expect(f.tx.publicIdentifier.upsert).toHaveBeenCalledWith(expect.objectContaining({ create: expect.objectContaining({ entityType: 'SELECTION_RULE_SET', publicCode: 'SRS-01' }) }));
  });

  it('checks pending proposals under the same lock and keeps their first maker intact', async () => {
    const f = make();
    f.setPendingForApproval();
    await expect(f.service.updateSelectionRules(admin, { scope: 'VOYA_AGENT', priceWeight: 30, submitForApproval: true })).rejects.toThrow('already awaiting approval');
    expect(f.tx.$queryRaw).toHaveBeenCalledTimes(1);
    expect(f.tx.experienceSelectionRuleSet.update).not.toHaveBeenCalled();
    expect(f.audit.write).not.toHaveBeenCalled();
  });

  it('allows a different Admin or Super Admin to publish a proposal', async () => {
    const f = make();
    f.setPendingForApproval();
    await expect(f.service.approveSelectionRules({ sub: 'vendor-1', role: 'VENDOR' } as any, 'VOYA_AGENT')).rejects.toThrow('Only an Admin');
    await expect(f.service.approveSelectionRules(admin, 'VOYA_AGENT')).rejects.toThrow('different Admin');
    const result = await f.service.approveSelectionRules({ ...admin, sub: 'admin-2' }, 'VOYA_AGENT');
    expect(result.status).toBe('LIVE');
    expect(f.prisma.$transaction).toHaveBeenCalled();
    expect(f.audit.write).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      action: 'EXPERIENCE_SELECTION_RULES_APPROVED',
      beforeState: expect.objectContaining({ pendingConfiguration: expect.objectContaining({ priceWeight: 50 }) }),
      afterState: expect.objectContaining({ liveConfiguration: expect.objectContaining({ priceWeight: 50 }) }),
    }));
  });

  it('also allows a different Super Admin to publish an Admin proposal', async () => {
    const f = make();
    f.setPendingForApproval();
    const result = await f.service.approveSelectionRules(superAdmin, 'VOYA_AGENT');
    expect(result.status).toBe('LIVE');
  });
});

describe('ExperienceMatchingService offer unlink integrity', () => {
  function makeUnlink(linkedMasterId: string | null, count: number) {
    const tx: any = {
      $executeRawUnsafe: jest.fn().mockResolvedValue(0),
      $queryRawUnsafe: jest.fn().mockResolvedValue([{ id: 'master-1' }]),
      product: {
        findUnique: jest.fn().mockResolvedValue({ experienceMasterId: linkedMasterId }),
        count: jest.fn().mockResolvedValue(count),
        update: jest.fn().mockResolvedValue({ id: 'product-1' }),
      },
      experienceOfferPlacement: { deleteMany: jest.fn().mockResolvedValue({ count: 1 }) },
      experienceMasterOptionPlacement: { deleteMany: jest.fn().mockResolvedValue({ count: 0 }) },
      experienceMasterOption: { updateMany: jest.fn().mockResolvedValue({ count: 0 }) },
    };
    const prisma: any = {
      $transaction: jest.fn((callback: any) => callback(tx)),
      experienceMaster: {
        findUnique: jest.fn().mockResolvedValue({ id: 'master-1', products: [], placements: [] }),
      },
      publicIdentifier: { findMany: jest.fn().mockResolvedValue([]), findUnique: jest.fn().mockResolvedValue(null) },
    };
    const audit: any = { write: jest.fn().mockResolvedValue(undefined) };
    return { service: new ExperienceMatchingService(prisma, audit), tx, prisma, audit };
  }

  it('unlinks only a product owned by that master and performs the change under a master lock', async () => {
    const f = makeUnlink('master-1', 2);
    await f.service.unlink(admin, 'master-1', 'product-1');
    expect(f.tx.$queryRawUnsafe).toHaveBeenCalledWith(
      'SELECT "id" FROM "public"."ExperienceMaster" WHERE "id" = $1 FOR UPDATE',
      'master-1',
    );
    expect(f.tx.product.update).toHaveBeenCalledWith({
      where: { id: 'product-1' }, data: { experienceMasterId: null },
    });
    expect(f.audit.write).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ action: 'EXPERIENCE_PRODUCT_UNLINKED' }));
  });

  it('rejects unlinking a product that belongs to a different master', async () => {
    const f = makeUnlink('master-2', 2);
    await expect(f.service.unlink(admin, 'master-1', 'product-1')).rejects.toThrow('not linked to this experience master');
    expect(f.tx.product.update).not.toHaveBeenCalled();
    expect(f.tx.experienceOfferPlacement.deleteMany).not.toHaveBeenCalled();
  });

  it('keeps the final offer attached to a master', async () => {
    const f = makeUnlink('master-1', 1);
    await expect(f.service.unlink(admin, 'master-1', 'product-1')).rejects.toThrow('must keep at least one product');
    expect(f.tx.product.update).not.toHaveBeenCalled();
    expect(f.tx.experienceOfferPlacement.deleteMany).not.toHaveBeenCalled();
  });
});

describe('ExperienceMatchingService supplier pins', () => {
  function makePin() {
    const tx: any = {
      $queryRawUnsafe: jest.fn().mockResolvedValue([{ id: 'master-1' }]),
      experienceMaster: { findUnique: jest.fn().mockResolvedValue({ id: 'master-1' }) },
      product: { findFirst: jest.fn().mockResolvedValue({ id: 'product-1' }) },
      experienceOfferPlacement: {
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        upsert: jest.fn().mockImplementation(({ create, update }: any) => Promise.resolve({ ...create, ...update, productId: 'product-1' })),
      },
    };
    const prisma: any = { $transaction: jest.fn((callback: any) => callback(tx)), experienceMasterOption: { findUnique: jest.fn().mockResolvedValue(null) } };
    const audit: any = { write: jest.fn().mockResolvedValue(undefined) };
    return { service: new ExperienceMatchingService(prisma, audit), prisma, tx, audit };
  }

  it('persists one Admin supplier pin under a master lock and audits it', async () => {
    const f = makePin();
    const result = await f.service.pinProduct(admin, 'master-1', { productId: 'product-1', pinned: true, reason: 'preferred partner' } as any);
    expect(f.tx.$queryRawUnsafe).toHaveBeenCalledWith('SELECT "id" FROM "public"."ExperienceMaster" WHERE "id" = $1 FOR UPDATE', 'master-1');
    expect(f.tx.experienceOfferPlacement.updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: { experienceMasterId: 'master-1', productId: { not: 'product-1' } } }));
    expect(f.tx.experienceOfferPlacement.upsert).toHaveBeenCalledWith(expect.objectContaining({ where: { experienceMasterId_productId: { experienceMasterId: 'master-1', productId: 'product-1' } } }));
    expect(result).toMatchObject({ pinned: true, productId: 'product-1', reason: 'preferred partner' });
    expect(f.audit.write).toHaveBeenCalledWith(f.prisma, expect.objectContaining({ action: 'EXPERIENCE_PRODUCT_PINNED' }));
  });

  it('rejects pinning a product that is not linked to the master', async () => {
    const f = makePin();
    f.tx.product.findFirst.mockResolvedValue(null);
    await expect(f.service.pinProduct(admin, 'master-1', { productId: 'other', pinned: true } as any)).rejects.toThrow('not linked');
    expect(f.tx.experienceOfferPlacement.upsert).not.toHaveBeenCalled();
  });
});

describe('ExperienceMatchingService master-option mappings', () => {
  it('remaps a linked supplier option under the master lock and audits the change', async () => {
    const source = { id: 'option-1', experienceMasterId: 'master-1' };
    const target = { id: 'option-2', experienceMasterId: 'master-1' };
    const tx: any = {
      $queryRawUnsafe: jest.fn().mockResolvedValue([{ id: 'master-1' }]),
      experienceMasterOptionPlacement: {
        findUnique: jest.fn().mockResolvedValue({ masterOptionId: 'option-1', productVariant: { id: 'variant-1', productId: 'product-1' } }),
        update: jest.fn().mockResolvedValue({ masterOptionId: 'option-2', productVariantId: 'variant-1' }),
      },
      product: { findFirst: jest.fn().mockResolvedValue({ id: 'product-1' }) },
      experienceMasterOption: { updateMany: jest.fn().mockResolvedValue({ count: 0 }), update: jest.fn().mockResolvedValue(target) },
    };
    const prisma: any = {
      publicIdentifier: { findUnique: jest.fn().mockImplementation(({ where }: any) => Promise.resolve(where.publicCode === 'MO-0042-01' ? { entityType: 'MASTER_OPTION', entityId: 'option-1' } : null)) },
      experienceMasterOption: { findUnique: jest.fn().mockImplementation(({ where }: any) => Promise.resolve(where.id === 'option-1' ? source : target)) },
      $transaction: jest.fn((callback: any) => callback(tx)),
    };
    const audit: any = { write: jest.fn().mockResolvedValue(undefined) };
    const service = new ExperienceMatchingService(prisma, audit);

    const result = await service.mapMasterOption(admin, 'MO-0042-01', {
      productVariantId: 'variant-1', targetMasterOptionId: 'option-2',
    } as any);

    expect(tx.$queryRawUnsafe).toHaveBeenCalledWith('SELECT "id" FROM "public"."ExperienceMaster" WHERE "id" = $1 FOR UPDATE', 'master-1');
    expect(tx.experienceMasterOptionPlacement.update).toHaveBeenCalledWith({ where: { productVariantId: 'variant-1' }, data: { masterOptionId: 'option-2', pinnedUntil: null, pinnedById: null, pinReason: null } });
    expect(result).toMatchObject({ masterOptionId: 'option-2', sourceMasterOptionId: 'option-1', targetMasterOptionId: 'option-2' });
    expect(audit.write).toHaveBeenCalledWith(tx, expect.objectContaining({ action: 'EXPERIENCE_MASTER_OPTION_MAPPED', entityId: 'option-2' }));
  });

  it('refuses mapping across different master products', async () => {
    const prisma: any = {
      publicIdentifier: { findUnique: jest.fn().mockResolvedValue(null) },
      experienceMasterOption: { findUnique: jest.fn().mockImplementation(({ where }: any) => Promise.resolve({ id: where.id, experienceMasterId: where.id === 'option-1' ? 'master-1' : 'master-2' })) },
      $transaction: jest.fn(),
    };
    const service = new ExperienceMatchingService(prisma, { write: jest.fn() } as any);
    await expect(service.mapMasterOption(admin, 'option-1', { productVariantId: 'variant-1', targetMasterOptionId: 'option-2' } as any)).rejects.toThrow('not found in this experience');
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});

describe('ExperienceMatchingService selection preview', () => {
  it('uses live eligibility, the configured objective, and only measurable scoring inputs', async () => {
    const offer = (id: string, price: number, margin: number) => ({
      id: `plan-${id}`, name: `Offer ${id}`, ratePlanCode: `RP-${id}`, basePrice: price, currency: 'INR',
      channelMappings: ['VOYA_WEB', 'VOYA_AGENT'].map((code) => ({ enabled: true, status: 'ACTIVE', inventoryRule: { capacityBuffer: 0, maxPublishedCapacity: null }, channel: { code, active: true } })),
      commercialVersions: [{ currency: 'INR', supplierCommissionPercent: margin, travellerPrices: [{ travellerType: 'ADULT', amount: price }] }],
      scheduleMappings: [{ active: true, scheduleTemplate: { status: 'ACTIVE', effectiveFrom: new Date('2026-01-01'), effectiveTo: null, capacityUnitReviewRequired: false, sessions: [{ id: `session-${id}`, status: 'OPEN', inventoryState: { totalCapacity: 10, blockedCapacity: 0, heldCapacity: 0, confirmedCapacity: 0 } }] } }],
    });
    const product = (id: string, plan: any, verificationStatus = 'VERIFIED') => ({
      id: `product-${id}`, productCode: `P-${id}`, status: 'LIVE', currentRevision: { status: 'PUBLISHED', starRating: 5, voucherCodeSource: id === 'a' ? 'SUPPLIER_API' : 'SUPPLIER_BARCODE_POOL' },
      tenant: { id: `vendor-${id}`, name: `Vendor ${id}`, vendorProfile: { verificationStatus, legalBusinessName: null } },
      variants: [{ id: `variant-${id}`, name: 'Shared', status: 'ACTIVE', archivedAt: null, ratePlans: [plan] }],
    });
    const prisma: any = {
      experienceMaster: { findUnique: jest.fn().mockResolvedValue({ id: 'master-1', canonicalName: 'Test experience', selectionPolicy: 'CHEAPEST', placements: [], products: [product('a', offer('a', 100, 5)), product('b', offer('b', 130, 20)), product('c', offer('c', 1, 100), 'PENDING')] }) },
      experienceSelectionRuleSet: { findFirst: jest.fn().mockResolvedValue({ scope: 'VOYA_WEB', status: 'LIVE', objective: 'MARGIN', priceWeight: 100, ratingWeight: 0, reliabilityWeight: 0, inventoryWeight: 0, contractWeight: 0 }) },
      tenant: { findUnique: jest.fn().mockResolvedValue({ kind: 'TRAVEL_AGENT', agentProfile: { verificationStatus: 'APPROVED' } }) },
      supplierQualitySnapshot: { findFirst: jest.fn().mockImplementation(({ where }: any) => Promise.resolve({ vendorTenantId: where.vendorTenantId, metricSnapshots: where.vendorTenantId === 'vendor-a' ? [
        { metricCode: 'CUSTOMER_RATING', rawValue: 4.8, sampleSize: 50, status: 'PASS' },
        { metricCode: 'CONFIRMATION_WITHIN_SLA_RATE', rawValue: 95, sampleSize: 30, status: 'PASS' },
        { metricCode: 'VENDOR_CANCELLATION_RATE', rawValue: 4, sampleSize: 50, status: 'PASS' },
        { metricCode: 'VOUCHER_READY_BEFORE_SERVICE_RATE', rawValue: 91, sampleSize: 45, status: 'WARN' },
      ] : [] })) },
      publicIdentifier: { findMany: jest.fn().mockResolvedValue([]), findUnique: jest.fn().mockResolvedValue(null) },
    };
    const service = new ExperienceMatchingService(prisma, { write: jest.fn() } as any, {
      evaluateInternal: jest.fn(async ({ ratePlanId, agentTenantId }: any) => ({
        ready: true,
        finalAmount: ratePlanId === 'plan-a' ? '100.00' : '130.00',
        currency: 'INR',
        voya: { revenue: ratePlanId === 'plan-a' ? '10.00' : '15.00' },
        agent: { commission: agentTenantId ? '7.00' : '0.00' },
        promotionFundingBreakdown: { VOYA: '0.00' },
      })),
    } as any);
    const preview = await service.preview('master-1', { serviceDate: '2026-11-01', channel: 'WEB' } as any);
    expect(preview.winnerProductId).toBe('product-b');
    expect(preview.offers.filter((row: any) => row.productId !== 'product-c').every((row: any) => row.eligible)).toBe(true);
    expect(preview.offers.find((row: any) => row.productId === 'product-c')).toMatchObject({ eligible: false, selected: false });
    expect(preview.offers.filter((row: any) => row.eligible).every((row: any) => row.marginFloorStatus === 'PASS')).toBe(true);
    expect(preview.provisional).toBe(false);
    expect(preview.offers.find((row: any) => row.vendorId === 'vendor-a')).toMatchObject({ rating: 4.8, ratingAvailable: true, reliability: 94, reliabilityAvailable: true, connectionType: 'SUPPLIER_API' });
    const unscopedAgentPreview = await service.preview('master-1', { serviceDate: '2026-11-01', channel: 'AGENT' } as any);
    expect(unscopedAgentPreview.provisional).toBe(true);
    expect(unscopedAgentPreview.offers.find((row: any) => row.productId === 'product-b')).toMatchObject({ provisionalEligible: true, eligible: false });
    const agentScopedPreview = await service.preview('master-1', { serviceDate: '2026-11-01', channel: 'AGENT', agentTenantId: '00000000-0000-4000-8000-000000000001' } as any);
    expect(agentScopedPreview.provisional).toBe(false);
    expect(agentScopedPreview.offers.find((row: any) => row.productId === 'product-a')).toMatchObject({ marginFloorStatus: 'FAIL', eligible: false });
    expect(agentScopedPreview.offers.find((row: any) => row.productId === 'product-b')).toMatchObject({ marginFloorStatus: 'PASS', eligible: true });
  });
});
