import { IsOptional, IsString } from 'class-validator';

export class UpdateVendorDto {
  @IsOptional() @IsString() legalBusinessName?: string;
  @IsOptional() @IsString() operatingCity?: string;
  @IsOptional() @IsString() operatingRegion?: string;
  @IsOptional() @IsString() gstin?: string;
  @IsOptional() @IsString() category?: string;
  @IsOptional() @IsString() payoutAccountMasked?: string;
  @IsOptional() @IsString() payoutAccountHolder?: string;
  @IsOptional() @IsString() payoutBankName?: string;
  @IsOptional() @IsString() payoutBranch?: string;
  @IsOptional() @IsString() payoutIfsc?: string;
  @IsOptional() @IsString() payoutSwift?: string;
  @IsOptional() @IsString() payoutAccountType?: string;
  @IsOptional() @IsString() payoutCurrency?: string;
}
