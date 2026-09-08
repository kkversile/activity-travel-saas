import { ChargeType, RatePlanStatus, TravellerType } from '@prisma/client';
import { PartialType } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsArray, IsBoolean, IsDateString, IsEnum, IsInt, IsNumber, IsOptional, IsString, Max, Min, ValidateNested } from 'class-validator';

export class TravellerRuleDto {
  @IsEnum(TravellerType) type!: TravellerType;
  @IsOptional() @IsString() displayName?: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) minAge?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) maxAge?: number;
  @Type(() => Number) @IsInt() @Min(0) minCount = 0;
  @Type(() => Number) @IsInt() @Min(0) maxCount = 99;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) price?: number;
}

export class CancellationRuleDto {
  @Type(() => Number) @IsInt() @Min(0) minDaysBefore!: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) maxDaysBefore?: number;
  @Type(() => Number) @IsNumber() @Min(0) chargeValue!: number;
  @IsEnum(ChargeType) chargeType!: ChargeType;
}

export class CreateRatePlanDto {
  @IsString() ratePlanCode!: string;
  @IsString() name!: string;
  @IsOptional() @IsEnum(RatePlanStatus) status?: RatePlanStatus;
  @IsOptional() @IsString() description?: string;
  @IsDateString() validFrom!: string;
  @IsDateString() validTo!: string;
  @IsOptional() @IsString() currency?: string;
  @IsOptional() @IsString() unitType?: string;
  @Type(() => Number) @IsNumber() @Min(0) basePrice!: number;
  @IsOptional() @IsBoolean() dynamicInventory?: boolean;
  @IsOptional() @IsBoolean() freehold?: boolean;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) minPax?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) maxPax?: number;
  @IsOptional() @IsArray() @IsString({ each: true }) affiliates?: string[];
  @IsOptional() @IsArray() @IsString({ each: true }) validDays?: string[];
  @IsOptional() @IsArray() @IsDateString({}, { each: true }) blackoutDates?: string[];
  @IsOptional() @IsArray() @IsString({ each: true }) suitableFor?: string[];
  @IsOptional() @IsArray() @IsString({ each: true }) inclusions?: string[];
  @IsOptional() @IsArray() @IsString({ each: true }) exclusions?: string[];
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) durationMinutes?: number;
  @IsOptional() @IsBoolean() mealIncluded?: boolean;
  @IsOptional() @IsString() mealType?: string;
  @IsOptional() @IsString() timeOfDay?: string;
  @IsOptional() @IsBoolean() pickupIncluded?: boolean;
  @IsOptional() @IsString() pickupTimings?: string;
  @IsOptional() @IsBoolean() dropoffIncluded?: boolean;
  @IsOptional() @IsString() dropoffTimings?: string;
  @IsOptional() @IsString() vehicleType?: string;
  @IsOptional() @IsString() privateShared?: string;
  @IsOptional() @IsBoolean() ticketOnly?: boolean;
  @IsOptional() @IsBoolean() entryFeeIncluded?: boolean;
  @IsOptional() @IsBoolean() offlineVoucher?: boolean;
  @IsOptional() @IsBoolean() instantConfirmation?: boolean;
  @IsOptional() @IsBoolean() autoRedeem?: boolean;
  @IsOptional() @IsString() pickupType?: string;
  @IsOptional() @IsString() pickupInput?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) cutOffMinutes?: number;
  @IsOptional() @IsBoolean() adultRequired?: boolean;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) minAdultRequired?: number;

  @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => TravellerRuleDto)
  travellerRules?: TravellerRuleDto[];

  @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => CancellationRuleDto)
  cancellationRules?: CancellationRuleDto[];
}

export class UpdateRatePlanDto extends PartialType(CreateRatePlanDto) {}
