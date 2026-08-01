import { Type } from "class-transformer";
import { IsIn, IsInt, IsOptional, IsString, Max, Min } from "class-validator";
export class BookingRelatedQueryDto { @IsOptional() @Type(() => Number) @IsInt() @Min(1) page = 1; @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) pageSize = 25; @IsOptional() @IsString() search?: string; @IsOptional() @IsIn(["createdAt", "name", "email", "code"]) sortBy = "createdAt"; @IsOptional() @IsIn(["asc", "desc"]) sortOrder: "asc" | "desc" = "desc"; }
