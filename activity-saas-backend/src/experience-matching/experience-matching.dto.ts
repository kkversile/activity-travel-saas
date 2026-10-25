import { ExperienceDisplayMode, OfferSelectionPolicy } from '@prisma/client';
import { IsEnum, IsInt, IsOptional, IsString, Max, Min, MinLength } from 'class-validator';

export class ExperienceProductSearchDto {
  @IsOptional() @IsString() search?: string;
  @IsOptional() @IsString() vendorId?: string;
  @IsOptional() @IsInt() @Min(1) page = 1;
  @IsOptional() @IsInt() @Min(1) @Max(100) limit = 25;
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

export class UpdateExperienceMasterDto {
  @IsOptional() @IsString() @MinLength(2) canonicalName?: string;
  @IsOptional() @IsEnum(ExperienceDisplayMode) displayMode?: ExperienceDisplayMode;
  @IsOptional() @IsEnum(OfferSelectionPolicy) selectionPolicy?: OfferSelectionPolicy;
}
