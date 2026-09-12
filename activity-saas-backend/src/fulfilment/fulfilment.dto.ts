import { BookingFulfilmentStatus, EvidenceMatchMode, FulfilmentEvidenceKind, FulfilmentMode, VoucherGenerationStatus, VoucherShareChannel } from '@prisma/client';
import { Transform } from 'class-transformer';
import { IsBoolean, IsDateString, IsEmail, IsEnum, IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';

export class FulfilmentQueryDto {
  @IsOptional() @IsEnum(BookingFulfilmentStatus) status?: BookingFulfilmentStatus;
  @IsOptional() @IsEnum(VoucherGenerationStatus) generationStatus?: VoucherGenerationStatus;
  @IsOptional() @IsEnum(FulfilmentMode) mode?: FulfilmentMode;
  @IsOptional() @IsDateString() serviceDate?: string;
  @IsOptional() @IsString() vendorTenantId?: string;
}

export class ReferenceEvidenceDto {
  @IsString() @MinLength(1) @MaxLength(200) referenceValue!: string;
  @IsOptional() @IsBoolean() travellerVisible?: boolean;
}

export class EvidenceReplaceDto extends ReferenceEvidenceDto {
  @IsEnum(FulfilmentEvidenceKind) kind!: FulfilmentEvidenceKind;
}

export class EvidenceUploadDto {
  @IsOptional() @Transform(({ value }) => value === true || value === 'true' ? true : value === false || value === 'false' ? false : value)
  @IsBoolean() travellerVisible?: boolean;
}

export class VoucherShareDto {
  @IsEnum(VoucherShareChannel) channel!: VoucherShareChannel;
  @IsOptional() @IsString() @MaxLength(200) recipient?: string;
}

export class CompleteBookingDto {
  @IsOptional() @IsString() @MaxLength(500) reason?: string;
}
