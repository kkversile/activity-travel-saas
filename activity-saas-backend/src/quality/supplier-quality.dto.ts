import { IsArray, IsBoolean, IsEnum, IsInt, IsNumber, IsOptional, IsString, Min, Max, IsNotEmpty, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { SupplierQualityDimension, SupplierQualityIssueStatus, SupplierQualityMetricCode, SupplierQualityPolicyStatus, SupplierMetricDirection, SupplierMetricMissingDataTreatment, SupplierTier } from '@prisma/client';

export class QualityMetricRuleDto {
  @IsEnum(SupplierQualityMetricCode) metricCode!: SupplierQualityMetricCode;
  @IsEnum(SupplierQualityDimension) dimension!: SupplierQualityDimension;
  @IsOptional() @IsBoolean() enabled?: boolean;
  @IsEnum(SupplierMetricDirection) direction!: SupplierMetricDirection;
  @IsNumber() @Min(0) weight!: number;
  @IsNumber() targetValue!: number;
  @IsNumber() warningValue!: number;
  @IsInt() @Min(0) minimumSampleSize!: number;
  @IsEnum(SupplierMetricMissingDataTreatment) missingDataTreatment!: SupplierMetricMissingDataTreatment;
  @IsNumber() @Min(0) @Max(100) passScore!: number;
  @IsNumber() @Min(0) @Max(100) warnScore!: number;
  @IsNumber() @Min(0) @Max(100) failScore!: number;
  @IsOptional() @IsInt() rank?: number;
}

export class SupplierTierRuleDto {
  @IsEnum(SupplierTier) tier!: SupplierTier;
  @IsNumber() @Min(0) @Max(100) minimumScore!: number;
}

export class SupplierQualityPolicyDto {
  @IsInt() @Min(1) versionNumber!: number;
  @IsString() @IsNotEmpty() name!: string;
  @IsInt() @Min(1) measurementWindowDays!: number;
  @IsInt() @Min(0) shortNoticeDays!: number;
  @IsInt() @Min(0) lastMinuteStopSellDays!: number;
  @IsArray() @ValidateNested({ each: true }) @Type(() => QualityMetricRuleDto) metricRules!: QualityMetricRuleDto[];
  @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => SupplierTierRuleDto) tierRules?: SupplierTierRuleDto[];
}

export class UpdateSupplierQualityPolicyDto extends SupplierQualityPolicyDto {
  @IsInt() @Min(1) expectedLockVersion!: number;
}

export class TierAssignmentDto {
  @IsEnum(SupplierTier) tier!: SupplierTier;
  @IsString() reason!: string;
  @IsOptional() @IsString() sourceSnapshotId?: string;
}

export class IssueReasonDto {
  @IsString() reason!: string;
}

export class CaptureSnapshotDto {
  @IsOptional() @IsString() windowStart?: string;
  @IsOptional() @IsString() windowEnd?: string;
}

export class QualityVendorQueryDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page = 1;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) limit = 25;
  @IsOptional() @IsString() search?: string;
  @IsOptional() @IsEnum(SupplierTier) tier?: SupplierTier;
  @IsOptional() @IsEnum(SupplierQualityIssueStatus) issueStatus?: SupplierQualityIssueStatus;
}

export const policyStatuses = Object.values(SupplierQualityPolicyStatus);
