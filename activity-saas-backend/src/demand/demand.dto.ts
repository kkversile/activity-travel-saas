import { DemandOpportunityPriority, DemandOpportunityResolutionType, DemandOpportunityStatus, DemandOpportunityType, DemandTargetStatus } from '@prisma/client';
import { Type } from 'class-transformer';
import { IsArray, IsBoolean, IsDateString, IsEnum, IsInt, IsOptional, IsString, IsUUID, Matches, Max, Min, ValidateNested } from 'class-validator';

export class DemandWindowDto {
  @IsOptional() @IsDateString() windowStart?: string;
  @IsOptional() @IsDateString() windowEnd?: string;
  @IsOptional() @IsDateString() horizonEnd?: string;
}

export class DemandListQueryDto extends DemandWindowDto {
  @IsOptional() @IsEnum(DemandOpportunityStatus) status?: DemandOpportunityStatus;
  @IsOptional() @IsEnum(DemandOpportunityType) type?: DemandOpportunityType;
  @IsOptional() @IsEnum(DemandOpportunityPriority) priority?: DemandOpportunityPriority;
  @IsOptional() @IsString() search?: string;
  @IsOptional() @IsString() destination?: string;
  @IsOptional() @IsString() category?: string;
  @IsOptional() @IsDateString() serviceDateFrom?: string;
  @IsOptional() @IsDateString() serviceDateTo?: string;
  @IsOptional() @IsUUID() ownerUserId?: string;
  @IsOptional() @IsUUID() vendorTenantId?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) pageSize?: number;
}

export class DemandPolicyRuleDto {
  @IsEnum(DemandOpportunityType) type!: DemandOpportunityType;
  @IsOptional() @IsBoolean() enabled?: boolean;
  @IsEnum(DemandOpportunityPriority) defaultPriority!: DemandOpportunityPriority;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) minSearchCount?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) minUniqueAgentCount?: number;
  @IsOptional() @Type(() => Number) @Min(0) maxAverageResultProducts?: number;
  @IsOptional() @Type(() => Number) @Min(0) @Max(1) minZeroResultRate?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) minSoldOutSessionCount?: number;
  @IsOptional() @Type(() => Number) @Min(0) @Max(1) minSoldOutRate?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) minConfirmedBookingCount?: number;
  @IsOptional() @Type(() => Number) @Min(0) @Max(1) minCancellationRate?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) minPriceCeilingMissCount?: number;
  @IsOptional() @Type(() => Number) @Min(0) @Max(1) minPriceCeilingMissRate?: number;
}

export class CreateDemandPolicyDto {
  @IsString() name!: string;
  @Type(() => Number) @IsInt() @Min(1) measurementWindowDays!: number;
  @Type(() => Number) @IsInt() @Min(0) futureHorizonDays!: number;
  @Type(() => Number) @IsInt() @Min(0) cooldownDays!: number;
  @IsArray() @ValidateNested({ each: true }) @Type(() => DemandPolicyRuleDto) rules!: DemandPolicyRuleDto[];
}

export class UpdateDemandPolicyDto extends CreateDemandPolicyDto {
  @Type(() => Number) @IsInt() @Min(1) expectedLockVersion!: number;
}

export class ManualDemandOpportunityDto {
  @IsEnum(DemandOpportunityType) type!: DemandOpportunityType;
  @IsEnum(DemandOpportunityPriority) priority!: DemandOpportunityPriority;
  @IsString() reason!: string;
  @IsOptional() @IsString() destinationNormalized?: string;
  @IsOptional() @IsString() cityName?: string;
  @IsOptional() @IsString() stateName?: string;
  @IsOptional() @IsString() countryName?: string;
  @IsOptional() @IsString() category?: string;
  @IsOptional() @IsString() subType?: string;
  @IsOptional() @IsString() title?: string;
  @IsOptional() @IsDateString() serviceDateFrom?: string;
  @IsOptional() @IsDateString() serviceDateTo?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) durationMin?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) durationMax?: number;
  @IsOptional() @Matches(/^[A-Z]{3}$/) currency?: string;
}

export class OpportunityMutationDto {
  @Type(() => Number) @IsInt() @Min(1) expectedVersion!: number;
  @IsOptional() @IsString() reason?: string;
}

export class OpportunityResolveDto {
  @Type(() => Number) @IsInt() @Min(1) expectedVersion!: number;
  @IsEnum(DemandOpportunityResolutionType) resolutionType!: DemandOpportunityResolutionType;
  @IsString() reason!: string;
}

export class OpportunityPriorityDto extends OpportunityMutationDto {
  @IsEnum(DemandOpportunityPriority) priority!: DemandOpportunityPriority;
}

export class OpportunityOwnerDto extends OpportunityMutationDto {
  @IsOptional() @IsUUID() ownerUserId?: string;
}

export class OpportunityPatchDto extends OpportunityMutationDto {
  @IsOptional() @IsEnum(DemandOpportunityPriority) priority?: DemandOpportunityPriority;
  @IsOptional() @IsUUID() ownerUserId?: string;
}

export class OpportunityTargetDto {
  @IsUUID() vendorTenantId!: string;
}

export class VendorOpportunityResponseDto {
  @IsEnum(DemandTargetStatus) status!: DemandTargetStatus;
  @Type(() => Number) @IsInt() @Min(1) expectedVersion!: number;
  @IsOptional() @IsString() responseNote?: string;
}

export class OpportunityRemovalDto {
  @IsString() reason!: string;
}

export class VendorOpportunityListQueryDto {
  @IsOptional() @IsBoolean() history?: boolean;
}
