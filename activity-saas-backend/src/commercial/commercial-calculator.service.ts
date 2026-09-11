import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AppliedRule, QuoteInput, QuoteResult, ReasonCode } from './commercial.types';

const D = (value: Prisma.Decimal | number | string | undefined | null) => new Prisma.Decimal(value ?? 0);
const money = (value: Prisma.Decimal) => roundCurrency(value).toFixed(2);

export type TaxRoundingPolicy = 'HALF_UP' | 'HALF_EVEN' | 'DOWN' | 'UP';
const roundingMode: Record<TaxRoundingPolicy, number> = { HALF_UP: Prisma.Decimal.ROUND_HALF_UP, HALF_EVEN: Prisma.Decimal.ROUND_HALF_EVEN, DOWN: Prisma.Decimal.ROUND_DOWN, UP: Prisma.Decimal.ROUND_UP };
export function roundCurrency(value: Prisma.Decimal, policy: TaxRoundingPolicy = 'HALF_UP') { return value.toDecimalPlaces(2, (roundingMode[policy] ?? roundingMode.HALF_UP) as any); }

@Injectable()
export class CommercialCalculatorService {
  calculate(input: QuoteInput, version: any, rules: Array<{ rule: any; config: any }>): QuoteResult {
    const reasons: ReasonCode[] = [];
    const add = (reason: ReasonCode) => { if (!reasons.includes(reason)) reasons.push(reason); };
    if (!version) add('NO_ACTIVE_COMMERCIAL_VERSION');
    if (!version?.supplierModel) add('SUPPLIER_MODEL_MISSING');
    if (version?.supplierModel && !['NET_RATE', 'COMMISSIONABLE'].includes(version.supplierModel)) add('SUPPLIER_MODEL_UNSUPPORTED');
    if (!version?.pricingUnit) add('PRICING_UNIT_MISSING');
    if (!version?.bookingMode) add('BOOKING_MODE_MISSING');
    if (version?.supplierBaseAmount === null || version?.supplierBaseAmount === undefined) add('SUPPLIER_BASE_AMOUNT_MISSING');

    const unit = version?.pricingUnit;
    const travellers = input.travellers || [];
    const priceFor = (type: string) => version?.travellerPrices?.find((p: any) => p.travellerType === type)?.amount;
    let supplierBasis = D(0);
    if (unit === 'PER_PERSON') {
      for (const traveller of travellers) {
        const price = priceFor(traveller.travellerType);
        if (price === undefined) add('TRAVELLER_PRICE_MISSING');
        supplierBasis = supplierBasis.plus(D(price).times(traveller.quantity));
      }
      if (!travellers.length) add('TRAVELLER_PRICE_MISSING');
    } else if (unit === 'PER_BOOKING' || unit === 'PER_UNIT' || unit === 'GROUP') supplierBasis = D(version?.supplierBaseAmount).times(input.units);

    const focRule = rules.find((r) => r.rule.kind === 'FOC');
    let focApplied = false; let freeChargeableQuantity = 0; let focDiscount = D(0); let focFunder: string | undefined;
    if (focRule) {
      const c: any = focRule.config; focFunder = c.funder;
      if (unit !== 'PER_PERSON') add('FOC_UNSUPPORTED_PRICING_UNIT');
      else if (c.funder !== 'SUPPLIER') add('FOC_FUNDING_MODEL_NOT_LOCKED');
      else if (c.enabled) {
        const chargeable = travellers.find((t) => t.travellerType === c.appliesTo)?.quantity || 0;
        freeChargeableQuantity = Math.min(chargeable, Math.floor(chargeable / c.qualifyingQuantity) * c.freeQuantity);
        focApplied = freeChargeableQuantity > 0;
        const calculatedFoc = D(priceFor(c.appliesTo)).times(freeChargeableQuantity);
        focDiscount = calculatedFoc.greaterThan(supplierBasis) ? supplierBasis : calculatedFoc;
        const discountedBasis = supplierBasis.minus(focDiscount);
        supplierBasis = discountedBasis.lessThan(0) ? D(0) : discountedBasis;
      }
    }

    const supplierCommission = version?.supplierModel === 'COMMISSIONABLE' ? supplierBasis.times(D(version.supplierCommissionPercent)).div(100) : D(0);
    const vendorPayable = supplierBasis.minus(supplierCommission);
    const voyaRules = rules.filter((r) => r.rule.kind === 'VOYA_REVENUE');
    if (!voyaRules.length) add('VOYA_REVENUE_RULE_MISSING');
    const voyaConfig: any = voyaRules[0]?.config; let voyaRevenue = D(0); let voyaModel: any;
    if (voyaConfig) {
      voyaModel = voyaConfig.model;
      if (voyaConfig.model === 'MARKUP_FIXED') voyaRevenue = D(voyaConfig.fixedAmount);
      else if (voyaConfig.model === 'MARKUP_PERCENT' || voyaConfig.model === 'COMMISSION_PERCENT') voyaRevenue = vendorPayable.times(D(voyaConfig.percent)).div(100);
    }
    const platformCommercialBase = vendorPayable.plus(voyaRevenue);

    const agentRule = rules.find((r) => r.rule.kind === 'AGENT_COMMERCIAL');
    let agentMarkup = D(0); let agentCommission = D(0); let agentFacingPreTax = platformCommercialBase; let agentModel: any;
    if (input.agentTenantId && !agentRule) add('AGENT_COMMERCIAL_UNCONFIGURED');
    if (!input.agentTenantId) add('AGENT_FACING_QUOTE_INCOMPLETE');
    if (agentRule) {
      const c: any = agentRule.config; agentModel = c.model;
      if (c.model === 'NET_PLUS_MARKUP') { agentMarkup = D(c.markupAmount); agentFacingPreTax = platformCommercialBase.plus(agentMarkup); }
      else if (c.model === 'SELLING_PRICE_COMMISSION') { agentCommission = platformCommercialBase.times(D(c.commissionPercent)).div(100); agentFacingPreTax = platformCommercialBase; }
      else if (c.model === 'AGENT_SPECIFIC_PRICE') agentFacingPreTax = D(c.price);
    }

    const eligibilityRule = rules.find((r) => r.rule.kind === 'ELIGIBILITY');
    let commercialEligibility: QuoteResult['commercialEligibility'] = 'NOT_APPLICABLE';
    if (input.agentTenantId) {
      if (!eligibilityRule) { commercialEligibility = 'UNCONFIGURED'; add('AGENT_ELIGIBILITY_UNCONFIGURED'); }
      else if ((eligibilityRule.config as any).decision === 'DENY') { commercialEligibility = 'DENIED'; add('AGENT_COMMERCIAL_DENIED'); }
      else commercialEligibility = 'ALLOWED';
    }

    const taxRule = rules.find((r) => r.rule.kind === 'TAX');
    if (!taxRule) add('TAX_CONFIGURATION_MISSING');
    const tax: any = taxRule?.config; const taxMode = tax?.mode || 'NONE'; const roundingPolicy: TaxRoundingPolicy = tax?.roundingPolicy || 'HALF_UP'; let taxableBase = agentFacingPreTax;
    if (tax) {
      if (tax.taxableBase === 'SUPPLIER_BASIS') taxableBase = supplierBasis;
      else if (tax.taxableBase === 'VENDOR_PAYABLE') taxableBase = vendorPayable;
      else if (tax.taxableBase === 'EXPLICIT_BASE') taxableBase = D(tax.explicitBase);
    }

    const promotions = rules.filter((r) => r.rule.kind === 'PROMOTION');
    let promotionPreTax = D(0); let promotionPostTax = D(0); const funding: Record<string, Prisma.Decimal> = { SUPPLIER: D(0), VOYA: D(0), AGENT: D(0) }; let promotionFunder: string | null = null; let promotionStage: string | null = null;
    for (const promotion of promotions) {
      const c: any = promotion.config; const amount = c.discountType === 'PERCENT' ? agentFacingPreTax.times(D(c.value)).div(100) : D(c.value);
      if (c.applicationStage === 'PRE_TAX') promotionPreTax = promotionPreTax.plus(amount); else promotionPostTax = promotionPostTax.plus(amount);
      promotionFunder = promotionFunder && promotionFunder !== c.funder ? 'MULTIPLE' : c.funder; promotionStage = promotionStage && promotionStage !== c.applicationStage ? 'MIXED' : c.applicationStage;
      if (c.funder === 'SHARED') { const split = c.funding; funding.SUPPLIER = funding.SUPPLIER.plus(amount.times(D(split.vendorPercent)).div(100)); funding.VOYA = funding.VOYA.plus(amount.times(D(split.voyaPercent)).div(100)); funding.AGENT = funding.AGENT.plus(amount.times(D(split.agentPercent)).div(100)); }
      else if (c.funder === 'SUPPLIER') funding.SUPPLIER = funding.SUPPLIER.plus(amount); else if (c.funder === 'VOYA') funding.VOYA = funding.VOYA.plus(amount); else if (c.funder === 'AGENT') funding.AGENT = funding.AGENT.plus(amount);
    }
    const rawPromotionTaxableBase = taxableBase.minus(promotionPreTax);
    const promotionTaxableBase = rawPromotionTaxableBase.lessThan(0) ? D(0) : rawPromotionTaxableBase;
    const preTaxTax = taxMode === 'EXCLUSIVE' ? roundCurrency(promotionTaxableBase.times(D(tax?.rate)).div(100), roundingPolicy) : taxMode === 'INCLUSIVE' ? roundCurrency(promotionTaxableBase.minus(promotionTaxableBase.div(D(1).plus(D(tax?.rate || 0).div(100)))), roundingPolicy) : D(0);
    const finalAmount = (taxMode === 'INCLUSIVE' ? agentFacingPreTax.minus(promotionPreTax) : agentFacingPreTax.minus(promotionPreTax).plus(preTaxTax)).minus(promotionPostTax).toDecimalPlaces(2);
    const appliedRules: AppliedRule[] = rules.map((r) => { const v = r.rule.versions?.[0] || r.rule; return { ruleId: r.rule.id, ruleVersionId: v.id, kind: r.rule.kind, scope: r.rule.scopeType, priority: v.priority, stackingMode: v.stackingMode, effectiveFrom: v.effectiveFrom, effectiveTo: v.effectiveTo, config: r.config }; });
    const ready = reasons.length === 0 && commercialEligibility !== 'DENIED' && commercialEligibility !== 'UNCONFIGURED';
    return { ready, reasonCodes: reasons, ratePlanCommercialVersionId: version?.id, commercialVersionNumber: version?.versionNumber, currency: version?.currency || 'INR', pricingUnit: version?.pricingUnit, bookingMode: version?.bookingMode, supplier: { model: version?.supplierModel, grossBasis: money(supplierBasis), commission: money(supplierCommission), vendorPayable: money(vendorPayable) }, voya: { model: voyaModel, revenue: money(voyaRevenue) }, agent: { model: agentModel, markup: money(agentMarkup), commission: money(agentCommission), facingAmount: money(agentFacingPreTax) }, tax: { mode: taxMode, amount: money(preTaxTax), context: tax ? { rate: tax.rate, taxableBase: tax.taxableBase, accountableParty: tax.accountableParty, roundingPolicy: tax.roundingPolicy } : undefined }, promotionAmount: money(promotionPreTax.plus(promotionPostTax)), promotionFunder, promotionApplicationStage: promotionStage, promotionFundingBreakdown: Object.fromEntries(Object.entries(funding).map(([key, value]) => [key, money(value)])), foc: { applied: focApplied, freeChargeableQuantity, discountAmount: money(focDiscount), funder: focFunder }, commercialEligibility, agentFacingAmount: money(agentFacingPreTax), focAmount: money(focDiscount), finalAmount: money(finalAmount), appliedRules, calculationInputs: input, calculationOutputs: { supplierBasis: money(supplierBasis), supplierCommission: money(supplierCommission), vendorPayable: money(vendorPayable), voyaRevenue: money(voyaRevenue), platformCommercialBase: money(platformCommercialBase), agentMarkup: money(agentMarkup), agentCommission: money(agentCommission), agentFacingPreTax: money(agentFacingPreTax), promotionPreTax: money(promotionPreTax), taxableBase: money(promotionTaxableBase), taxAmount: money(preTaxTax), promotionPostTax: money(promotionPostTax), finalAmount: money(finalAmount) } };
  }
}
