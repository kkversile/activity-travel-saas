import { Type } from "class-transformer";
import { IsDateString, IsEnum, IsIn, IsInt, IsNumber, IsOptional, IsString, Max, Min } from "class-validator";

export class DiscountQueryDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page = 1;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) pageSize = 25;
  @IsOptional() @IsString() search?: string;
  @IsOptional() @IsEnum(["ACTIVE", "INACTIVE", "ARCHIVED"] as const) status?: "ACTIVE" | "INACTIVE" | "ARCHIVED";
  @IsOptional() @IsIn(["name", "createdAt", "validTo"]) sortBy = "name";
  @IsOptional() @IsIn(["asc", "desc"]) sortOrder: "asc" | "desc" = "asc";
}
export class CreateDiscountDto { @IsString() name!: string; @IsOptional() @IsString() code?: string; @IsOptional() @Type(() => Number) @IsInt() @Min(0) discountMinor?: number; @IsOptional() @Type(() => Number) @IsNumber() @Min(0) discountPercent?: number; @IsOptional() @IsDateString() validFrom?: string; @IsOptional() @IsDateString() validTo?: string; }
export class UpdateDiscountDto { @IsOptional() @IsString() name?: string; @IsOptional() @IsString() code?: string; @IsOptional() @IsEnum(["ACTIVE", "INACTIVE", "ARCHIVED"] as const) status?: "ACTIVE" | "INACTIVE" | "ARCHIVED"; @IsOptional() @Type(() => Number) @IsInt() @Min(0) discountMinor?: number; @IsOptional() @Type(() => Number) @IsNumber() @Min(0) discountPercent?: number; @IsOptional() @IsDateString() validTo?: string; }
