import { AgentCommercialModel, BookingMode, CommercialRuleKind, CommercialScopeType, CommercialStackingMode, PricingUnit, SupplierCommercialModel, TaxMode, TravellerType, VoyaRevenueModel } from '@prisma/client';
import { PartialType } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsArray, IsDateString, IsEnum, IsInt, IsObject, IsOptional, IsString, Matches, Max, Min, ValidateNested } from 'class-validator';

const DECIMAL = /^\d+(\.\d{1,4})?$/;
export class TravellerPriceDto { @IsEnum(TravellerType) travellerType!: TravellerType; @IsString() @Matches(DECIMAL) amount!: string; }
export class CreateCommercialVersionDto {
  @IsDateString() effectiveFrom!: string; @IsOptional() @IsDateString() effectiveTo?: string; @IsOptional() @IsEnum(SupplierCommercialModel) supplierModel?: SupplierCommercialModel; @IsOptional() @IsString() currency?: string; @IsOptional() @IsEnum(PricingUnit) pricingUnit?: PricingUnit; @IsOptional() @IsString() @Matches(DECIMAL) supplierBaseAmount?: string; @IsOptional() @IsString() @Matches(DECIMAL) supplierCommissionPercent?: string; @IsOptional() @IsEnum(BookingMode) bookingMode?: BookingMode; @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(525600) confirmationSlaMinutes?: number; @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => TravellerPriceDto) travellerPrices?: TravellerPriceDto[];
}
export class UpdateCommercialVersionDto extends PartialType(CreateCommercialVersionDto) {}
export class CreateCommercialRuleDto { @IsString() code!: string; @IsString() name!: string; @IsEnum(CommercialRuleKind) kind!: CommercialRuleKind; @IsEnum(CommercialScopeType) scopeType!: CommercialScopeType; @IsOptional() @IsString() vendorTenantId?: string; @IsOptional() @IsString() productId?: string; @IsOptional() @IsString() variantId?: string; @IsOptional() @IsString() ratePlanId?: string; @IsOptional() @IsString() agentGroupId?: string; @IsOptional() @IsString() agentTenantId?: string; }
export class CreateCommercialRuleVersionDto { @IsDateString() effectiveFrom!: string; @IsOptional() @IsDateString() effectiveTo?: string; @Type(() => Number) @IsInt() priority = 0; @IsOptional() @IsEnum(CommercialStackingMode) stackingMode?: CommercialStackingMode; @IsObject() config!: Record<string, unknown>; }
export class CreateAgentGroupDto { @IsString() code!: string; @IsString() name!: string; }
export class AgentGroupMemberDto { @IsString() agentTenantId!: string; }
export class QuoteTravellerDto { @IsEnum(TravellerType) travellerType!: TravellerType; @Type(() => Number) @IsInt() @Min(0) quantity!: number; }
export class QuoteDto { @IsString() ratePlanId!: string; @IsDateString() serviceDate!: string; @Type(() => Number) @IsInt() @Min(1) units = 1; @IsArray() @ValidateNested({ each: true }) @Type(() => QuoteTravellerDto) travellers!: QuoteTravellerDto[]; @IsOptional() @IsString() agentTenantId?: string; @IsOptional() @IsString() channel?: string; }
export type VoyaRevenueRuleConfig = { model: VoyaRevenueModel; fixedAmount?: string; percent?: string };
export type AgentCommercialRuleConfig = { model: AgentCommercialModel; markupAmount?: string; commissionPercent?: string; price?: string };
export type TaxRuleConfig = { mode: TaxMode; rate: string; taxableBase: 'AGENT_PRE_TAX' | 'SUPPLIER_BASIS' | 'VENDOR_PAYABLE' | 'EXPLICIT_BASE'; explicitBase?: string; accountableParty: 'VENDOR' | 'VOYA' | 'AGENT' | 'NONE'; roundingPolicy: 'HALF_UP' | 'HALF_EVEN' | 'DOWN' | 'UP' };
export type PromotionRuleConfig = { discountType: 'FIXED' | 'PERCENT'; value: string; funder: 'SUPPLIER' | 'VOYA' | 'AGENT' | 'SHARED'; applicationStage: 'PRE_TAX' | 'POST_TAX'; funding?: { vendorPercent: string; voyaPercent: string; agentPercent: string } };
export type FocRuleConfig = { enabled: boolean; qualifyingQuantity: number; freeQuantity: number; appliesTo: TravellerType; funder: 'SUPPLIER' | 'VOYA' | 'AGENT' | 'SHARED' };
export type AgentEligibilityRuleConfig = { decision: 'ALLOW' | 'DENY' };
export type CommercialRuleConfig = VoyaRevenueRuleConfig | AgentCommercialRuleConfig | TaxRuleConfig | PromotionRuleConfig | FocRuleConfig | AgentEligibilityRuleConfig;
