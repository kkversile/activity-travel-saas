import { Type } from 'class-transformer';
import { IsDateString, IsInt, IsOptional, IsString, Max, MaxLength, Min, MinLength } from 'class-validator';

export class IngestVendorReviewDto {
  @IsString() @MinLength(1) @MaxLength(80) source!: string;
  @IsString() @MinLength(1) @MaxLength(200) sourceReviewId!: string;
  @IsString() @MinLength(1) @MaxLength(80) productId!: string;
  @IsOptional() @IsString() @MaxLength(160) reviewerName?: string;
  @Type(() => Number) @IsInt() @Min(1) @Max(5) rating!: number;
  @IsOptional() @IsString() @MaxLength(240) title?: string;
  @IsOptional() @IsString() @MaxLength(10000) comment?: string;
  @IsOptional() @IsDateString() reviewedAt?: string;
}

export class VendorReviewReplyDto {
  @IsString() @MinLength(1) @MaxLength(2000) vendorReply!: string;
}
