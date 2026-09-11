import { ChargeType, RatePlanStatus, TravellerType } from '@prisma/client';
import { PartialType } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsArray, IsBoolean, IsDateString, IsEnum, IsInt, IsNumber, IsOptional, IsString, Min, ValidateNested } from 'class-validator';

export class TravellerRuleDto {
  @IsEnum(TravellerType) type!: TravellerType;
  @IsOptional() @IsString() displayName?: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) minAge?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) maxAge?: number;
  @Type(() => Number) @IsInt() @Min(0) minCount = 0;
  @Type(() => Number) @IsInt() @Min(0) maxCount = 99;
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
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) minPax?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) maxPax?: number;
  @IsOptional() @IsBoolean() ticketOnly?: boolean;
  @IsOptional() @IsBoolean() offlineVoucher?: boolean;
  @IsOptional() @IsBoolean() autoRedeem?: boolean;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) cutOffMinutes?: number;
  @IsOptional() @IsBoolean() adultRequired?: boolean;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) minAdultRequired?: number;

  @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => TravellerRuleDto)
  travellerRules?: TravellerRuleDto[];

  @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => CancellationRuleDto)
  cancellationRules?: CancellationRuleDto[];
}

export class UpdateRatePlanDto extends PartialType(CreateRatePlanDto) {}
