import { IsArray, IsIn, IsObject, IsOptional, IsString, MaxLength, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

export class ActivityAiGenerateDto {
  @IsString() @MaxLength(160) activityName!: string;
  @IsOptional() @IsString() @MaxLength(80) city?: string;
  @IsOptional() @IsString() @MaxLength(80) state?: string;
  @IsOptional() @IsString() @MaxLength(80) country?: string;
  @IsOptional() @IsString() @MaxLength(100) category?: string;
  @IsOptional() @IsString() @MaxLength(80) language?: string;
  @IsOptional() @IsString() @MaxLength(2000) vendorNotes?: string;
  @IsOptional() @IsIn(['FILL_MISSING', 'REFRESH_DESCRIPTION']) mode?: 'FILL_MISSING' | 'REFRESH_DESCRIPTION';
  @IsOptional() @IsArray() @IsString({ each: true }) @MaxLength(80, { each: true }) selectedFields?: string[];
}
export class ActivityAiValidateDto { @IsObject() draft!: Record<string, unknown>; }
export class ActivityAiPrepareImportDto { @IsObject() draft!: Record<string, unknown>; @IsOptional() @IsObject() supplierData?: Record<string, unknown>; }
export class ActivityAiAcceptDto { @IsString() @IsIn(['description', 'highlights', 'important_information', 'things_to_carry', 'safety_measures', 'terms', 'how_to_redeem', 'additional_information', 'option']) field!: string; @IsOptional() @IsString() @MaxLength(10000) value?: string; @IsOptional() @IsArray() @IsString({ each: true }) values?: string[]; @IsOptional() @IsObject() option?: Record<string, unknown>; }
export class ActivityAiReviewDto {
  @IsObject() draft!: Record<string, unknown>;
  @IsOptional() @IsObject() provenance?: Record<string, unknown>;
  @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => ActivityAiAcceptDto) acceptedChanges?: ActivityAiAcceptDto[];
  @IsOptional() @IsArray() @IsString({ each: true }) @MaxLength(100, { each: true }) acceptedFields?: string[];
  @IsOptional() @IsArray() @IsString({ each: true }) @MaxLength(100, { each: true }) rejectedFields?: string[];
  @IsOptional() @IsArray() @IsString({ each: true }) @MaxLength(100, { each: true }) modifiedFields?: string[];
}
export class ActivityAiSaveDraftDto extends ActivityAiReviewDto { @IsString() @MaxLength(120) generationId!: string; }
export class ActivityAiCompleteImportDto extends ActivityAiReviewDto {
  @IsString() @MaxLength(120) generationId!: string;
  @IsObject() supplierData!: Record<string, unknown>;
}
