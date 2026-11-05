import { Equals, IsBoolean, IsEmail, IsOptional, IsString, Matches, MinLength } from 'class-validator';

export class RegisterDto {
  @IsString() @MinLength(2) fullName!: string;
  @IsOptional() @IsString() @MinLength(2) businessName?: string;
  @IsEmail() email!: string;
  @IsOptional() @IsString() mobile?: string;
  @IsOptional() @IsString() category?: string;
  @IsOptional() @IsString() city?: string;
  @IsString() @MinLength(8) @Matches(/^(?=.*\d).{8,}$/) password!: string;
  @IsBoolean() @Equals(true) acceptedTerms!: boolean;
  @IsOptional() @IsString() @MinLength(40) teamInviteToken?: string;
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

export class ChangePasswordDto {
  @IsString() @MinLength(1) currentPassword!: string;
  @IsString() @MinLength(8) newPassword!: string;
  @IsString() @MinLength(8) confirmPassword!: string;
}
