import { selectEffectiveVersion } from './commercial-resolution';

describe('effective-dated commercial version resolution', () => {
  const v1 = { id: 'v1', effectiveFrom: new Date('2026-09-01'), effectiveTo: new Date('2026-10-01') };
  const v2 = { id: 'v2', effectiveFrom: new Date('2026-10-01'), effectiveTo: null };
  it('selects v1 on 15 September and v2 on 15 October', () => { expect(selectEffectiveVersion([v1, v2], new Date('2026-09-15'))?.id).toBe('v1'); expect(selectEffectiveVersion([v1, v2], new Date('2026-10-15'))?.id).toBe('v2'); });
  it('does not retire a non-overlapping future version during resolution', () => expect(selectEffectiveVersion([v1, v2], new Date('2026-10-15'))?.id).toBe('v2'));
  it('rejects overlapping active versions instead of choosing findFirst', () => expect(() => selectEffectiveVersion([v1, { ...v2, effectiveFrom: new Date('2026-09-20') }], new Date('2026-09-25'))).toThrow('More than one active commercial version'));
});
