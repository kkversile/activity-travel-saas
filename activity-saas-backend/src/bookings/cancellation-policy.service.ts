import { ConflictException, Injectable } from '@nestjs/common';
import { ChargeType, Prisma } from '@prisma/client';
import { fingerprint } from './booking-fingerprint';

@Injectable()
export class CancellationPolicyService {
  async load(client: Prisma.TransactionClient | any, ratePlanId: string) {
    const rows = await client.cancellationRule.findMany({ where: { ratePlanId }, orderBy: [{ minDaysBefore: 'asc' }, { id: 'asc' }] });
    if (!rows.length) throw new ConflictException('CANCELLATION_POLICY_MISSING');
    for (const row of rows) {
      if (row.minDaysBefore < 0 || (row.maxDaysBefore != null && row.maxDaysBefore < row.minDaysBefore) || Number(row.chargeValue) < 0 || !Object.values(ChargeType).includes(row.chargeType)) throw new ConflictException('CANCELLATION_POLICY_INVALID');
    }
    for (let index = 1; index < rows.length; index += 1) {
      const previous = rows[index - 1];
      const current = rows[index];
      if (previous.maxDaysBefore == null || current.minDaysBefore <= previous.maxDaysBefore) {
        throw new ConflictException({ code: 'CANCELLATION_POLICY_AMBIGUOUS', message: 'Cancellation day ranges overlap; boundaries are inclusive' });
      }
    }
    const policy = rows.map((row: any) => ({ minDaysBefore: row.minDaysBefore, maxDaysBefore: row.maxDaysBefore, chargeType: row.chargeType, chargeValue: row.chargeValue.toString() }));
    return { policy, fingerprint: fingerprint(policy) };
  }
}
