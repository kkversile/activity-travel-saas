import { DistributionEventType } from '@prisma/client';
import { DistributionEventProjectorService } from './distribution-event.service';

describe('DistributionEventProjectorService', () => {
  it('classifies simplified activity pricing invalidation as a rate change', () => {
    const service = new DistributionEventProjectorService({} as any);
    expect((service as any).classify({ eventType: 'ACTIVITY_PRICES_PROJECTIONS_INVALIDATE', aggregateType: 'Product' })).toBe(DistributionEventType.RATE_CHANGED);
  });
});
