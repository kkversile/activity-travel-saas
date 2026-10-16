import { IsEmail, IsString, MinLength } from 'class-validator';

export class RegisterDto {
  @IsString() @MinLength(2) fullName!: string;
  @IsEmail() email!: string;
  @IsString() @MinLength(6) password!: string;
}

export class RequestVendorEmailCodeDto {
  @IsEmail() email!: string;
}

export class VerifyVendorEmailCodeDto {
  @IsEmail() email!: string;
  @IsString() @MinLength(6) code!: string;
}

export class SetVendorPasswordDto {
  @IsString() @MinLength(32) setupToken!: string;
  @IsString() @MinLength(8) password!: string;
}
