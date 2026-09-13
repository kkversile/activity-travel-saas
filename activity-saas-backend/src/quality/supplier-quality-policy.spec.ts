import { BadRequestException } from '@nestjs/common';
import { SupplierMetricDirection } from '@prisma/client';
import { validateRule } from './supplier-quality-evaluator';
describe('Supplier quality policy rules', () => {
  it('rejects inverted threshold bands', () => { expect(() => validateRule({ direction: SupplierMetricDirection.HIGHER_BETTER, targetValue: 50, warningValue: 80, weight: 1, minimumSampleSize: 1, passScore: 100, warnScore: 50, failScore: 0 })).toThrow(BadRequestException); });
});
