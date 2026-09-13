import { Type } from 'class-transformer';
import { IsBoolean, IsDateString, IsEnum, IsInt, IsOptional, IsString, Min } from 'class-validator';
import { PaymentCollectionMode, SettlementCycleMode, SettlementEligibilityTrigger, SettlementHoldScope } from '@prisma/client';

export class SettlementPreviewDto {
  @IsOptional() @IsString() vendorTenantId?: string;
  @IsOptional() @IsDateString() periodFrom?: string;
  @IsOptional() @IsDateString() periodTo?: string;
  @IsOptional() @IsString() currency?: string;
}
export class SettlementBatchDto extends SettlementPreviewDto { @IsOptional() @IsString() expectedPreviewFingerprint?: string; }
export class FinanceConfigurationDto { @IsEnum(PaymentCollectionMode) paymentCollectionMode!: PaymentCollectionMode; @IsOptional() @IsString() baseCurrency?: string; @IsOptional() @Type(() => Number) @IsInt() @Min(1) expectedVersion?: number; }
export class VendorSettlementPolicyDto {
  @IsEnum(SettlementCycleMode) cycleMode!: SettlementCycleMode;
  @IsEnum(SettlementEligibilityTrigger) eligibilityTrigger!: SettlementEligibilityTrigger;
  @Type(() => Number) @IsInt() @Min(0) settlementDelayDays!: number;
  @IsOptional() @Type(() => Number) @IsInt() weeklyDay?: number;
  @IsOptional() @IsBoolean() active?: boolean;
  @IsOptional() @IsBoolean() reviewRequired?: boolean;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) expectedVersion?: number;
}
export class VendorAdjustmentDto { @IsString() vendorTenantId!: string; @IsString() signedAmount!: string; @IsString() reason!: string; @IsString() reference!: string; @IsOptional() @IsString() bookingId?: string; @IsOptional() @IsString() currency?: string; }
export class CancellationResolutionDto { @IsString() finalVendorPayable!: string; @IsString() reason!: string; @IsString() reference!: string; }
export class SettlementHoldDto { @IsEnum(SettlementHoldScope) scope!: SettlementHoldScope; @IsString() reason!: string; @IsOptional() @IsString() reference?: string; @IsOptional() @IsString() vendorTenantId?: string; @IsOptional() @IsString() bookingId?: string; @IsOptional() @IsString() financialEventId?: string; }
export class ReleasePayoutDto { @IsString() externalReference!: string; }
export class FailPayoutDto { @IsString() failureReason!: string; }
export class ReconcilePayoutDto { @IsString() confirmedAmount!: string; @IsString() reconciliationReference!: string; @IsOptional() @IsString() note?: string; }
