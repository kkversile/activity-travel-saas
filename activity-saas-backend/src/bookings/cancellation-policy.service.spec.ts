import { CancellationPolicyService } from './cancellation-policy.service';

describe('CancellationPolicyService', () => {
  it('rejects overlapping inclusive day ranges deterministically', async () => {
    const client = { cancellationRule: { findMany: jest.fn().mockResolvedValue([{ id: '1', minDaysBefore: 0, maxDaysBefore: 5, chargeType: 'PERCENTAGE', chargeValue: 0 }, { id: '2', minDaysBefore: 5, maxDaysBefore: 10, chargeType: 'PERCENTAGE', chargeValue: 50 }]) } };
    await expect(new CancellationPolicyService().load(client, 'plan-1')).rejects.toMatchObject({ response: expect.objectContaining({ code: 'CANCELLATION_POLICY_AMBIGUOUS' }) });
  });
});
