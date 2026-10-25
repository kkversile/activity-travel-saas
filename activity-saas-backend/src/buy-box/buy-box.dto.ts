import { ExperienceDisplayMode, OfferSelectionPolicy } from '@prisma/client';
import { Type } from 'class-transformer';
import { IsDateString, IsEnum, IsNumber, IsOptional, IsString, Min } from 'class-validator';

export enum BuyBoxAdminStatus {
  CLOSED = 'CLOSED',
  OPEN = 'OPEN',
  SUSPENDED = 'SUSPENDED',
}

export enum BuyBoxAdminSelectionPolicy {
  CHEAPEST = 'CHEAPEST',
  HIGHEST_BID = 'HIGHEST_BID',
  BALANCED = 'BALANCED',
  ADMIN_SELECTED = 'ADMIN_SELECTED',
}

export class UpsertBuyBoxDto {
  @IsString() experienceMasterId!: string;
  @IsOptional() @IsEnum(BuyBoxAdminStatus) status?: BuyBoxAdminStatus;
  @IsOptional() @IsEnum(ExperienceDisplayMode) displayMode?: ExperienceDisplayMode;
  @IsOptional() @IsEnum(BuyBoxAdminSelectionPolicy) selectionPolicy?: BuyBoxAdminSelectionPolicy;
  @IsOptional() @IsEnum(OfferSelectionPolicy) fallbackPolicy?: OfferSelectionPolicy;
  @IsOptional() @IsString() currency?: string;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) minimumBidAmount?: number;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) minimumBidIncrement?: number;
  @IsOptional() @IsDateString() startsAt?: string;
  @IsOptional() @IsDateString() endsAt?: string;
}

export class UpdateBuyBoxDto {
  @IsOptional() @IsEnum(BuyBoxAdminStatus) status?: BuyBoxAdminStatus;
  @IsOptional() @IsEnum(ExperienceDisplayMode) displayMode?: ExperienceDisplayMode;
  @IsOptional() @IsEnum(BuyBoxAdminSelectionPolicy) selectionPolicy?: BuyBoxAdminSelectionPolicy;
  @IsOptional() @IsEnum(OfferSelectionPolicy) fallbackPolicy?: OfferSelectionPolicy;
  @IsOptional() @IsString() currency?: string;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) minimumBidAmount?: number;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) minimumBidIncrement?: number;
  @IsOptional() @IsDateString() startsAt?: string;
  @IsOptional() @IsDateString() endsAt?: string;
}

export class AddBuyBoxOfferDto {
  @IsString() productId!: string;
}

export class SubmitBuyBoxBidDto {
  @Type(() => Number) @IsNumber() @Min(0) amount!: number;
  @IsOptional() @IsDateString() startsAt?: string;
  @IsOptional() @IsDateString() endsAt?: string;
}
