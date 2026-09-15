import { BookingQuestionType, EvidenceMatchMode, FulfilmentEvidenceKind, FulfilmentMode, MeetingModel, MediaKind, ProductRevisionStatus, ProductType } from '@prisma/client';
import { Type } from 'class-transformer';
import { OmitType, PartialType } from '@nestjs/swagger';
import { IsArray, IsBoolean, IsDefined, IsEnum, IsInt, IsNumber, IsObject, IsOptional, IsString, IsUrl, Max, Min, MinLength, ValidateNested } from 'class-validator';

export class ProductFulfilmentPolicyDto {
  @IsOptional() @IsEnum(FulfilmentMode) mode?: FulfilmentMode;
  @IsOptional() @IsArray() @IsEnum(FulfilmentEvidenceKind, { each: true }) requiredEvidenceKinds?: FulfilmentEvidenceKind[];
  @IsOptional() @IsEnum(EvidenceMatchMode) evidenceMatchMode?: EvidenceMatchMode;
  @IsOptional() @IsBoolean() reviewRequired?: boolean;
  @IsOptional() @IsString() emergencyContactName?: string;
  @IsOptional() @IsString() emergencyContactPhone?: string;
  @IsOptional() @IsString() emergencyContactEmail?: string;
  @IsOptional() @IsString() operationsContactName?: string;
  @IsOptional() @IsString() operationsContactPhone?: string;
  @IsOptional() @IsString() operationsContactEmail?: string;
  @IsOptional() @IsArray() @IsString({ each: true }) voucherNotes?: string[];
}

export class ProductRevisionDto {
  @IsString() productName!: string;
  @IsEnum(ProductType) type!: ProductType;
  @IsString() subType!: string;
  @IsOptional() @IsEnum(MeetingModel) meetingModel?: MeetingModel;
  @IsOptional() @IsString() meetingPoint?: string;
  @IsString() description!: string;
  @IsOptional() @IsString() shortDescription?: string;
  @IsOptional() @IsArray() @IsString({ each: true }) terms?: string[];
  @IsOptional() @IsArray() faqs?: Array<{ question: string; answer: string }>;
  @IsOptional() @IsArray() @IsString({ each: true }) highlights?: string[];
  @IsOptional() @Type(() => Number) @IsInt() highlightedPriority?: number;
  @IsOptional() @IsBoolean() isHotelLinked?: boolean;
  @IsOptional() @IsArray() @IsString({ each: true }) attachedHotelIds?: string[];
  @IsOptional() @IsArray() @IsString({ each: true }) howToRedeem?: string[];
  @IsOptional() @IsString() subCategory?: string;
  @IsOptional() @IsArray() @IsString({ each: true }) persuasions?: string[];
  @IsOptional() @IsArray() @IsString({ each: true }) labels?: string[];
  @IsOptional() @Type(() => Number) @IsInt() rank?: number;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) @Max(5) starRating?: number;
  @IsOptional() @IsArray() @IsString({ each: true }) safetyMeasures?: string[];
  @IsOptional() @IsArray() @IsString({ each: true }) importantInfo?: string[];
  @IsOptional() @IsArray() @IsString({ each: true }) thingsToCarry?: string[];
  @IsOptional() @IsArray() @IsString({ each: true }) additionalInfo?: string[];
  @IsOptional() @IsString() metaname?: string;
  @IsOptional() @IsString() cityCode?: string;
  @IsOptional() @Type(() => Number) @IsNumber() lat?: number;
  @IsOptional() @Type(() => Number) @IsNumber() lon?: number;
  @IsOptional() @IsString() address?: string;
  @IsString() cityName!: string;
  @IsString() countryName!: string;
  @IsString() stateName!: string;
  @IsOptional() @IsObject() sourcePayload?: Record<string, unknown>;
  @IsOptional() @ValidateNested() @Type(() => ProductFulfilmentPolicyDto) fulfilmentPolicy?: ProductFulfilmentPolicyDto;
}

export class UpdateProductRevisionDto extends PartialType(ProductRevisionDto) {
  @IsOptional() @ValidateNested() @Type(() => ProductFulfilmentPolicyDto) fulfilmentPolicy?: ProductFulfilmentPolicyDto;
}

export class CreateProductDto {
  @IsString() productCode!: string;
  @IsDefined() @ValidateNested() @Type(() => ProductRevisionDto) initialRevision!: ProductRevisionDto;
}

