import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { UserRole, VendorOnboardingStatus } from '@prisma/client';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AuthUser } from '../common/auth.types';
import { CurrentUser } from '../common/current-user.decorator';
import { Permissions } from '../common/permissions.decorator';
import { PermissionsGuard } from '../common/permissions.guard';
import { Roles } from '../common/roles.decorator';
import { RolesGuard } from '../common/roles.guard';
import { RequestOtpDto, ReviewOnboardingDto, UpdateOnboardingDto, VerifyOtpDto } from './onboarding.dto';
import { OnboardingService } from './onboarding.service';

@Controller('vendor/onboarding')
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
@Roles(UserRole.VENDOR)
export class VendorOnboardingController {
  constructor(private readonly service: OnboardingService) {}

  @Get() @Permissions('vendor.profile.view') get(@CurrentUser() user: AuthUser) { return this.service.get(user); }
  @Patch() @Permissions('vendor.profile.edit') save(@CurrentUser() user: AuthUser, @Body() dto: UpdateOnboardingDto) { return this.service.save(user, dto); }
  @Post('otp/request') @Permissions('vendor.profile.edit') requestOtp(@CurrentUser() user: AuthUser, @Body() dto: RequestOtpDto) { return this.service.requestOtp(user, dto.contactNumber); }
  @Post('otp/verify') @Permissions('vendor.profile.edit') verifyOtp(@CurrentUser() user: AuthUser, @Body() dto: VerifyOtpDto) { return this.service.verifyOtp(user, dto.otp); }
  @Post('submit') @Permissions('vendor.profile.edit') submit(@CurrentUser() user: AuthUser) { return this.service.submit(user); }
}

@Controller('admin/vendors')
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
@Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
export class AdminOnboardingController {
  constructor(private readonly service: OnboardingService) {}

  @Get(':tenantId/onboarding') @Permissions('vendor.profile.view', 'document.view') get(@Param('tenantId') tenantId: string) { return this.service.adminGet(tenantId); }
  @Post(':tenantId/onboarding/review') @Permissions('document.review') review(@CurrentUser() user: AuthUser, @Param('tenantId') tenantId: string, @Body() dto: ReviewOnboardingDto) { return this.service.review(user, tenantId, dto); }
  @Post(':tenantId/onboarding/reopen') @Permissions('document.review') reopen(@CurrentUser() user: AuthUser, @Param('tenantId') tenantId: string) { return this.service.reopen(user, tenantId); }
}
