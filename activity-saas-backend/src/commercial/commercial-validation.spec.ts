import { BadRequestException } from '@nestjs/common';
import { validateRuleConfig } from './commercial-validation';

const tax = { mode: 'NONE', rate: '0', taxableBase: 'AGENT_PRE_TAX', accountableParty: 'NONE', roundingPolicy: 'HALF_UP' };
describe('commercial rule config validation', () => {
  it('requires a supported Voya model and decimal input', () => { expect(() => validateRuleConfig('VOYA_REVENUE', { model: 'HYBRID' })).toThrow(BadRequestException); expect(() => validateRuleConfig('VOYA_REVENUE', { model: 'MARKUP_PERCENT', percent: 10 })).toThrow(BadRequestException); });
  it('requires an agent model field', () => expect(() => validateRuleConfig('AGENT_COMMERCIAL', {})).toThrow(BadRequestException));
  it('requires complete tax context', () => expect(() => validateRuleConfig('TAX', { mode: 'EXCLUSIVE' })).toThrow(BadRequestException));
  it('allows explicit NONE tax', () => expect(validateRuleConfig('TAX', tax)).toEqual(tax));
  it('requires promotion stage and funding', () => expect(() => validateRuleConfig('PROMOTION', { discountType: 'PERCENT', value: '10', funder: 'VOYA' })).toThrow(BadRequestException));
  it('requires valid shared funding totals', () => { const base = { discountType: 'FIXED', value: '10', funder: 'SHARED', applicationStage: 'POST_TAX' }; expect(() => validateRuleConfig('PROMOTION', { ...base, funding: { vendorPercent: '50', voyaPercent: '20', agentPercent: '20' } })).toThrow(BadRequestException); expect(validateRuleConfig('PROMOTION', { ...base, funding: { vendorPercent: '50', voyaPercent: '50', agentPercent: '0' } })).toMatchObject(base); });
  it('requires valid FOC quantities', () => { const valid = { enabled: true, qualifyingQuantity: 2, freeQuantity: 1, appliesTo: 'ADULT', funder: 'SUPPLIER' }; expect(() => validateRuleConfig('FOC', { ...valid, qualifyingQuantity: 0 })).toThrow(BadRequestException); expect(() => validateRuleConfig('FOC', { ...valid, freeQuantity: 0 })).toThrow(BadRequestException); expect(() => validateRuleConfig('FOC', { ...valid, freeQuantity: 2 })).toThrow(BadRequestException); expect(validateRuleConfig('FOC', valid)).toEqual(valid); });
  it('validates eligibility decisions', () => expect(validateRuleConfig('ELIGIBILITY', { decision: 'ALLOW' })).toEqual({ decision: 'ALLOW' }));
  it('rejects unknown fields', () => expect(() => validateRuleConfig('ELIGIBILITY', { decision: 'ALLOW', anything: true })).toThrow(BadRequestException));
});
