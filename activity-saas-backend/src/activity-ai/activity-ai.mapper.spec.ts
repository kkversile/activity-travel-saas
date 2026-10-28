import { prepareImport, sanitizeDraft, validateDraft } from './activity-ai.mapper';

describe('activity AI mapper', () => {
  it('keeps AI drafts free of commercial and operational sections', () => {
    const draft = sanitizeDraft({ Basic_Info: [{ product_name: 'Walk', city: 'Munnar', state: 'Kerala', country: 'India' }], Experience: [{ full_description: 'Confirmed description' }], Options: [{ option_code: 'STD', option_name: 'Standard' }], Rate_Plans: [{ rate_plan_code: 'SHOULD-NOT-SURVIVE' }], Availability: [{ schedule_code: 'SHOULD-NOT-SURVIVE' }] });
    expect(draft.Rate_Plans).toEqual([]); expect(draft.Availability).toEqual([]); expect(validateDraft(draft).valid).toBe(true);
  });
  it('keeps only safe HTTPS image suggestions and marks them for review', () => {
    const draft = sanitizeDraft({
      Basic_Info: [{ product_name: 'Walk', city: 'Munnar', state: 'Kerala', country: 'India' }],
      Experience: [{ full_description: 'Confirmed description' }],
      Options: [{ option_code: 'STD', option_name: 'Standard' }],
      Media: [
        { url: 'https://images.example.com/walk.jpg', source_url: 'https://example.com/gallery', description: 'Trail view' },
        { url: 'http://images.example.com/unsafe.jpg', source_url: 'https://example.com/gallery' },
        { url: 'javascript:alert(1)', source_url: 'https://example.com/gallery' },
        { url: 'https://images.example.com/walk.jpg', source_url: 'https://example.com/duplicate' },
      ],
    });
    expect(draft.Media).toEqual([{ kind: 'IMAGE', url: 'https://images.example.com/walk.jpg', source_url: 'https://example.com/gallery', description: 'Trail view', requires_review: true }]);
  });
  it('extracts a literal Google Maps photo asset embedded in a researched source URL', () => {
    const mapsPhotoUrl = 'https://www.google.com/maps/place/Water+Sports+and+Activities+by+Gokarna+Ocean+Adventures/data=!6shttps:%2F%2Flh3.googleusercontent.com%2Fgrass-cs%2FAAB123%3Dw86-h152-k-no!7i287!8i510';
    const draft = sanitizeDraft({
      Basic_Info: [{ product_name: 'Water Sports and Activities by Gokarna Ocean Adventures', city: 'Gokarna', state: 'Karnataka', country: 'India' }],
      Experience: [{ full_description: 'Water activities.', additional_information: [mapsPhotoUrl] }],
      Options: [{ option_code: 'STANDARD', option_name: 'Standard experience' }],
      Media: [],
    });
    expect(draft.Media).toEqual([{ kind: 'IMAGE', url: 'https://lh3.googleusercontent.com/grass-cs/AAB123=w86-h152-k-no', source_url: mapsPhotoUrl, description: 'Google Maps photo suggestion', requires_review: true }]);
  });
  it('returns import-ready when supplier supplies valid rates and availability', () => {
    const result = prepareImport({ Basic_Info: [{ product_key: 'WALK-1', product_name: 'Walk', type: 'ACTIVITY', sub_type: 'GUIDED_TOUR', sub_category: 'Nature', city: 'Munnar', state: 'Kerala', country: 'India', meeting_model: 'FIXED_MEETING_POINT', short_description: 'A guided walk.' }], Experience: [{ full_description: 'Confirmed description' }], Options: [{ product_key: 'WALK-1', option_code: 'STD', option_name: 'Standard' }] }, { Rate_Plans: [{ product_key: 'WALK-1', option_code: 'STD', rate_plan_code: 'RP-STD', rate_plan_name: 'Standard', valid_from: '2026-10-28', valid_to: '2027-10-28', adult_price: '1200', pricing_unit: 'PER_PERSON' }], Availability: [{ product_key: 'WALK-1', option_code: 'STD', schedule_code: 'SCH-STD', effective_from: '2026-10-28', effective_to: '2027-10-28', operating_days: ['MON'], default_capacity: 50, operating_model: 'MULTIPLE_SLOTS', start_time: '09:00', end_time: '17:00' }] });
    expect(result.ready).toBe(true); expect(result.errors).toEqual([]); expect(result.payload.Rate_Plans).toHaveLength(1); expect(result.payload.Availability).toHaveLength(1);
  });
  it('blocks import when pricing or timed availability is incomplete', () => {
    const result = prepareImport({ Basic_Info: [{ product_key: 'WALK-2', product_name: 'Walk', type: 'ACTIVITY', sub_type: 'GUIDED_TOUR', sub_category: 'Nature', city: 'Munnar', state: 'Kerala', country: 'India', meeting_model: 'FIXED_MEETING_POINT', short_description: 'A guided walk.' }], Experience: [{ full_description: 'Confirmed description' }], Options: [{ product_key: 'WALK-2', option_code: 'STD', option_name: 'Standard' }] }, { Rate_Plans: [{ product_key: 'WALK-2', option_code: 'STD', rate_plan_code: 'RP-STD', rate_plan_name: 'Standard', valid_from: '2026-10-28', valid_to: '2027-10-28', pricing_unit: 'PER_PERSON', adult_price: '' }], Availability: [{ product_key: 'WALK-2', option_code: 'STD', schedule_code: 'SCH-STD', effective_from: '2026-10-28', effective_to: '2027-10-28', operating_days: ['MON'], default_capacity: '', operating_model: 'MULTIPLE_SLOTS' }] });
    expect(result.ready).toBe(false);
    expect(result.errors).toEqual(expect.arrayContaining([
      'Rate_Plans row 1: adult_price is required.',
      'Availability row 1: default_capacity is required.',
      'Availability row 1: start_time and end_time are required for timed schedules.',
    ]));
  });
});
