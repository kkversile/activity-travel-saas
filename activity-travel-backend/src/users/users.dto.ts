import { Type } from "class-transformer";
import { IsEmail, IsEnum, IsIn, IsInt, IsOptional, IsString, IsUUID, Max, Min, MinLength } from "class-validator";
import { UserRole } from "@prisma/client";

export class UserQueryDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page = 1;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) pageSize = 25;
  @IsOptional() @IsString() search?: string;
  @IsOptional() @IsIn(["ACTIVE", "INACTIVE"] as const) status?: "ACTIVE" | "INACTIVE";
  @IsOptional() @IsIn(["createdAt"]) sortBy = "createdAt";
  @IsOptional() @IsIn(["asc", "desc"]) sortOrder: "asc" | "desc" = "desc";
}

export class CreateUserDto {
  @IsEmail() email!: string;
  @IsString() displayName!: string;
  @IsString() @MinLength(8) password!: string;
  @IsEnum(UserRole) role!: UserRole;
  @IsOptional() @IsUUID() customRoleId?: string;
}

export class UpdateUserDto {
  @IsOptional() @IsString() displayName?: string;
  @IsOptional() @IsEnum(UserRole) role?: UserRole;
  @IsOptional() isActive?: boolean;
  @IsOptional() @IsUUID() customRoleId?: string | null;
}
