import { IsEmail, IsOptional, IsString, IsUUID } from "class-validator";

export class UpdateBookingDto {
  @IsOptional() @IsString() customerName?: string;
  @IsOptional() @IsEmail() customerEmail?: string;
  @IsOptional() @IsString() customerPhone?: string;
  @IsOptional() @IsString() notes?: string;
  @IsOptional() @IsString() source?: string;
  @IsOptional() @IsUUID() agentId?: string | null;
  @IsOptional() @IsUUID() supplierId?: string | null;
}
