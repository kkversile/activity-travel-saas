import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AuthUser } from '../common/auth.types';
import { CurrentUser } from '../common/current-user.decorator';
import { Permissions } from '../common/permissions.decorator';
import { PermissionsGuard } from '../common/permissions.guard';
import { Roles } from '../common/roles.decorator';
import { RolesGuard } from '../common/roles.guard';
import { VendorOpportunityListQueryDto, VendorOpportunityResponseDto } from './demand.dto';
import { DemandOpportunityService } from './demand-opportunity.service';

@Controller('vendor/opportunities')
@ApiTags('Vendor Demand Opportunities')
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
@Roles(UserRole.VENDOR)
export class VendorDemandController {
  constructor(private readonly service: DemandOpportunityService) {}
  @Get() @Permissions('demand.view.vendor') list(@CurrentUser() user: AuthUser, @Query() query: VendorOpportunityListQueryDto) { return this.service.vendorList(user, query); }
  @Get(':id') @Permissions('demand.view.vendor') detail(@CurrentUser() user: AuthUser, @Param('id') id: string) { return this.service.vendorDetail(user, id); }
  @Post(':id/view') @Permissions('demand.view.vendor') view(@CurrentUser() user: AuthUser, @Param('id') id: string) { return this.service.vendorView(user, id); }
  @Post(':id/respond') @Permissions('demand.respond.vendor') respond(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: VendorOpportunityResponseDto) { return this.service.vendorRespond(user, id, dto); }
}
