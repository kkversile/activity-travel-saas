import { Type } from "class-transformer";
import { IsDateString, IsInt, IsOptional, IsString, Min, Max } from "class-validator";

export class CreateVoucherDto {
  @IsString() code!: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) discountMinor?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) @Max(100) discountPercent?: number;
  @IsOptional() @IsDateString() validFrom?: string;
  @IsOptional() @IsDateString() validTo?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) maxRedemptions?: number;
}
