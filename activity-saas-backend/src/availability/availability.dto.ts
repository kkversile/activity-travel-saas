import { Type } from 'class-transformer';
import { IsArray, IsBoolean, IsDateString, IsInt, IsNumber, IsOptional, IsString, Max, Min, ValidateNested } from 'class-validator';

export class SlotDto {
  @IsString() ratePlanId!: string;
  @IsDateString() slotDate!: string;
  @IsString() startTime!: string;
  @Type(() => Number) @IsInt() @Min(0) capacity!: number;
  @Type(() => Number) @IsInt() @Min(0) available!: number;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) priceOverride?: number;
  @IsOptional() @IsBoolean() closed?: boolean;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) expectedVersion?: number;
}

export class BulkSlotsDto {
  @IsArray() @ValidateNested({ each: true }) @Type(() => SlotDto) slots!: SlotDto[];
}

export class CreatePromotionDto {
  @IsString() activityId!: string;
  @IsString() name!: string;
  @Type(() => Number) @IsNumber() @Min(0.01) @Max(100) discountPercent!: number;
  @IsDateString() startsAt!: string;
  @IsDateString() endsAt!: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) maxDiscountedBookings?: number;
  @IsOptional() @IsBoolean() active?: boolean;
}

export class PricingRuleDto {
  @IsString() activityId!: string;
  @IsString() name!: string;
  @IsString() appliesTo!: string;
  @IsString() adjustmentType!: 'PERCENTAGE' | 'ABSOLUTE';
  @Type(() => Number) @IsNumber() adjustment!: number;
  @IsDateString() startsAt!: string;
  @IsDateString() endsAt!: string;
  @IsOptional() @IsBoolean() active?: boolean;
}
