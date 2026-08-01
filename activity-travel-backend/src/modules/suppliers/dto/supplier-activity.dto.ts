import { Type } from "class-transformer";
import { IsEnum, IsInt, IsOptional, IsUUID, Max, Min } from "class-validator";
import { CatalogStatus } from "@prisma/client";

export class SupplierActivityDto {
  @IsUUID()
  activityId!: string;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  costMinor = 0;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(100)
  commissionPercent = 0;

  @IsOptional()
  @IsEnum(CatalogStatus)
  status?: CatalogStatus;
}
