import { UserRole } from '@prisma/client';
import { ProductReadinessService } from './product-readiness.service';

const vendor = { sub: 'u1', email: 'vendor@test', role: UserRole.VENDOR, tenantId: 't1' } as any;

function fixture() {
  const prisma: any = { product: { findFirst: jest.fn() } };
  const commercial: any = { readiness: jest.fn() };
  return { service: new ProductReadinessService(prisma, commercial), prisma, commercial };
}

describe('ProductReadinessService', () => {
  it('returns actionable reasons for an incomplete draft', async () => {
    const s = fixture();
    s.prisma.product.findFirst.mockResolvedValue({
      id: 'p1',
      tenantId: 't1',
      currentRevisionId: null,
      revisions: [{ id: 'r1', status: 'DRAFT', productName: '', type: null, subType: '', subCategory: '', cityName: '', stateName: '', countryName: '', description: '', media: [], fulfilmentPolicy: null }],
      variants: [],
    });

    const result = await s.service.evaluate(vendor, 'p1');

    expect(result.ready).toBe(false);
    expect(result.reasonCodes).toEqual(expect.arrayContaining(['PRODUCT_NAME_MISSING', 'OPTIONS_MISSING', 'RATE_PLAN_MISSING', 'SCHEDULE_MISSING', 'COVER_IMAGE_MISSING']));
    expect(result.sections.basicInfo.ready).toBe(false);
  });

  it('returns ready only when the canonical hierarchy is commercially and operationally complete', async () => {
    const s = fixture();
    s.commercial.readiness.mockResolvedValue({ ratePlanId: 'rp1', ready: true, reasonCodes: [] });
    s.prisma.product.findFirst.mockResolvedValue({
      id: 'p1',
      tenantId: 't1',
      currentRevisionId: 'r1',
      revisions: [{ id: 'r1', status: 'DRAFT', productName: 'Tea walk', type: 'ACTIVITY', subType: 'EXPERIENCE', subCategory: 'Nature', cityName: 'Munnar', stateName: 'Kerala', countryName: 'India', meetingModel: 'FIXED_MEETING_POINT', meetingPoint: 'Tea Museum gate', description: 'A guided walk.', media: [{ kind: 'IMAGE' }], fulfilmentPolicy: { mode: 'AUTO' } }],
      variants: [{
        id: 'v1',
        status: 'ACTIVE',
        ratePlans: [{ id: 'rp1', status: 'ACTIVE', cancellationRules: [{ id: 'cr1' }] }],
        schedules: [{ status: 'ACTIVE', ratePlanMappings: [{ ratePlanId: 'rp1', active: true }], sessions: [{ status: 'OPEN', inventoryState: { totalCapacity: 10, blockedCapacity: 0, heldCapacity: 0, confirmedCapacity: 0 } }] }],
      }],
    });

    const result = await s.service.evaluate(vendor, 'p1');

    expect(result.ready).toBe(true);
    expect(result.reasonCodes).toEqual([]);
    expect(s.commercial.readiness).toHaveBeenCalledWith(vendor, 'rp1', expect.any(Date), undefined, s.prisma);
  });

  it('does not combine commercial readiness from one plan with cancellation from another', async () => {
    const s = fixture();
    s.commercial.readiness.mockImplementation(async (_user: unknown, id: string) => ({ ratePlanId: id, ready: id === 'rp-commercial', reasonCodes: id === 'rp-commercial' ? [] : ['NO_ACTIVE_COMMERCIAL_VERSION'] }));
    s.prisma.product.findFirst.mockResolvedValue({
      id: 'p1', tenantId: 't1', currentRevisionId: 'r1',
      revisions: [{ id: 'r1', status: 'DRAFT', productName: 'Tea walk', type: 'ACTIVITY', subType: 'EXPERIENCE', subCategory: 'Nature', cityName: 'Munnar', stateName: 'Kerala', countryName: 'India', meetingModel: 'FIXED_MEETING_POINT', meetingPoint: 'Gate', description: 'A guided walk.', media: [{ kind: 'IMAGE' }], fulfilmentPolicy: { mode: 'AUTO' } }],
      variants: [{ id: 'v1', status: 'ACTIVE', ratePlans: [
        { id: 'rp-commercial', status: 'ACTIVE', cancellationRules: [] },
        { id: 'rp-cancellation', status: 'ACTIVE', cancellationRules: [{ id: 'cr1' }] },
      ], schedules: [{ status: 'ACTIVE', ratePlanMappings: [{ ratePlanId: 'rp-commercial', active: true }], sessions: [{ status: 'OPEN', inventoryState: { totalCapacity: 10, blockedCapacity: 0, heldCapacity: 0, confirmedCapacity: 0 } }] }] }],
    });

    const result = await s.service.evaluate(vendor, 'p1');

    expect(result.ready).toBe(false);
    expect(result.reasonCodes).toEqual(expect.arrayContaining(['CANCELLATION_RULES_MISSING']));
  });
});
