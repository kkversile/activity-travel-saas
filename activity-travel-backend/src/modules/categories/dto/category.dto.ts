import { IsEnum, IsInt, IsOptional, IsString, Length, Max, Min } from "class-validator";
import { CatalogStatus } from "../types";

export class CreateCategoryDto { @IsString() @Length(2, 120) name!: string; @IsString() @Length(2, 140) slug!: string; @IsOptional() @IsString() description?: string; @IsOptional() @IsInt() @Min(0) @Max(10000) displayOrder?: number; @IsOptional() @IsEnum(CatalogStatus) status?: CatalogStatus; }
export class UpdateCategoryDto { @IsOptional() @IsString() @Length(2, 120) name?: string; @IsOptional() @IsString() @Length(2, 140) slug?: string; @IsOptional() @IsString() description?: string; @IsOptional() @IsInt() @Min(0) @Max(10000) displayOrder?: number; @IsOptional() @IsEnum(CatalogStatus) status?: CatalogStatus; }
