import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AuthUser } from '../common/auth.types';
import { CurrentUser } from '../common/current-user.decorator';
import { Permissions } from '../common/permissions.decorator';
import { PermissionsGuard } from '../common/permissions.guard';
import { Roles } from '../common/roles.decorator';
import { RolesGuard } from '../common/roles.guard';
import { AddBuyBoxOfferDto, SubmitBuyBoxBidDto, UpdateBuyBoxDto, UpsertBuyBoxDto } from './buy-box.dto';
import { BuyBoxService } from './buy-box.service';

@Controller('admin/buy-boxes')
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
@Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
export class BuyBoxAdminController {
  constructor(private readonly service: BuyBoxService) {}
  @Get() @Permissions('buybox.admin.view') list() { return this.service.adminList(); }
  @Get(':id') @Permissions('buybox.admin.view') detail(@Param('id') id: string) { return this.service.adminDetail(id); }
  @Post() @Permissions('buybox.admin.manage') create(@CurrentUser() user: AuthUser, @Body() dto: UpsertBuyBoxDto) { return this.service.upsertAdmin(user, dto); }
  @Patch(':id') @Permissions('buybox.admin.manage') update(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: UpdateBuyBoxDto) { return this.service.upsertAdmin(user, dto, id); }
  @Post(':id/offers') @Permissions('buybox.admin.manage') addOffer(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: AddBuyBoxOfferDto) { return this.service.addOffer(user, id, dto); }
  @Delete(':id/offers/:offerId') @Permissions('buybox.admin.manage') removeOffer(@CurrentUser() user: AuthUser, @Param('id') id: string, @Param('offerId') offerId: string) { return this.service.removeOffer(user, id, offerId); }
}

@Controller('vendor/buy-box')
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
@Roles(UserRole.VENDOR)
export class BuyBoxVendorController {
  constructor(private readonly service: BuyBoxService) {}
  @Get('opportunities') @Permissions('buybox.vendor.view') opportunities(@CurrentUser() user: AuthUser) { return this.service.vendorOpportunities(user); }
  @Get(':id') @Permissions('buybox.vendor.view') detail(@CurrentUser() user: AuthUser, @Param('id') id: string) { return this.service.vendorDetail(user, id); }
  @Post(':id/bids') @Permissions('buybox.vendor.bid') submit(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: SubmitBuyBoxBidDto) { return this.service.submitBid(user, id, dto); }
}
