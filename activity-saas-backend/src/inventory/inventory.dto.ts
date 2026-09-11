import { Type } from 'class-transformer';
import { IsArray, IsDateString, IsEnum, IsInt, IsOptional, IsString, Min, ValidateNested } from 'class-validator';
import { SessionStatus } from '@prisma/client';

export class InventoryQueryDto {
  @IsOptional() @IsString() productId?: string;
  @IsOptional() @IsString() variantId?: string;
  @IsOptional() @IsString() ratePlanId?: string;
  @IsOptional() @IsString() scheduleId?: string;
  @IsOptional() @IsDateString() from?: string;
  @IsOptional() @IsDateString() to?: string;
}

export class InventoryBulkFilterDto {
  @IsString() scheduleTemplateId!: string;
  @IsDateString() dateFrom!: string;
  @IsDateString() dateTo!: string;
  @IsOptional() @IsArray() @IsString({ each: true }) slotTemplateIds?: string[];
}

export class InventoryBulkProposalDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) newTotalCapacity?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) newBlockedCapacity?: number;
  @IsOptional() @IsEnum(SessionStatus) sessionStatus?: SessionStatus;
  @IsOptional() @IsString() statusReason?: string;
}

export class InventoryBulkPreviewDto extends InventoryBulkFilterDto { @ValidateNested() @Type(() => InventoryBulkProposalDto) proposal!: InventoryBulkProposalDto; }

export class InventoryBulkApplyRowDto extends InventoryBulkProposalDto {
  @IsString() sessionId!: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) expectedVersion?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) expectedInventoryVersion?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) expectedSessionVersion?: number;
}

export class InventoryBulkApplyDto {
  @IsString() scheduleTemplateId!: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) expectedScheduleVersion?: number;
  @IsArray() @ValidateNested({ each: true }) @Type(() => InventoryBulkApplyRowDto) rows!: InventoryBulkApplyRowDto[];
}
