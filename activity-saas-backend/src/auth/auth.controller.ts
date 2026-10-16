import { Body, Controller, Get, Patch, Post, UseGuards } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { ApiBody, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../common/current-user.decorator';
import { AuthUser } from '../common/auth.types';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './jwt-auth.guard';
import { LoginDto } from './login.dto';
import { ChangePasswordDto, RegisterDto, RequestVendorEmailCodeDto, SetVendorPasswordDto, VerifyVendorEmailCodeDto } from './register.dto';
import { swaggerExamples } from '../common/swagger-examples';
import { Roles } from '../common/roles.decorator';
import { RolesGuard } from '../common/roles.guard';
import { ImpersonationService } from './impersonation.service';
import { StartImpersonationDto } from './impersonation.dto';

@Controller('auth')
@ApiTags('Authentication')
export class AuthController {
  constructor(private readonly auth: AuthService, private readonly impersonation: ImpersonationService) {}

  @Post('login')
  @ApiBody({ description: 'Demo credentials are loaded from deployment configuration. Replace with a registered user when needed.', schema: { type: 'object', example: swaggerExamples.auth.login } })
  login(@Body() dto: LoginDto) {
    return this.auth.login(dto);
  }

  @Post('register')
  @ApiBody({ schema: { type: 'object', example: swaggerExamples.auth.register } })
  register(@Body() dto: RegisterDto) {
    return this.auth.register(dto);
  }

  @Post('vendor/email/request')
  requestVendorEmailCode(@Body() dto: RequestVendorEmailCodeDto) {
    return this.auth.requestVendorEmailCode(dto.email);
  }

  @Post('vendor/email/verify')
  verifyVendorEmailCode(@Body() dto: VerifyVendorEmailCodeDto) {
    return this.auth.verifyVendorEmailCode(dto.email, dto.code);
  }

  @Post('vendor/password')
  setVendorPassword(@Body() dto: SetVendorPasswordDto) {
    return this.auth.setVendorPassword(dto);
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  me(@CurrentUser() user: AuthUser) {
    return user;
  }

  @Patch('password')
  @UseGuards(JwtAuthGuard)
  changePassword(@CurrentUser() user: AuthUser, @Body() dto: ChangePasswordDto) {
    return this.auth.changePassword(user, dto);
  }

  @Post('impersonation/start')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.SUPER_ADMIN)
  startImpersonation(@CurrentUser() user: AuthUser, @Body() dto: StartImpersonationDto) {
    return this.impersonation.start(user, dto.targetUserId, dto.reason);
  }

  @Post('impersonation/end')
  @UseGuards(JwtAuthGuard)
  endImpersonation(@CurrentUser() user: AuthUser) {
    return this.impersonation.end(user);
  }

  @Get('impersonation/history')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.SUPER_ADMIN)
  impersonationHistory(@CurrentUser() user: AuthUser) {
    return this.impersonation.history(user);
  }
}
