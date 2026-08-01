import { IsObject, IsOptional, IsString, Length } from "class-validator";
export class UpdateGeneralSettingsDto { @IsOptional() @IsString() @Length(1, 160) name?: string; @IsOptional() @IsString() @Length(3, 3) currency?: string; @IsOptional() @IsString() timezone?: string; }
export class UpdateSettingsSectionDto { @IsOptional() @IsObject() value?: Record<string, unknown>; }
