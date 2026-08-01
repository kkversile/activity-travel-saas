import { IsDateString, IsOptional, IsString } from "class-validator";
export class CreateBlackoutDateDto { @IsString() activityId!: string; @IsDateString() date!: string; @IsOptional() @IsString() reason?: string; }
