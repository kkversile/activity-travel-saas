import { Type } from "class-transformer";
import { IsIn, IsInt, IsOptional, IsString, Max, Min } from "class-validator";
export class AuditQueryDto { @IsOptional() @Type(() => Number) @IsInt() @Min(1) page = 1; @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) pageSize = 25; @IsOptional() @IsString() search?: string; @IsOptional() @IsString() entityType?: string; @IsOptional() @IsString() entityId?: string; @IsOptional() @IsIn(["createdAt", "action", "entityType"]) sortBy = "createdAt"; @IsOptional() @IsIn(["asc", "desc"]) sortOrder: "asc" | "desc" = "desc"; }
