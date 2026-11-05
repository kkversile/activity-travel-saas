import { requiredVendorDocumentsForProduct } from './vendor-document-requirements';

describe('requiredVendorDocumentsForProduct', () => {
  it('requires liability insurance for every product and category-specific licences where applicable', () => {
    expect(requiredVendorDocumentsForProduct('Cruises & boats, Water sports', { type: 'ACTIVITY', subType: 'Boat tour' })).toEqual([
      'PUBLIC_LIABILITY_INSURANCE', 'BOAT_LICENSE', 'ADVENTURE_WATER_SPORTS_LICENSE',
    ]);
    expect(requiredVendorDocumentsForProduct('', { type: 'TRANSFER' })).toEqual(['PUBLIC_LIABILITY_INSURANCE', 'VEHICLE_PERMIT']);
    expect(requiredVendorDocumentsForProduct('Day tours', { type: 'MEALS' })).toEqual(['PUBLIC_LIABILITY_INSURANCE', 'TOURISM_REGISTRATION', 'FSSAI_LICENSE']);
  });
});
