import { ExperienceDisplayMode, OfferSelectionPolicy } from '@prisma/client';
import { Type } from 'class-transformer';
import { IsBoolean, IsDateString, IsEnum, IsIn, IsInt, IsOptional, IsString, IsUUID, Max, Min, MinLength } from 'class-validator';

export class ExperienceProductSearchDto {
  @IsOptional() @IsString() search?: string;
  @IsOptional() @IsString() vendorId?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page = 1;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) limit = 25;
}

export class CreateExperienceMasterDto {
  @IsString() @MinLength(2) canonicalName!: string;
  @IsString() productId!: string;
  @IsOptional() @IsEnum(ExperienceDisplayMode) displayMode?: ExperienceDisplayMode;
  @IsOptional() @IsEnum(OfferSelectionPolicy) selectionPolicy?: OfferSelectionPolicy;
}

export class LinkExperienceProductDto {
  @IsString() productId!: string;
  @IsOptional() @IsString() reason?: string;
  @IsOptional() @IsInt() priority?: number;
}

export class PinExperienceProductDto {
  @IsString() productId!: string;
  @IsOptional() @IsString() productVariantId?: string;
  @IsBoolean() pinned!: boolean;
  @IsOptional() @IsDateString() pinnedUntil?: string;
  @IsOptional() @IsString() reason?: string;
}

export class MapMasterOptionDto {
  @IsString() @MinLength(1) productVariantId!: string;
  @IsString() @MinLength(1) targetMasterOptionId!: string;
}

export class DecideExperienceSuggestionDto {
  @IsIn(['ACCEPT', 'REJECT']) decision!: 'ACCEPT' | 'REJECT';
  @IsOptional() @IsString() canonicalName?: string;
}

export class UpdateExperienceMasterDto {
  @IsOptional() @IsString() @MinLength(2) canonicalName?: string;
  @IsOptional() @IsEnum(ExperienceDisplayMode) displayMode?: ExperienceDisplayMode;
  @IsOptional() @IsEnum(OfferSelectionPolicy) selectionPolicy?: OfferSelectionPolicy;
}

export class UpdateExperienceSelectionRulesDto {
  @IsOptional() @IsIn(['GLOBAL', 'VOYA_WEB', 'VOYA_AGENT', 'VOYA_API']) scope?: string;
  @IsOptional() @IsIn(['MARGIN', 'LOWEST_PRICE']) objective?: string;
  @IsOptional() @IsInt() @Min(0) @Max(100) priceWeight?: number;
  @IsOptional() @IsInt() @Min(0) @Max(100) ratingWeight?: number;
  @IsOptional() @IsInt() @Min(0) @Max(100) reliabilityWeight?: number;
  @IsOptional() @IsInt() @Min(0) @Max(100) inventoryWeight?: number;
  @IsOptional() @IsInt() @Min(0) @Max(100) contractWeight?: number;
  @IsOptional() @IsBoolean() autoFailover?: boolean;
  @IsOptional() @IsIn(['LOWER_OF_50_OR_5_PERCENT', '100', 'NEVER']) absorbPriceGap?: string;
  @IsOptional() @IsInt() @IsIn([10, 15, 30]) lockMinutes?: number;
  @IsOptional() @IsIn(['WINNER_TAKES_ALL', 'SPLIT_70_30', 'ROUND_ROBIN']) allocation?: string;
  @IsOptional() @IsBoolean() submitForApproval?: boolean;
}

export class ExperiencePreviewQueryDto {
  @IsOptional() @IsDateString() serviceDate?: string;
  @IsOptional() @IsIn(['WEB', 'AGENT', 'API']) channel: string = 'WEB';
  @IsOptional() @IsUUID() agentTenantId?: string;
}
