import { Transform, Type } from "class-transformer";
import { IsArray, IsBoolean, IsDateString, IsEnum, IsInt, IsOptional, IsString, IsUUID, IsUrl, Max, Min } from "class-validator";
import { ActivityStatus, PricingBasis } from "@prisma/client";

export class CreateActivityDto {
  @IsString() name!: string;
  @IsString() slug!: string;
  @IsString() summary!: string;
  @IsString() description!: string;
  @IsString() destination!: string;
  @IsOptional() @IsUUID() categoryId?: string;
  @IsOptional() @IsUUID() destinationId?: string;
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

export class ActivityQueryDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page = 1;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) pageSize = 25;
  @IsOptional() @IsString() search?: string;
  @IsOptional() @IsEnum(ActivityStatus) status?: ActivityStatus;
  @IsOptional() @IsString() categoryId?: string;
  @IsOptional() @IsString() destinationId?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) minDuration?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) maxDuration?: number;
  @IsOptional() @Transform(({ value }) => value === true || value === "true" ? true : value === false || value === "false" ? false : value) @IsBoolean() hasActiveSchedule?: boolean;
  @IsOptional() @IsDateString() createdFrom?: string;
  @IsOptional() @IsDateString() createdTo?: string;
  @IsOptional() @IsDateString() publishedFrom?: string;
  @IsOptional() @IsDateString() publishedTo?: string;
  @IsOptional() @IsEnum(["name", "createdAt", "updatedAt", "publishedAt", "status", "destination"] as const) sortBy = "name";
  @IsOptional() @IsEnum(["asc", "desc"] as const) sortOrder: "asc" | "desc" = "asc";
}

export class UpdateActivityDto {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsString() slug?: string;
  @IsOptional() @IsString() summary?: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsString() destination?: string;
  @IsOptional() @IsUUID() categoryId?: string;
  @IsOptional() @IsUUID() destinationId?: string;
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

export class ActivityStatusDto { @IsEnum(ActivityStatus) status!: ActivityStatus; }

export class CreateScheduleDto {
  @IsOptional() @IsString() variantId?: string;
  @IsDateString() startsAt!: string;
  @IsDateString() endsAt!: string;
  @Type(() => Number) @IsInt() @Min(1) capacity!: number;
  @IsOptional() isBookable?: boolean;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) cutoffMinutes?: number;
}

export class CreatePricePlanDto {
  @IsOptional() @IsString() variantId?: string;
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
