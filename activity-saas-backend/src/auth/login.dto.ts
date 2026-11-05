import { IsEmail, IsOptional, IsString, Length, MaxLength, MinLength } from 'class-validator';

export class RequestVendorLoginCodeDto {
  @IsEmail() email!: string;
}

export class LoginDto {
  @IsString()
  @MinLength(3)
  @MaxLength(320)
  email!: string;

  @IsString()
  @MinLength(6)
  password!: string;

  @IsOptional() @IsString() @MaxLength(128) deviceToken?: string;
}

export class VerifyVendorLoginDto {
  @IsString() @MaxLength(64) challengeId!: string;
  @IsString() @Length(6, 6) code!: string;
  @IsString() @MinLength(32) @MaxLength(128) deviceToken!: string;
}
