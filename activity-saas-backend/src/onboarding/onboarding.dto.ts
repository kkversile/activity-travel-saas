import { VendorGstStatus, VendorOnboardingStatus } from '@prisma/client';
import { IsBoolean, IsEnum, IsInt, IsOptional, IsString, Max, MaxLength, Min, MinLength } from 'class-validator';

export class UpdateOnboardingDto {
  @IsOptional() @IsBoolean() started?: boolean;
  @IsOptional() @IsInt() @Min(1) @Max(6) currentStep?: number;
  @IsOptional() @IsString() @MaxLength(80) firstName?: string;
  @IsOptional() @IsString() @MaxLength(80) lastName?: string;
  @IsOptional() @IsString() @MaxLength(20) contactNumber?: string;
  @IsOptional() @IsString() @MaxLength(160) businessDisplayName?: string;
  @IsOptional() @IsString() @MaxLength(160) legalBusinessName?: string;
  @IsOptional() @IsString() @MaxLength(10) panNumber?: string;
  @IsOptional() @IsEnum(VendorGstStatus) gstStatus?: VendorGstStatus;
  @IsOptional() @IsString() @MaxLength(15) gstin?: string;
  @IsOptional() @IsBoolean() gstDeclarationAccepted?: boolean;
  @IsOptional() @IsString() @MaxLength(240) addressLine?: string;
  @IsOptional() @IsString() @MaxLength(80) city?: string;
  @IsOptional() @IsString() @MaxLength(80) state?: string;
  @IsOptional() @IsString() @MaxLength(6) pinCode?: string;
  @IsOptional() @IsString() @MaxLength(12) latitude?: string;
  @IsOptional() @IsString() @MaxLength(12) longitude?: string;
  @IsOptional() @IsString() @MaxLength(160) accountHolderName?: string;
  @IsOptional() @IsString() @MaxLength(160) bankName?: string;
  @IsOptional() @IsString() @MaxLength(30) bankAccountNumber?: string;
  @IsOptional() @IsString() @MaxLength(11) ifscCode?: string;
  @IsOptional() @IsString() @MaxLength(20) accountType?: string;
  @IsOptional() @IsBoolean() bankOwnershipConfirmed?: boolean;
  @IsOptional() @IsString() @MaxLength(80) authorizedBusinessName?: string;
  @IsOptional() @IsString() @MaxLength(120) authorizedRepresentative?: string;
  @IsOptional() @IsString() @MaxLength(2_000_000) signatureData?: string;
  @IsOptional() @IsString() @MaxLength(80) agreementVersion?: string;
  @IsOptional() @IsBoolean() agreementAccepted?: boolean;
}

export class RequestOtpDto {
  @IsString() @MinLength(10) @MaxLength(16) contactNumber!: string;
}

export class VerifyOtpDto {
  @IsString() @MinLength(6) @MaxLength(6) otp!: string;
}

export class ReviewOnboardingDto {
  @IsEnum(VendorOnboardingStatus) status!: VendorOnboardingStatus;
  @IsOptional() @IsString() @MaxLength(500) reason?: string;
}
