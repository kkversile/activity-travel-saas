import { Transform, Type } from "class-transformer";
import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  Min,
  MinLength,
} from "class-validator";
import {
  PaymentCollectionMode,
  SettlementCycleMode,
  SettlementEligibilityTrigger,
  SettlementHoldScope,
} from "@prisma/client";

export class SettlementPreviewDto {
  @IsOptional() @IsString() vendorTenantId?: string;
  @IsOptional() @IsDateString() periodFrom?: string;
  @IsOptional() @IsDateString() periodTo?: string;
  @IsString() @Matches(/^[A-Za-z]{3}$/) currency!: string;
}
export class SettlementBatchDto extends SettlementPreviewDto {
  @IsString() @MinLength(1) expectedPreviewFingerprint!: string;
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  selectedSourceEventIds?: string[];
}
export class FinanceConfigurationDto {
  @IsEnum(PaymentCollectionMode) paymentCollectionMode!: PaymentCollectionMode;
  @IsOptional() @IsString() @Matches(/^[A-Za-z]{3}$/) baseCurrency?: string;
  @Type(() => Number) @IsInt() @Min(1) expectedVersion!: number;
}
export class VendorSettlementPolicyDto {
  @IsEnum(SettlementCycleMode) cycleMode!: SettlementCycleMode;
  @IsEnum(SettlementEligibilityTrigger)
  eligibilityTrigger!: SettlementEligibilityTrigger;
  @Type(() => Number) @IsInt() @Min(0) settlementDelayDays!: number;
  @IsOptional() @Type(() => Number) @IsInt() weeklyDay?: number;
  @IsOptional() @IsBoolean() active?: boolean;
  @IsOptional() @IsBoolean() reviewRequired?: boolean;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) expectedVersion?: number;
}
export class VendorAdjustmentDto {
  @IsString() vendorTenantId!: string;
  @IsString() signedAmount!: string;
  @IsString() @MinLength(1) reason!: string;
  @IsString() @MinLength(1) reference!: string;
  @IsOptional() @IsString() bookingId?: string;
  @IsOptional() @IsString() currency?: string;
}
export class CancellationResolutionDto {
  @IsString() finalVendorPayable!: string;
  @IsString() reason!: string;
  @IsString() reference!: string;
}
export class SettlementHoldDto {
  @IsEnum(SettlementHoldScope) scope!: SettlementHoldScope;
  @IsString()
  @MinLength(1)
  @Transform(({ value }) => (typeof value === "string" ? value.trim() : value))
  reason!: string;
  @IsOptional() @IsString() reference?: string;
  @IsOptional() @IsString() vendorTenantId?: string;
  @IsOptional() @IsString() bookingId?: string;
  @IsOptional() @IsString() financialEventId?: string;
}
export class SettlementHoldReleaseDto {
  @IsString()
  @MinLength(1)
  @Transform(({ value }) => (typeof value === "string" ? value.trim() : value))
  reason!: string;
}
export class ReleasePayoutDto {
  @IsString()
  @MinLength(1)
  @Transform(({ value }) => (typeof value === "string" ? value.trim() : value))
  externalReference!: string;
  @IsOptional() @IsString() note?: string;
}
export class FailPayoutDto {
  @IsString()
  @MinLength(1)
  @Transform(({ value }) => (typeof value === "string" ? value.trim() : value))
  failureReason!: string;
  @IsOptional() @IsString() reference?: string;
  @IsOptional() @IsString() note?: string;
}
export class ReconcilePayoutDto {
  @IsString() @IsNotEmpty() confirmedAmount!: string;
  @IsString()
  @MinLength(1)
  @Transform(({ value }) => (typeof value === "string" ? value.trim() : value))
  reconciliationReference!: string;
  @IsOptional() @IsString() note?: string;
}
