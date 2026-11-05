import { validate } from 'class-validator';
import { AdminCreateProductDraftDto, DocumentReviewDto } from './governance.dto';

describe('DocumentReviewDto', () => {
  it('requires a valid document review status', async () => {
    expect((await validate(Object.assign(new DocumentReviewDto(), {}))).length).toBeGreaterThan(0);
  });
});

describe('AdminCreateProductDraftDto margin override', () => {
  const base = { tenantId: 'vendor-1', productName: 'Kayak tour', type: 'ACTIVITY', subType: 'Guided' };

  it.each(['USE_PRICING_RULES', 'CUSTOM_RULE'])('accepts %s', async (marginOverride) => {
    const errors = await validate(Object.assign(new AdminCreateProductDraftDto(), base, { marginOverride }));
    expect(errors.find((error) => error.property === 'marginOverride')).toBeUndefined();
  });

  it('rejects unsupported margin override values', async () => {
    const errors = await validate(Object.assign(new AdminCreateProductDraftDto(), base, { marginOverride: 'MAKE_UP_A_VALUE' }));
    expect(errors.some((error) => error.property === 'marginOverride')).toBe(true);
  });
});
