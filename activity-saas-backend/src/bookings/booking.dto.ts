import { BookingMode, BookingStatus, TravellerType } from '@prisma/client';
import { Type } from 'class-transformer';
import { IsArray, IsBoolean, IsEmail, IsEnum, IsInt, IsObject, IsOptional, IsString, Matches, Min, ValidateNested } from 'class-validator';

export class BookingTravellerDetailDto {
  @IsEnum(TravellerType) travellerType!: TravellerType;
  @Type(() => Number) @IsInt() @Min(1) quantity = 1;
  @IsOptional() @IsString() fullName?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) age?: number;
  @IsOptional() @IsEmail() email?: string;
  @IsOptional() @IsString() phone?: string;
  @IsOptional() @IsBoolean() isLead?: boolean;
  @IsOptional() @IsObject() answers?: Record<string, unknown>;
}

export class BookingPreviewDto {
  @IsString() ratePlanId!: string;
  @IsString() sessionId!: string;
  @IsArray() @ValidateNested({ each: true }) @Type(() => BookingTravellerDetailDto) travellers!: BookingTravellerDetailDto[];
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) units?: number;
  @IsOptional() @IsString() sourceQuoteFingerprint?: string;
  @IsOptional() @IsString() sourceFinalAmount?: string;
  @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => BookingTravellerDetailDto) travellerDetails?: BookingTravellerDetailDto[];
  @IsOptional() @IsObject() pickupDetails?: Record<string, unknown>;
  @IsOptional() @IsObject() bookingAnswers?: Record<string, unknown>;
}

export class BookingCreateDto extends BookingPreviewDto {
  @IsString() expectedQuoteFingerprint!: string;
  @IsString() expectedCancellationPolicyFingerprint!: string;
  @IsString() expectedContextFingerprint!: string;
  @IsBoolean() priceChangeAcknowledged = false;
  @IsBoolean() cancellationPolicyAcknowledged = false;
  @IsString() customerName!: string;
  @IsOptional() @IsEmail() customerEmail?: string;
}

export class BookingListQueryDto {
  @IsOptional() @IsEnum(BookingStatus) status?: BookingStatus;
  @IsOptional() @IsEnum(BookingMode) bookingMode?: BookingMode;
  @IsOptional() @IsString() vendorTenantId?: string;
  @IsOptional() @IsString() agentTenantId?: string;
  @IsOptional() @Matches(/^\d{4}-\d{2}-\d{2}$/) from?: string;
  @IsOptional() @Matches(/^\d{4}-\d{2}-\d{2}$/) to?: string;
}

export class BookingDecisionDto {
  @IsString() reason!: string;
}
