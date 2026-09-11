import { DocumentReviewStatus, VendorVerificationStatus } from '@prisma/client';
import { IsEnum, IsOptional, IsString, MinLength } from 'class-validator';

export class VendorVerificationDto { @IsEnum(VendorVerificationStatus) status!: VendorVerificationStatus; @IsOptional() @IsString() @MinLength(5) reason?: string; }
export class DocumentReviewDto { @IsEnum(DocumentReviewStatus) status!: DocumentReviewStatus; @IsOptional() @IsString() @MinLength(5) reason?: string; }