export class CreateProductDraftDto {
  @IsString() @MinLength(2) productName!: string;
  @IsEnum(ProductType) type!: ProductType;
  @IsString() @MinLength(2) subType!: string;
  @IsOptional() @IsString() subCategory?: string;
  @IsOptional() @IsString() shortDescription?: string;
  @IsOptional() @IsString() cityName?: string;
  @IsOptional() @IsString() stateName?: string;
  @IsOptional() @IsString() countryName?: string;
  @IsOptional() @IsEnum(MeetingModel) meetingModel?: MeetingModel;
  @IsOptional() @IsString() meetingPoint?: string;
}

export class CreateProductRevisionDto {
  @IsOptional() @IsString() sourceRevisionId?: string;
}

export class BookingQuestionDto {
  @IsString() code!: string;
  @IsString() label!: string;
  @IsOptional() @IsString() helpText?: string;
  @IsEnum(BookingQuestionType) type!: BookingQuestionType;
  @IsOptional() @IsBoolean() required?: boolean;
  @IsOptional() @IsArray() options?: unknown[];
  @IsOptional() @IsBoolean() appliesPerTraveller?: boolean;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) rank?: number;
}

export class UpdateBookingQuestionDto extends PartialType(BookingQuestionDto) {}

export class ProductQueryDto {
  @IsOptional() @IsEnum(ProductRevisionStatus) revisionStatus?: ProductRevisionStatus;
  @IsOptional() @IsString() search?: string;
}

export type ListingStatusFilter = 'LIVE' | 'REVIEW' | 'DRAFT';

export class ProductListingQueryDto {
  @IsOptional() @IsString() search?: string;
  @IsOptional() @IsEnum(['LIVE', 'REVIEW', 'DRAFT'] as const) status?: ListingStatusFilter;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page = 1;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) limit = 25;
}

export class ProductMediaDto {
  @IsEnum(MediaKind) kind!: MediaKind;
  @IsOptional() @IsUrl() externalUrl?: string;
  @IsOptional() @IsString() fileAssetId?: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsString() seoTitle?: string;
  @IsOptional() @IsString() seoDescription?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) rank?: number;
}

export class ProductMediaUploadDto {
  @IsEnum(MediaKind) kind!: MediaKind;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsString() seoTitle?: string;
  @IsOptional() @IsString() seoDescription?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) rank?: number;
}

export class UpdateProductMediaRankDto {
  @Type(() => Number) @IsInt() @Min(1) rank!: number;
}

export class VariantDto {
  @IsString() variantCode!: string;
  @IsString() name!: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) durationMinutes?: number;
  @IsOptional() @IsString() privateShared?: string;
  @IsOptional() @IsString() vehicleType?: string;
  @IsOptional() @IsBoolean() pickupIncluded?: boolean;
  @IsOptional() @IsString() pickupType?: string;
  @IsOptional() @IsString() pickupInput?: string;
  @IsOptional() @IsString() pickupTimings?: string;
  @IsOptional() @IsBoolean() dropoffIncluded?: boolean;
  @IsOptional() @IsString() dropoffTimings?: string;
  @IsOptional() @IsBoolean() mealIncluded?: boolean;
  @IsOptional() @IsString() mealType?: string;
  @IsOptional() @IsArray() @IsString({ each: true }) menu?: string[];
  @IsOptional() @IsString() mealVariety?: string;
  @IsOptional() @IsArray() @IsString({ each: true }) pointsOfInterest?: string[];
  @IsOptional() @IsArray() @IsString({ each: true }) inclusions?: string[];
  @IsOptional() @IsArray() @IsString({ each: true }) exclusions?: string[];
  @IsOptional() @IsArray() @IsString({ each: true }) suitableFor?: string[];
  @IsOptional() @IsObject() sourcePayload?: Record<string, unknown>;
}

export class UpdateVariantDto extends PartialType(OmitType(VariantDto, ['variantCode'] as const)) {
  @IsDefined() @Type(() => Number) @IsInt() @Min(1) expectedVersion!: number;
}

export class ArchiveVariantDto {
  @IsDefined() @Type(() => Number) @IsInt() @Min(1) expectedVersion!: number;
}

export class RejectProductRevisionDto { @IsString() @MinLength(5) reason!: string; }
