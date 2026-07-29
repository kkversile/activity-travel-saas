import { Type } from "class-transformer";
import { IsArray, IsDateString, IsEnum, IsInt, IsOptional, IsString, IsUrl, Max, Min } from "class-validator";
import { ActivityStatus, PricingBasis } from "@prisma/client";

export class CreateActivityDto {
  @IsString() name!: string;
  @IsString() slug!: string;
  @IsString() summary!: string;
  @IsString() description!: string;
  @IsString() destination!: string;
  @IsString() timezone!: string;
  @Type(() => Number) @IsInt() @Min(1) durationMinutes!: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) minAge?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) maxAge?: number;
  @IsOptional() @IsString() accessibility?: string;
  @IsOptional() @IsString() cancellationPolicy?: string;
  @IsOptional() @IsString() meetingPoint?: string;
  @IsOptional() @IsArray() @IsString({ each: true }) pickupOptions?: string[];
  @IsOptional() @IsArray() @IsString({ each: true }) inclusions?: string[];
  @IsOptional() @IsArray() @IsString({ each: true }) exclusions?: string[];
  @IsOptional() @IsEnum(ActivityStatus) status?: ActivityStatus;
  @IsOptional() @IsArray() @IsUrl({}, { each: true }) images?: string[];
}

export class UpdateActivityDto {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsString() slug?: string;
  @IsOptional() @IsString() summary?: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsString() destination?: string;
  @IsOptional() @IsString() timezone?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) durationMinutes?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) minAge?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) maxAge?: number;
  @IsOptional() @IsString() accessibility?: string;
  @IsOptional() @IsString() cancellationPolicy?: string;
  @IsOptional() @IsString() meetingPoint?: string;
  @IsOptional() @IsArray() @IsString({ each: true }) pickupOptions?: string[];
  @IsOptional() @IsArray() @IsString({ each: true }) inclusions?: string[];
  @IsOptional() @IsArray() @IsString({ each: true }) exclusions?: string[];
  @IsOptional() @IsEnum(ActivityStatus) status?: ActivityStatus;
  @IsOptional() @IsArray() @IsUrl({}, { each: true }) images?: string[];
}

export class CreateScheduleDto {
  @IsDateString() startsAt!: string;
  @IsDateString() endsAt!: string;
  @Type(() => Number) @IsInt() @Min(1) capacity!: number;
  @IsOptional() isBookable?: boolean;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) cutoffMinutes?: number;
}

export class CreatePricePlanDto {
  @IsString() name!: string;
  @IsString() currency!: string;
  @Type(() => Number) @IsInt() @Min(0) adultMinor!: number;
  @Type(() => Number) @IsInt() @Min(0) childMinor!: number;
  @Type(() => Number) @IsInt() @Min(0) infantMinor!: number;
  @IsOptional() @IsEnum(PricingBasis) basis?: PricingBasis;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) taxPercent?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) commissionPercent?: number;
}

export class CreateBlackoutDto {
  @IsDateString() date!: string;
  @IsOptional() @IsString() reason?: string;
}

export class CreateRecurringScheduleDto {
  @IsDateString() startsOn!: string;
  @IsDateString() endsOn!: string;
  @IsArray() @Type(() => Number) @IsInt({ each: true }) weekdays!: number[];
  @IsString() startTime!: string;
  @Type(() => Number) @IsInt() @Min(1) durationMinutes!: number;
  @Type(() => Number) @IsInt() @Min(1) capacity!: number;
}

export class CreateCategoryDto {
  @IsString() name!: string;
  @IsString() slug!: string;
}

export class CreateDestinationDto {
  @IsString() name!: string;
  @IsString() slug!: string;
  @IsString() timezone!: string;
}

export class CreateVariantDto {
  @IsString() name!: string;
  @IsOptional() @IsString() description?: string;
}

export class CreateCancellationRuleDto {
  @Type(() => Number) @IsInt() @Min(0) hoursBefore!: number;
  @Type(() => Number) @IsInt() @Min(0) @Max(100) refundPercent!: number;
}
