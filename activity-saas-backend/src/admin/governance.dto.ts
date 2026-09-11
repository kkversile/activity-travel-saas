import 'reflect-metadata';
import { DocumentReviewStatus, VendorVerificationStatus } from '@prisma/client';
import { Type } from 'class-transformer';
import { IsArray, IsDateString, IsEnum, IsInt, IsOptional, IsString, Min, MinLength, ValidateNested } from 'class-validator';

export class VendorVerificationDto { @IsEnum(VendorVerificationStatus) status!: VendorVerificationStatus; @IsOptional() @IsString() @MinLength(5) reason?: string; }
export class DocumentReviewDto { @IsEnum(DocumentReviewStatus) status!: DocumentReviewStatus; @IsOptional() @IsString() @MinLength(5) reason?: string; }

export class AgentSuspensionDto { @IsString() @MinLength(5) reason!: string; }
export class EligibilityInspectDto {
  @IsString() agentTenantId!: string;
  @IsString() ratePlanId!: string;
  @IsString() sessionId!: string;
  @IsArray() @ValidateNested({ each: true }) @Type(() => EligibilityInspectTravellerDto) travellers!: EligibilityInspectTravellerDto[];
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) units?: number;
  @IsOptional() @IsDateString() now?: string;
}
export class EligibilityInspectTravellerDto { @IsString() travellerType!: string; @Type(() => Number) @IsInt() @Min(0) quantity!: number; }
