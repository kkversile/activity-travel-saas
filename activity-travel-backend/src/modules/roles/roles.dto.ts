import { Type } from "class-transformer";
import { IsIn, IsInt, IsObject, IsOptional, IsString, Max, Min, MinLength } from "class-validator";

export class RoleQueryDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page = 1;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) pageSize = 25;
  @IsOptional() @IsString() search?: string;
  @IsOptional() @IsIn(["ACTIVE", "INACTIVE"]) status?: "ACTIVE" | "INACTIVE";
  @IsOptional() @IsIn(["name", "createdAt", "updatedAt"]) sortBy = "name";
  @IsOptional() @IsIn(["asc", "desc"]) sortOrder: "asc" | "desc" = "asc";
}

export class CreateCustomRoleDto {
  @IsString()
  @MinLength(2)
  name!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsObject()
  permissions!: Record<string, unknown>;
}

export class UpdateCustomRoleDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  name?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsObject()
  permissions?: Record<string, unknown>;

  @IsOptional()
  isActive?: boolean;
}
