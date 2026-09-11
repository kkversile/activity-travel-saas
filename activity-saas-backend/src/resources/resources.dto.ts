import { Type } from 'class-transformer';
import { IsBoolean, IsEnum, IsInt, IsOptional, IsString, Min } from 'class-validator';
import { ResourceAllocationMode, ResourceType } from '@prisma/client';

export class ResourceDto {
  @IsString() resourceCode!: string;
  @IsString() name!: string;
  @IsEnum(ResourceType) type!: ResourceType;
  @IsEnum(ResourceAllocationMode) allocationMode!: ResourceAllocationMode;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) capacity?: number;
}

export class UpdateResourceDto {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsEnum(ResourceType) type?: ResourceType;
  @IsOptional() @IsEnum(ResourceAllocationMode) allocationMode?: ResourceAllocationMode;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) capacity?: number;
  @IsOptional() @IsBoolean() active?: boolean;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) expectedVersion?: number;
}

export class SessionResourceAllocationDto {
  @IsString() resourceId!: string;
  @Type(() => Number) @IsInt() @Min(1) quantity!: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) expectedVersion?: number;
}
