import { normalizeTaxonomy, validateImportContract } from './activity-ai.schema';

describe('AI activity taxonomy and import contract', () => {
  it('maps supplier-facing category text to the canonical wizard taxonomy', () => {
    expect(normalizeTaxonomy('ACTIVITY', 'Adventure park', 'Adventure park')).toEqual({ type: 'ACTIVITY', subType: 'ATTRACTION' });
    expect(normalizeTaxonomy('ACTIVITY', 'Nature walk', 'Guided tour')).toEqual({ type: 'ACTIVITY', subType: 'GUIDED_TOUR' });
  });

  it('rejects an unsupported subtype instead of creating a non-canonical product', () => {
    const errors = validateImportContract({
      Basic_Info: [{ product_key: 'P1', product_name: 'Walk', type: 'ACTIVITY', sub_type: 'Adventure park', sub_category: 'Nature', city: 'Munnar', state: 'Kerala', country: 'India', meeting_model: 'FIXED_MEETING_POINT', short_description: 'Walk' }],
      Experience: [{ product_key: 'P1', full_description: 'Description' }],
      Options: [{ product_key: 'P1', option_code: 'STD', option_name: 'Standard' }],
      Rate_Plans: [{ product_key: 'P1', option_code: 'STD', rate_plan_code: 'RP1', rate_plan_name: 'Standard', valid_from: '2026-10-28', valid_to: '2027-10-28', pricing_unit: 'PER_PERSON', adult_price: 1200 }],
      Availability: [{ product_key: 'P1', option_code: 'STD', schedule_code: 'S1', effective_from: '2026-10-28', effective_to: '2027-10-28', operating_days: ['MON'], default_capacity: 10, operating_model: 'ALL_DAY' }],
    });
    expect(errors.some((error) => error.includes('unsupported sub_type'))).toBe(true);
  });
});
