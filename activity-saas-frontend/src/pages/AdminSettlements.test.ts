import { describe, expect, it } from 'vitest';
import { sumCompleteBookingComponents, sumLineComponent } from './AdminSettlements';

describe('settlement line component mapping', () => {
  it('reads supplier commission from persisted line components', () => {
    expect(sumLineComponent([
      { components: { supplierCommission: '12.50' } },
      { components: { supplierCommission: '5.25' } },
    ], 'supplierCommission')).toBe(17.75);
  });

  it('keeps unavailable deductions blank instead of displaying a false zero', () => {
    expect(sumLineComponent([
      { components: { supplierCommission: '12.50' } },
    ], 'tdsAmount')).toBeNull();
  });

  it('sums explicit tax and commission components only when every booking line has them', () => {
    const lines = [
      { lineType: 'BOOKING', components: { supplierCommission: '100', gstOnCommissionAmount: '18', tds194OAmount: '10', gstTcsAmount: '2' } },
      { lineType: 'BOOKING', components: { supplierCommission: '50', gstOnCommissionAmount: '9', tds194OAmount: '5', gstTcsAmount: '1' } },
      { lineType: 'ADJUSTMENT', components: {} },
    ];
    expect(sumCompleteBookingComponents(lines, ['supplierCommission', 'gstOnCommissionAmount'])).toBe(177);
    expect(sumCompleteBookingComponents(lines, ['tds194OAmount', 'gstTcsAmount'])).toBe(18);
    expect(sumCompleteBookingComponents([{ lineType: 'BOOKING', components: { supplierCommission: '100' } }], ['supplierCommission', 'gstOnCommissionAmount'])).toBeNull();
  });
});
