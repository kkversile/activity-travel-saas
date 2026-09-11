import { DocumentReviewStatus } from '@prisma/client';
import { IsEnum, IsOptional, IsString, MinLength } from 'class-validator';

export const documentKeyMap = { gstin: 'GSTIN', pan: 'PAN', bankProof: 'BANK_PROOF', tradeLicense: 'TRADE_LICENSE' } as const;
export type DocumentKey = keyof typeof documentKeyMap;

export class ReviewDocumentDto {
  @IsEnum(DocumentReviewStatus) status!: DocumentReviewStatus;
  @IsOptional() @IsString() @MinLength(5) reason?: string;
}
