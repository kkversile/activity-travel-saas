import { CancellationPolicyService } from './cancellation-policy.service';

describe('CancellationPolicyService', () => {
  it('rejects overlapping inclusive day ranges deterministically', async () => {
    const client = { cancellationRule: { findMany: jest.fn().mockResolvedValue([{ id: '1', minDaysBefore: 0, maxDaysBefore: 5, chargeType: 'PERCENTAGE', chargeValue: 0 }, { id: '2', minDaysBefore: 5, maxDaysBefore: 10, chargeType: 'PERCENTAGE', chargeValue: 50 }]) } };
    await expect(new CancellationPolicyService().load(client, 'plan-1')).rejects.toMatchObject({ response: expect.objectContaining({ code: 'CANCELLATION_POLICY_AMBIGUOUS' }) });
  });
  it('prefers the commercial version policy snapshot when one is available', async () => {
    const client = {
      ratePlanCommercialVersion: { findUnique: jest.fn().mockResolvedValue({ ratePlanId: 'plan-1', sourcePayload: { bookingRules: { cancellationRules: [{ minDaysBefore: 0, maxDaysBefore: 2, chargeType: 'PERCENTAGE', chargeValue: '100' }] } } }) },
      cancellationRule: { findMany: jest.fn() },
    };
    await expect(new CancellationPolicyService().load(client, 'plan-1', 'version-1')).resolves.toMatchObject({ policy: [{ minDaysBefore: 0, maxDaysBefore: 2, chargeValue: '100' }] });
    expect(client.cancellationRule.findMany).not.toHaveBeenCalled();
  });
});
