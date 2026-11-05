import { describe, expect, it } from 'vitest';
import { emptyRevisionForm, toRevisionForm, vendorProductEditPath } from './types';

const baseRevision = {
  id: 'revision-1', versionNumber: 1, status: 'DRAFT' as const,
  productName: 'Munnar tea walk', type: 'ACTIVITY' as const, subType: 'GUIDED_TOUR',
  description: '', highlights: [], channels: ['WEBSITE_APP', 'API_PARTNERS'], labels: [],
  cityName: 'Munnar', stateName: 'Kerala', countryName: 'India', sourcePayload: {},
};

describe('product wizard channel selections', () => {
  it('round-trips the persisted channel list through the revision form', () => {
    expect(toRevisionForm(baseRevision).channels).toEqual(['WEBSITE_APP', 'API_PARTNERS']);
  });

  it('reads legacy Admin channel metadata when the revision channel list is empty', () => {
    expect(toRevisionForm({ ...baseRevision, channels: [], sourcePayload: { admin: { channels: ['TRAVEL_AGENTS'] } } }).channels).toEqual(['TRAVEL_AGENTS']);
  });

  it('loads a persisted Admin ranking boost and ignores invalid metadata', () => {
    expect(toRevisionForm({ ...baseRevision, sourcePayload: { admin: { rankingBoost: 'PLUS_TWO' } } }).adminRankingBoost).toBe('PLUS_TWO');
    expect(toRevisionForm({ ...baseRevision, sourcePayload: { admin: { rankingBoost: 'UNTRUSTED' } } }).adminRankingBoost).toBe('NONE');
  });

  it('does not opt vendor-created activities into Admin-selected channels by default', () => {
    expect(emptyRevisionForm.channels).toEqual([]);
  });
});

describe('product edit routes', () => {
  it('keeps the persisted draft edit route under the configured application base path', () => {
    expect(vendorProductEditPath('draft/with space', '/voya/')).toBe('/voya/vendor/products/draft%2Fwith%20space/edit');
    expect(vendorProductEditPath('product-1', '/')).toBe('/vendor/products/product-1/edit');
  });
});
