import { IsEnum, IsLatitude, IsLongitude, IsOptional, IsString, Length } from "class-validator";
import { CatalogStatus } from "../../categories/types";
export class CreateDestinationDto { @IsString() @Length(2, 120) country!: string; @IsOptional() @IsString() state?: string; @IsString() @Length(2, 120) city!: string; @IsOptional() @IsString() timezone?: string; @IsOptional() @IsLatitude() latitude?: string; @IsOptional() @IsLongitude() longitude?: string; @IsOptional() @IsString() description?: string; @IsOptional() @IsEnum(CatalogStatus) status?: CatalogStatus; }
export class UpdateDestinationDto extends CreateDestinationDto {}
