import { IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';

export class StartImpersonationDto {
  @IsUUID()
  targetUserId!: string;

  @IsOptional()
  @IsString()
  @MinLength(3)
  @MaxLength(500)
  reason?: string;
}
