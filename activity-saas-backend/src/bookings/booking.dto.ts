import { BookingMode, BookingRecordType, BookingStatus, DistributionChannelType, TravellerType } from '@prisma/client';
import { Type } from 'class-transformer';
import { IsArray, IsBoolean, IsEmail, IsEnum, IsIn, IsInt, IsObject, IsOptional, IsString, IsUUID, Matches, Max, Min, ValidateNested } from 'class-validator';

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
  @IsOptional() @IsString() experienceMasterId?: string;
  @IsOptional() @IsUUID('4') searchAttemptId?: string;
  @IsArray() @ValidateNested({ each: true }) @Type(() => BookingTravellerDetailDto) travellers!: BookingTravellerDetailDto[];
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) units?: number;
  @IsOptional() @IsString() sourceQuoteFingerprint?: string;
  @IsOptional() @IsString() sourceFinalAmount?: string;
  @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => BookingTravellerDetailDto) travellerDetails?: BookingTravellerDetailDto[];
  @IsOptional() @IsObject() pickupDetails?: Record<string, unknown>;
  @IsOptional() @IsObject() bookingAnswers?: Record<string, unknown>;
  @IsOptional() @IsIn(['INDIAN', 'FOREIGN']) visitorCategory?: 'INDIAN' | 'FOREIGN';
  @IsOptional() @IsBoolean() visitorEligibilityVerified?: boolean;
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
  @IsOptional() @IsIn(['REJECTED']) statusGroup?: 'REJECTED';
  @IsOptional() @IsEnum(BookingRecordType) recordType?: BookingRecordType;
  @IsOptional() @IsEnum(BookingMode) bookingMode?: BookingMode;
  @IsOptional() @IsString() vendorTenantId?: string;
  @IsOptional() @IsString() agentTenantId?: string;
  @IsOptional() @Matches(/^\d{4}-\d{2}-\d{2}$/) from?: string;
  @IsOptional() @Matches(/^\d{4}-\d{2}-\d{2}$/) to?: string;
  @IsOptional() @IsString() q?: string;
  @IsOptional() @IsString() channel?: string;
  @IsOptional() @IsEnum(DistributionChannelType) channelType?: DistributionChannelType;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) limit?: number;
}

export class BookingDecisionDto {
  @IsString() reason!: string;
}
