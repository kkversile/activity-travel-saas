import { Type } from "class-transformer";
import {
  ArrayMinSize,
  IsEmail,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  ValidateNested
} from "class-validator";
import { ApiProperty } from "@nestjs/swagger";
import { PassengerType } from "@prisma/client";

export class CreatePassengerDto {
  @ApiProperty({ enum: PassengerType })
  @IsEnum(PassengerType)
  type!: PassengerType;

  @IsString()
  firstName!: string;

  @IsString()
  lastName!: string;
}

export class CreateBookingDto {
  @IsUUID()
  activityId!: string;

  @IsUUID()
  scheduleId!: string;

  @IsString()
  customerName!: string;

  @IsEmail()
  customerEmail!: string;

  @IsOptional()
  @IsString()
  customerPhone?: string;

  @IsString()
  idempotencyKey!: string;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsString()
  voucherCode?: string;

  @ValidateNested({ each: true })
  @Type(() => CreatePassengerDto)
  @ArrayMinSize(1)
  passengers!: CreatePassengerDto[];
}
