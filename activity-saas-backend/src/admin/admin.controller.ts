import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiBody, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AuthUser } from '../common/auth.types';
import { CurrentUser } from '../common/current-user.decorator';
import { Roles } from '../common/roles.decorator';
import { RolesGuard } from '../common/roles.guard';
import { Permissions } from '../common/permissions.decorator';
import { PermissionsGuard } from '../common/permissions.guard';
import { DocumentReviewDto, VendorVerificationDto } from './governance.dto';
import { AdminService } from './admin.service';

@Controller('admin')
@ApiTags('Administration')
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
@Roles(UserRole.ADMIN, UserRole.SUB_ADMIN)
export class AdminController {
  constructor(private readonly service: AdminService) {}
  @Get('dashboard') @Permissions('audit.view') dashboard() { return this.service.dashboard(); }
  @Get('vendors') @Permissions('vendor.profile.view') vendors() { return this.service.vendors(); }
  @Get('vendors/:tenantId') @Permissions('vendor.profile.view', 'document.view') vendor(@Param('tenantId') tenantId: string) { return this.service.vendor(tenantId); }
  @Patch('vendors/:tenantId/verification') @ApiBody({ schema: { type: 'object', example: { status: 'VERIFIED', reason: 'Business details and documents verified.' } } }) @Permissions('document.review') verification(@CurrentUser() user: AuthUser, @Param('tenantId') tenantId: string, @Body() dto: VendorVerificationDto) { return this.service.verification(user, tenantId, dto.status, dto.reason); }
  @Patch('vendors/:tenantId/documents/versions/:versionId') @ApiBody({ schema: { type: 'object', example: { status: 'VERIFIED', reason: 'Document reviewed and accepted.' } } }) @Permissions('document.review') document(@CurrentUser() user: AuthUser, @Param('tenantId') tenantId: string, @Param('versionId') versionId: string, @Body() dto: DocumentReviewDto) { return this.service.document(user, tenantId, versionId, dto.status, dto.reason); }
}
