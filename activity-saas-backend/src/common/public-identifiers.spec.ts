import {
  allocatePublicCode,
  ensurePublicIdentifier,
  isoWeekInfo,
  vendorPayoutPublicCode,
} from './public-identifiers';

describe('public identifier integrity', () => {
  it('never overwrites an identifier that has already been issued', async () => {
    const upsert = jest.fn().mockResolvedValue({ publicCode: 'SUP-0001' });
    await ensurePublicIdentifier({ publicIdentifier: { findUnique: jest.fn(), findMany: jest.fn(), upsert } }, 'VENDOR', 'vendor-1', 'SUP-0099');
    expect(upsert).toHaveBeenCalledWith(expect.objectContaining({
      where: { entityType_entityId: { entityType: 'VENDOR', entityId: 'vendor-1' } },
      update: {},
    }));
  });

  it('uses an atomic per-prefix sequence initialized after existing codes', async () => {
    const findMany = jest.fn().mockResolvedValue([{ publicCode: 'APR-0009' }, { publicCode: 'APR-0012' }]);
    const upsert = jest.fn().mockResolvedValue({ lastValue: 13 });
    const result = await allocatePublicCode({
      publicIdentifier: { findUnique: jest.fn(), findMany, upsert: jest.fn() },
      publicIdentifierSequence: { upsert },
    }, 'APPROVAL', 'APR-', 6);
    expect(result).toBe('APR-000013');
    expect(upsert).toHaveBeenCalledWith({
      where: { entityType_prefix: { entityType: 'APPROVAL', prefix: 'APR-' } },
      create: { entityType: 'APPROVAL', prefix: 'APR-', lastValue: 13 },
      update: { lastValue: { increment: 1 } },
      select: { lastValue: true },
    });
  });
});

describe('ISO week identifiers', () => {
  it('uses ISO week-year around New Year boundaries', () => {
    expect(isoWeekInfo(new Date('2021-01-01T12:00:00.000Z'))).toMatchObject({ year: 2020, week: 53 });
    expect(isoWeekInfo(new Date('2024-12-30T12:00:00.000Z'))).toMatchObject({ year: 2025, week: 1 });
    expect(isoWeekInfo(new Date('2026-11-02T12:00:00.000Z'))).toMatchObject({ year: 2026, week: 45 });
  });

  it('returns half-open UTC week boundaries for safe weekly uniqueness checks', () => {
    const { start, end } = isoWeekInfo(new Date('2026-11-08T23:59:59.999Z'));
    expect(start.toISOString()).toBe('2026-11-02T00:00:00.000Z');
    expect(end.toISOString()).toBe('2026-11-09T00:00:00.000Z');
  });

  it('formats payout IDs as vendor number plus ISO year and week', () => {
    expect(vendorPayoutPublicCode('SUP-0207', new Date('2026-11-02T12:00:00.000Z'))).toBe('PO-0207-2645');
    expect(vendorPayoutPublicCode('SUP-0207', new Date('2021-01-01T12:00:00.000Z'))).toBe('PO-0207-2053');
    expect(vendorPayoutPublicCode('tenant-id', new Date('2026-11-02T12:00:00.000Z'))).toBeNull();
  });
});
