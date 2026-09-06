import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { ActivityStatus, UserRole, VendorVerificationStatus } from '@prisma/client';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AuthUser } from '../common/auth.types';
import { CurrentUser } from '../common/current-user.decorator';
import { Roles } from '../common/roles.decorator';
import { RolesGuard } from '../common/roles.guard';
import { AdminService } from './admin.service';

@Controller('admin')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN, UserRole.SUB_ADMIN)
export class AdminController {
  constructor(private readonly service: AdminService) {}
  @Get('dashboard') dashboard() { return this.service.dashboard(); }
  @Get('vendors') vendors() { return this.service.vendors(); }
  @Get('vendors/:tenantId') vendor(@Param('tenantId') tenantId: string) { return this.service.vendor(tenantId); }
  @Patch('vendors/:tenantId/verification') verification(@Param('tenantId') tenantId: string, @Body('status') status: VendorVerificationStatus) { return this.service.verification(tenantId, status); }
  @Patch('vendors/:tenantId/documents/:key') document(@Param('tenantId') tenantId: string, @Param('key') key: string, @Body('status') status: 'VERIFIED' | 'REJECTED' | 'PENDING') { return this.service.document(tenantId, key, status); }
  @Get('activities/review') activities() { return this.service.activities(); }
  @Post('activities/:id/publish') publish(@Param('id') id: string) { return this.service.reviewActivity(id, ActivityStatus.LIVE); }
  @Post('activities/:id/reject') reject(@Param('id') id: string) { return this.service.reviewActivity(id, ActivityStatus.INACTIVE); }
}
