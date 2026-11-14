import { ProductRevisionStatus, ProductStatus, ProductType, ScheduleStatus, UserRole } from '@prisma/client';
import { CatalogueService } from './catalogue.service';

const vendor = { sub: 'u1', email: 'vendor@test', role: UserRole.VENDOR, tenantId: 't1' } as any;
const timestamp = new Date('2026-11-01T00:00:00Z');
const stopContent = [
  { sequence: 2, stopName: 'Tea museum', stopType: 'ATTRACTION', stayDurationMinutes: 45, travelTimeToNextMinutes: 0, ticketPolicy: 'Included', replacementStop: 'Tea garden' },
  { sequence: 7, stopName: 'Viewpoint', stopType: 'FREE_TIME', stayDurationMinutes: null, travelTimeToNextMinutes: null, ticketPolicy: null, replacementStop: null },
];

function sourceRevision(id = 'published-r1', status: ProductRevisionStatus = ProductRevisionStatus.PUBLISHED) {
  return Object.freeze({
    id, productId: 'p1', versionNumber: 1, status, createdById: 'original-author',
    productName: 'Tea tour', type: ProductType.ACTIVITY, subType: 'TOUR', description: 'Published description',
    cityName: 'Munnar', stateName: 'Kerala', countryName: 'India', faqs: [], rank: 4,
    sourcePayload: { prototype: { followItinerary: true } },
    itineraryStops: Object.freeze(stopContent.map((stop, index) => Object.freeze({
      ...stop, id: `original-stop-${index}`, productRevisionId: id, createdAt: timestamp, updatedAt: timestamp,
    }))),
    media: [], variants: [],
  });
}

function setup(source: any = sourceRevision()) {
  const tx = {
    $queryRaw: jest.fn(),
    productRevision: {
      findFirst: jest.fn().mockResolvedValueOnce(null).mockResolvedValueOnce(source).mockResolvedValueOnce(source),
      aggregate: jest.fn().mockResolvedValue({ _max: { versionNumber: 1 } }),
      create: jest.fn().mockResolvedValue({ id: 'draft-r2', productId: 'p1', versionNumber: 2, status: ProductRevisionStatus.DRAFT }),
      update: jest.fn(), updateMany: jest.fn(),
    },
    product: { update: jest.fn() },
    itineraryStop: { createMany: jest.fn(), deleteMany: jest.fn(), update: jest.fn() },
    productVariant: { create: jest.fn().mockResolvedValue({ id: 'draft-variant' }) },
    ratePlan: { create: jest.fn().mockResolvedValue({ id: 'draft-plan' }) },
    scheduleTemplate: { create: jest.fn().mockResolvedValue({ id: 'draft-schedule' }) },
    ratePlanSchedule: { create: jest.fn() },
    serviceSession: { create: jest.fn(), createMany: jest.fn() },
    inventoryState: { create: jest.fn(), createMany: jest.fn() },
  };
  const prisma = {
    product: { findFirst: jest.fn().mockResolvedValue({ id: 'p1', tenantId: 't1', status: ProductStatus.LIVE, currentRevisionId: 'published-r1' }) },
    $transaction: jest.fn(async (callback: any) => callback(tx)),
  };
  const audit = { write: jest.fn() };
  const service = new CatalogueService(prisma as any, audit as any, { enqueue: jest.fn() } as any, {} as any);
  return { service, prisma, tx, audit };
}

