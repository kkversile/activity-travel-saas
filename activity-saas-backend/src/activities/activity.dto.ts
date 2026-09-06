import { ActivityStatus, MediaKind, ProductType } from '@prisma/client';
import { Type } from 'class-transformer';
import { IsArray, IsBoolean, IsEnum, IsInt, IsNumber, IsObject, IsOptional, IsString, IsUrl, Max, Min } from 'class-validator';

export class CreateActivityDto {
  @IsString() productName!: string;
  @IsEnum(ProductType) type!: ProductType;
  @IsString() subType!: string;
  @IsString() description!: string;
  @IsOptional() @IsString() shortDescription?: string;
  @IsOptional() @IsArray() @IsString({ each: true }) terms?: string[];
  @IsOptional() @IsArray() faqs?: Array<{ question: string; answer: string }>;
  @IsOptional() @IsArray() @IsString({ each: true }) highlights?: string[];
  @IsOptional() @IsArray() @IsString({ each: true }) channels?: string[];
  @IsOptional() @Type(() => Number) @IsNumber() highlightedPriority?: number;
  @IsOptional() @IsBoolean() isHotelLinked?: boolean;
  @IsOptional() @IsArray() @IsString({ each: true }) attachedHotelIds?: string[];
  @IsOptional() @IsArray() @IsString({ each: true }) howToRedeem?: string[];
  @IsOptional() @IsString() subCategory?: string;
  @IsOptional() @IsArray() @IsString({ each: true }) persuasions?: string[];
  @IsOptional() @IsArray() @IsString({ each: true }) labels?: string[];
  @IsOptional() @Type(() => Number) @IsNumber() rank?: number;
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
}

export class UpdateActivityDto {
  @IsOptional() @IsString() productName?: string;
  @IsOptional() @IsEnum(ProductType) type?: ProductType;
  @IsOptional() @IsString() subType?: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsString() seoTitle?: string;
  @IsOptional() @IsString() seoDescription?: string;
  @IsOptional() @IsString() shortDescription?: string;
  @IsOptional() @IsArray() @IsString({ each: true }) terms?: string[];
  @IsOptional() @IsArray() faqs?: Array<{ question: string; answer: string }>;
  @IsOptional() @IsArray() @IsString({ each: true }) highlights?: string[];
  @IsOptional() @IsArray() @IsString({ each: true }) channels?: string[];
  @IsOptional() @Type(() => Number) @IsNumber() highlightedPriority?: number;
  @IsOptional() @IsBoolean() isHotelLinked?: boolean;
  @IsOptional() @IsArray() @IsString({ each: true }) attachedHotelIds?: string[];
  @IsOptional() @IsArray() @IsString({ each: true }) howToRedeem?: string[];
  @IsOptional() @IsString() subCategory?: string;
  @IsOptional() @IsArray() @IsString({ each: true }) persuasions?: string[];
  @IsOptional() @IsArray() @IsString({ each: true }) labels?: string[];
  @IsOptional() @Type(() => Number) @IsNumber() rank?: number;
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
  @IsOptional() @IsString() cityName?: string;
  @IsOptional() @IsString() countryName?: string;
  @IsOptional() @IsString() stateName?: string;
  @IsOptional() @IsObject() sourcePayload?: Record<string, unknown>;
}

export class ActivityQueryDto {
  @IsOptional() @IsEnum(ActivityStatus) status?: ActivityStatus;
  @IsOptional() @IsString() search?: string;
}

export class ActivityMediaDto {
  @IsEnum(MediaKind) kind!: MediaKind;
  @IsUrl() url!: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsString() seoTitle?: string;
  @IsOptional() @IsString() seoDescription?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) rank?: number;
}

export class ActivityMediaUploadDto {
  @IsEnum(MediaKind) kind!: MediaKind;
  @IsString() fileName!: string;
  @IsString() dataUrl!: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsString() seoTitle?: string;
  @IsOptional() @IsString() seoDescription?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) rank?: number;
}

export class UpdateActivityMediaDto {
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsString() seoTitle?: string;
  @IsOptional() @IsString() seoDescription?: string;
}

export class BulkUpdateActivityMediaDto {
  @IsArray() media!: Array<{ id: string; description?: string; seoTitle?: string; seoDescription?: string }>;
}
