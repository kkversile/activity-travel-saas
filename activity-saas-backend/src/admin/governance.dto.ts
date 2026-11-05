import 'reflect-metadata';
import { DocumentReviewStatus, ProductType, VendorVerificationStatus } from '@prisma/client';
import { Type } from 'class-transformer';
import { IsArray, IsBoolean, IsDateString, IsEmail, IsEnum, IsIn, IsInt, IsNumber, IsOptional, IsString, Max, MaxLength, Min, MinLength, ValidateNested } from 'class-validator';
import { CreateProductDraftDto } from '../catalogue/catalogue.dto';

export class VendorVerificationDto { @IsEnum(VendorVerificationStatus) status!: VendorVerificationStatus; @IsOptional() @IsString() @MinLength(5) reason?: string; }
export class DocumentReviewDto { @IsEnum(DocumentReviewStatus) status!: DocumentReviewStatus; @IsOptional() @IsString() @MinLength(5) reason?: string; }

export class AgentSuspensionDto { @IsString() @MinLength(5) reason!: string; }
export class CreateAdminDto { @IsString() @MinLength(2) @MaxLength(120) fullName!: string; @IsEmail() @MaxLength(254) email!: string; @IsString() @MinLength(8) @MaxLength(128) password!: string; }
export class CreateVendorDto {
  @IsString() @MinLength(2) @MaxLength(160) vendorName!: string;
  @IsString() @MinLength(2) @MaxLength(120) ownerName!: string;
  @IsString() @MinLength(2) @MaxLength(120) cityName!: string;
  @IsString() @MinLength(7) @MaxLength(32) mobile!: string;
  @IsIn(['DIRECT_OPERATOR', 'ATTRACTION_VENUE', 'AGGREGATOR_DMC', 'GOVERNMENT_BODY']) supplierType!: string;
  @IsEmail() @MaxLength(254) email!: string;
  @IsIn(['COMMISSIONABLE', 'NET_RATE']) commercialModel!: string;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) @Max(100) commissionPercent?: number;
  @IsOptional() @IsString() @MaxLength(120) accountManagerName?: string;
}
export class VendorCommercialChangeDto {
  @IsIn(['NET_RATE', 'COMMISSIONABLE']) supplierModel!: string;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) @Max(100) commissionPercent?: number;
  @IsString() @MinLength(5) @MaxLength(500) reason!: string;
}
export class VendorCommercialReviewDto { @IsOptional() @IsString() @MinLength(5) @MaxLength(500) reason?: string; }
export class CommercialGuardrailConfigurationDto {
  @Type(() => Number) @IsNumber() @Min(0) @Max(100) minimumNetMarginPercent!: number;
  @Type(() => Number) @IsNumber() @Min(0) @Max(20) websiteGatewayFeePercent!: number;
  @Type(() => Number) @IsInt() @Min(1) expectedVersion!: number;
}
export class AdminCreateProductDraftDto extends CreateProductDraftDto {
  @IsString() @MinLength(1) tenantId!: string;
  @IsOptional() @IsIn(['NONE', 'PLUS_ONE', 'PLUS_TWO']) rankingBoost?: string;
  @IsOptional() @IsIn(['USE_PRICING_RULES', 'CUSTOM_RULE']) marginOverride?: string;
  @IsOptional() @IsIn(['PUBLISH_DIRECTLY', 'SEND_TO_QC']) approvalMode?: string;
  @IsOptional() @IsString() internalNote?: string;
}
export class CreatePlatformCouponDto {
  @IsString() @MinLength(3) @MaxLength(40) code!: string;
  @IsString() @MinLength(2) @MaxLength(160) name!: string;
  @IsIn(['PERCENT', 'FIXED']) discountType!: string;
  @IsString() @MinLength(1) discountValue!: string;
  @IsDateString() startsAt!: string;
  @IsDateString() endsAt!: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) maxRedemptions?: number;
}
export class CouponDecisionDto { @IsOptional() @IsString() @MinLength(3) reason?: string; }
export class CouponStatusDto { @IsIn(['PAUSED', 'ACTIVE']) status!: string; }
export class AdminProductListQueryDto {
  @IsOptional() @IsString() search?: string;
  @IsOptional() @IsString() vendorId?: string;
  @IsOptional() @IsString() status?: string;
  @IsOptional() @IsEnum(ProductType) type?: ProductType;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page = 1;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) limit = 25;
}
export class ResetAdminPasswordDto { @IsString() @MinLength(8) @MaxLength(128) password!: string; }
export class UpdateAdminStatusDto { @IsBoolean() active!: boolean; }
export class EligibilityInspectDto {
  @IsString() agentTenantId!: string;
  @IsString() ratePlanId!: string;
  @IsString() sessionId!: string;
  @IsArray() @ValidateNested({ each: true }) @Type(() => EligibilityInspectTravellerDto) travellers!: EligibilityInspectTravellerDto[];
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) units?: number;
  @IsOptional() @IsDateString() now?: string;
}
export class EligibilityInspectTravellerDto { @IsString() travellerType!: string; @Type(() => Number) @IsInt() @Min(0) quantity!: number; }