describe('catalogue working revision content cloning', () => {
  it('copies all itinerary content to new rows without changing source IDs, sequence, or the live revision', async () => {
    const source = sourceRevision();
    const snapshot = JSON.stringify(source);
    const s = setup(source);

    await expect(s.service.createRevision(vendor, 'p1')).resolves.toMatchObject({ id: 'draft-r2', status: ProductRevisionStatus.DRAFT });

    // Cover loading the relation as well as copying it: a mock-only relation must not hide a missing include.
    for (const call of s.tx.productRevision.findFirst.mock.calls.slice(1)) {
      expect(call[0]).toMatchObject({ include: { itineraryStops: { orderBy: { sequence: 'asc' } } } });
    }
    expect(s.tx.itineraryStop.createMany).toHaveBeenCalledTimes(1);
    expect(s.tx.itineraryStop.createMany).toHaveBeenCalledWith({
      data: stopContent.map((stop) => ({ ...stop, productRevisionId: 'draft-r2' })),
    });
    const revisionData = s.tx.productRevision.create.mock.calls[0][0].data;
    expect(revisionData).toMatchObject({ productId: 'p1', versionNumber: 2, rank: 4, status: ProductRevisionStatus.DRAFT, sourcePayload: source.sourcePayload });
    expect(revisionData).not.toHaveProperty('itineraryStops');
    expect(s.tx.itineraryStop.deleteMany).not.toHaveBeenCalled();
    expect(s.tx.itineraryStop.update).not.toHaveBeenCalled();
    expect(s.tx.productRevision.update).not.toHaveBeenCalled();
    expect(s.tx.productRevision.updateMany).not.toHaveBeenCalled();
    expect(s.tx.product.update).not.toHaveBeenCalled();
    expect(JSON.stringify(source)).toBe(snapshot);
    expect(s.audit.write).toHaveBeenCalledWith(s.tx, expect.objectContaining({
      afterState: { productId: 'p1', sourceRevisionId: source.id, newRevisionId: 'draft-r2', versionNumber: 2 },
    }));
  });

  it.each([ProductRevisionStatus.REJECTED, ProductRevisionStatus.SUPERSEDED])('copies stops from an explicitly selected %s revision', async (status) => {
    const selected = sourceRevision('selected-history', status);
    const s = setup();
    s.tx.productRevision.findFirst.mockResolvedValueOnce(selected);

    await s.service.createRevision(vendor, 'p1', { sourceRevisionId: selected.id });

    expect(s.tx.productRevision.findFirst).toHaveBeenLastCalledWith(expect.objectContaining({
      where: expect.objectContaining({ id: selected.id, productId: 'p1' }),
      include: expect.objectContaining({ itineraryStops: { orderBy: { sequence: 'asc' } } }),
    }));
    expect(s.tx.itineraryStop.createMany).toHaveBeenCalledWith({ data: stopContent.map((stop) => ({ ...stop, productRevisionId: 'draft-r2' })) });
    expect(s.audit.write).toHaveBeenCalledWith(s.tx, expect.objectContaining({ afterState: expect.objectContaining({ sourceRevisionId: selected.id }) }));
  });

  it('does not insert stops when the source itinerary is empty', async () => {
    const s = setup({ ...sourceRevision(), itineraryStops: [] });

    await s.service.createRevision(vendor, 'p1');

    expect(s.tx.productRevision.create).toHaveBeenCalledTimes(1);
    expect(s.tx.itineraryStop.createMany).not.toHaveBeenCalled();
  });

  it.each([ProductRevisionStatus.DRAFT, ProductRevisionStatus.UNDER_REVIEW])('returns an existing %s revision without modifying its itinerary', async (status) => {
    const s = setup();
    const working = { id: 'existing-working', status };
    s.tx.productRevision.findFirst.mockReset().mockResolvedValue(working);

    await expect(s.service.createRevision(vendor, 'p1')).resolves.toEqual(working);

    expect(s.tx.productRevision.create).not.toHaveBeenCalled();
    expect(s.tx.itineraryStop.createMany).not.toHaveBeenCalled();
    expect(s.tx.itineraryStop.deleteMany).not.toHaveBeenCalled();
  });

  it('preserves slot metadata and new schedule ownership while leaving schedules inactive and sessions uncreated', async () => {
    const slotContent = [
      { slotCode: 'AFTERNOON', label: 'Tea tour', startTime: '16:00', endTime: '18:00', rank: 5, active: true },
      { slotCode: 'EVENING', label: null, startTime: '19:00', endTime: null, rank: 9, active: false },
    ];
    const scheduleContent = {
      scheduleCode: 'TEA-TOUR', name: 'Afternoon tour', operatingModel: 'MULTIPLE_SLOTS', timezone: 'Asia/Kolkata',
      effectiveFrom: timestamp, effectiveTo: null, operatingDays: ['MON', 'FRI'], capacityUnit: 'PERSON', defaultCapacity: 12,
      capacityUnitReviewRequired: false, version: 1, sourcePayload: { capacityScope: 'SESSION_SHARED' },
    };
    const schedule = Object.freeze({
      ...scheduleContent, id: 'original-schedule', variantId: 'original-variant', status: ScheduleStatus.ACTIVE,
      createdAt: timestamp, updatedAt: timestamp, archivedAt: null,
      slotTemplates: Object.freeze(slotContent.map((slot, index) => Object.freeze({
        ...slot, id: `original-slot-${index}`, scheduleTemplateId: 'original-schedule', createdAt: timestamp, updatedAt: timestamp, archivedAt: null,
      }))),
      ratePlanMappings: [{ ratePlanId: 'original-plan', active: true }],
    });
    const source = {
      ...sourceRevision(), variants: [{
        id: 'original-variant', productId: 'p1', revisionId: 'published-r1', variantCode: 'TEA', name: 'Tea tour',
        ratePlans: [{ id: 'original-plan', variantId: 'original-variant', ratePlanCode: 'ACTIVITY-TEA' }],
        schedules: [schedule],
      }],
    };
    const snapshot = JSON.stringify(source);
    const s = setup(source);

    await s.service.createRevision(vendor, 'p1');

    expect(s.tx.productRevision.findFirst).toHaveBeenNthCalledWith(2, expect.objectContaining({
      include: expect.objectContaining({ variants: expect.objectContaining({ include: expect.objectContaining({
        schedules: { include: { slotTemplates: { where: { archivedAt: null } }, ratePlanMappings: { where: { active: true } } } },
      }) }) }),
    }));
    expect(s.tx.scheduleTemplate.create).toHaveBeenCalledWith({ data: {
      ...scheduleContent, variantId: 'draft-variant', status: ScheduleStatus.INACTIVE,
      slotTemplates: { create: slotContent },
    } });
    expect(s.tx.ratePlanSchedule.create).toHaveBeenCalledWith({ data: { ratePlanId: 'draft-plan', scheduleTemplateId: 'draft-schedule', active: true } });
    expect(s.tx.serviceSession.create).not.toHaveBeenCalled();
    expect(s.tx.serviceSession.createMany).not.toHaveBeenCalled();
    expect(s.tx.inventoryState.create).not.toHaveBeenCalled();
    expect(s.tx.inventoryState.createMany).not.toHaveBeenCalled();
    expect(JSON.stringify(source)).toBe(snapshot);
  });
});
