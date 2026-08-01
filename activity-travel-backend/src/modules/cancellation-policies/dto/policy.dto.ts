import { Type } from "class-transformer"; import { IsEnum, IsInt, IsOptional, IsString, Length, Max, Min } from "class-validator";
import { CatalogStatus } from "@prisma/client";
export class PolicyQueryDto { @IsOptional() @Type(() => Number) @IsInt() @Min(1) page = 1; @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) pageSize = 25; @IsOptional() @IsString() search?: string; @IsOptional() @IsEnum(CatalogStatus) status?: CatalogStatus; @IsOptional() @IsString() sortBy = "createdAt"; @IsOptional() @IsString() sortOrder: "asc" | "desc" = "desc"; }
export class CreatePolicyDto { @IsString() @Length(2, 120) name!: string; @IsOptional() @IsString() description?: string; @IsOptional() @IsEnum(CatalogStatus) status?: CatalogStatus; }
export class UpdatePolicyDto extends CreatePolicyDto {}
