import { Type } from "class-transformer"; import { IsEnum, IsIn, IsInt, IsOptional, IsString, Max, Min } from "class-validator";
import { CatalogStatus } from "../types";

export class CategoryQueryDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page = 1;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) pageSize = 25;
  @IsOptional() @IsString() search?: string;
  @IsOptional() @IsEnum(CatalogStatus) status?: CatalogStatus;
  @IsOptional() @IsIn(["name", "slug", "createdAt", "updatedAt"]) sortBy = "name";
  @IsOptional() @IsIn(["asc", "desc"]) sortOrder: "asc" | "desc" = "asc";
}
