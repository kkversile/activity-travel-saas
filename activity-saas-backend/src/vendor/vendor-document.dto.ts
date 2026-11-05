import { DocumentReviewStatus } from '@prisma/client';
import { IsEnum, IsOptional, IsString, MinLength } from 'class-validator';

export const documentKeyMap = {
  gstin: 'GSTIN',
  pan: 'PAN',
  bankProof: 'BANK_PROOF',
  tradeLicense: 'TRADE_LICENSE',
  llpAgreement: 'LLP_AGREEMENT',
  llpinCertificate: 'LLPIN_CERTIFICATE',
  signatoryId: 'AUTH_SIGNATORY_ID',
  authorizationLetter: 'AUTHORIZATION_LETTER',
  addressProof: 'ADDRESS_PROOF',
  udyamCertificate: 'UDYAM_CERTIFICATE',
  tourismRegistration: 'TOURISM_REGISTRATION',
  vehiclePermit: 'VEHICLE_PERMIT',
  publicLiabilityInsurance: 'PUBLIC_LIABILITY_INSURANCE',
  boatLicense: 'BOAT_LICENSE',
  adventureWaterSportsLicense: 'ADVENTURE_WATER_SPORTS_LICENSE',
  fssaiLicense: 'FSSAI_LICENSE',
} as const;
export type DocumentKey = keyof typeof documentKeyMap;

export class ReviewDocumentDto {
  @IsEnum(DocumentReviewStatus) status!: DocumentReviewStatus;
  @IsOptional() @IsString() @MinLength(5) reason?: string;
}
