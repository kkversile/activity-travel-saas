import { ApiPropertyOptional } from '@nestjs/swagger';
import { BookingMode, TravellerType } from '@prisma/client';
import { Type } from 'class-transformer';
import { IsArray, IsBoolean, IsDateString, IsEnum, IsIn, IsInt, IsOptional, IsString, Matches, Max, Min, ValidateNested } from 'class-validator';

export enum MarketplaceSort { RELEVANCE = 'RELEVANCE', PRICE_ASC = 'PRICE_ASC', PRICE_DESC = 'PRICE_DESC', RATING = 'RATING', EARLIEST_SESSION = 'EARLIEST_SESSION' }

export class EligibilityTravellerDto {
  @IsEnum(TravellerType) travellerType!: TravellerType;
  @Type(() => Number) @IsInt() @Min(0) quantity!: number;
}

export class EligibilityRequestDto {
  @IsString() ratePlanId!: string;
  @IsString() sessionId!: string;
  @IsArray() @ValidateNested({ each: true }) @Type(() => EligibilityTravellerDto) travellers!: EligibilityTravellerDto[];
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) units?: number;
  @ApiPropertyOptional({ description: 'Accepted for privileged diagnostics and deterministic tests only.' })
  @IsOptional() @IsDateString() now?: string;
}

export class MarketplaceSearchDto {
  @IsDateString() @Matches(/^\d{4}-\d{2}-\d{2}$/) serviceDate!: string;
  @IsOptional() @IsString() destination?: string;
  @IsArray() @ValidateNested({ each: true }) @Type(() => EligibilityTravellerDto) travellers!: EligibilityTravellerDto[];
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) units?: number;
  @IsOptional() @IsString() query?: string;
  @IsOptional() @IsString() category?: string;
  @IsOptional() @IsString() subType?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) durationMin?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) durationMax?: number;
  @IsOptional() @Type(() => Number) @Min(0) priceMin?: number;
  @IsOptional() @Type(() => Number) @Min(0) priceMax?: number;
  @IsOptional() @IsEnum(BookingMode) bookingMode?: BookingMode;
  @IsOptional() @IsBoolean() pickupIncluded?: boolean;
  @IsOptional() @Type(() => Number) @Min(0) @Max(5) minRating?: number;
  @IsOptional() @IsIn(['PRIVATE', 'SHARED', 'Private', 'Shared']) privateShared?: string;
  @IsOptional() @IsBoolean() childSuitable?: boolean;
  @IsOptional() @IsEnum(MarketplaceSort) sort?: MarketplaceSort;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(50) limit?: number;
}

export class MarketplaceProductViewDto {
  @IsDateString() @Matches(/^\d{4}-\d{2}-\d{2}$/) serviceDate!: string;
  @IsArray() @ValidateNested({ each: true }) @Type(() => EligibilityTravellerDto) travellers!: EligibilityTravellerDto[];
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) units?: number;
}
