import { Type } from "class-transformer";
import { IsEnum, IsIn, IsInt, IsNumber, IsOptional, IsString, Max, Min } from "class-validator";
export class TaxQueryDto { @IsOptional() @Type(() => Number) @IsInt() @Min(1) page = 1; @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) pageSize = 25; @IsOptional() @IsString() search?: string; @IsOptional() @IsEnum(["ACTIVE", "INACTIVE", "ARCHIVED"] as const) status?: "ACTIVE" | "INACTIVE" | "ARCHIVED"; @IsOptional() @IsIn(["name", "createdAt", "ratePercent"]) sortBy = "name"; @IsOptional() @IsIn(["asc", "desc"]) sortOrder: "asc" | "desc" = "asc"; }
export class CreateTaxDto { @IsString() name!: string; @Type(() => Number) @IsNumber() @Min(0) ratePercent!: number; }
export class UpdateTaxDto { @IsOptional() @IsString() name?: string; @IsOptional() @Type(() => Number) @IsNumber() @Min(0) ratePercent?: number; @IsOptional() @IsEnum(["ACTIVE", "INACTIVE", "ARCHIVED"] as const) status?: "ACTIVE" | "INACTIVE" | "ARCHIVED"; }
