import { Type } from 'class-transformer';
import { IsArray, IsBoolean, IsDateString, IsEnum, IsInt, IsOptional, IsString, Matches, Min, ValidateNested } from 'class-validator';
import { CapacityUnit, OperatingModel, ResourceType } from '@prisma/client';

export class ScheduleSlotDto {
  @IsString() slotCode!: string;
  @IsOptional() @IsString() label?: string;
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/) startTime!: string;
  @IsOptional() @Matches(/^([01]\d|2[0-3]):[0-5]\d$/) endTime?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) rank?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) expectedVersion?: number;
}

export class CreateScheduleDto {
  @IsString() scheduleCode!: string;
  @IsString() name!: string;
  @IsOptional() @IsEnum(OperatingModel) operatingModel?: OperatingModel;
  @IsString() timezone!: string;
  @IsDateString() effectiveFrom!: string;
  @IsOptional() @IsDateString() effectiveTo?: string;
  @IsArray() @IsString({ each: true }) operatingDays!: string[];
  @IsEnum(CapacityUnit) capacityUnit!: CapacityUnit;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) defaultCapacity?: number;
  @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => ScheduleSlotDto) slots?: ScheduleSlotDto[];
}

export class UpdateScheduleDto {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsEnum(OperatingModel) operatingModel?: OperatingModel;
  @IsOptional() @IsString() timezone?: string;
  @IsOptional() @IsDateString() effectiveFrom?: string;
  @IsOptional() @IsDateString() effectiveTo?: string;
  @IsOptional() @IsArray() @IsString({ each: true }) operatingDays?: string[];
  @IsOptional() @IsEnum(CapacityUnit) capacityUnit?: CapacityUnit;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) defaultCapacity?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) expectedVersion?: number;
  @IsOptional() @IsBoolean() confirmCapacityUnit?: boolean;
}

export class ScheduleVersionDto {
  @Type(() => Number) @IsInt() @Min(1) expectedVersion!: number;
}

export class UpdateScheduleSlotDto {
  @IsOptional() @IsString() label?: string;
  @IsOptional() @Matches(/^([01]\d|2[0-3]):[0-5]\d$/) startTime?: string;
  @IsOptional() @Matches(/^([01]\d|2[0-3]):[0-5]\d$/) endTime?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) rank?: number;
  @IsOptional() @IsBoolean() active?: boolean;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) expectedVersion?: number;
}

export class RatePlanScheduleDto {
  @IsString() ratePlanId!: string;
  @Type(() => Number) @IsInt() @Min(1) expectedVersion!: number;
}

export class ScheduleExceptionDto {
  @IsDateString() serviceDate!: string;
  @IsOptional() @IsString() slotTemplateId?: string;
  @IsEnum(['BLACKOUT', 'CLOSED']) type!: 'BLACKOUT' | 'CLOSED';
  @IsString() reason!: string;
  @Type(() => Number) @IsInt() @Min(1) expectedVersion!: number;
}

export class MaterializeSessionsDto {
  @IsDateString() dateFrom!: string;
  @IsDateString() dateTo!: string;
  @Type(() => Number) @IsInt() @Min(1) expectedVersion!: number;
}

export class ResourceRequirementDto {
  @IsEnum(ResourceType) resourceType!: ResourceType;
  @IsOptional() @IsString() specificResourceId?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) quantity?: number;
  @IsOptional() @IsBoolean() required?: boolean;
  @Type(() => Number) @IsInt() @Min(1) expectedVersion!: number;
}

export class UpdateResourceRequirementDto {
  @IsOptional() @IsEnum(ResourceType) resourceType?: ResourceType;
  @IsOptional() @IsString() specificResourceId?: string | null;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) quantity?: number;
  @IsOptional() @IsBoolean() required?: boolean;
  @Type(() => Number) @IsInt() @Min(1) expectedVersion!: number;
}
