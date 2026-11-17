import { Body, Controller, Get, Param, Patch, Post, Put, Query, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AuthUser } from '../common/auth.types';
import { CurrentUser } from '../common/current-user.decorator';
import { Permissions } from '../common/permissions.decorator';
import { PermissionsGuard } from '../common/permissions.guard';
import { Roles } from '../common/roles.decorator';
import { RolesGuard } from '../common/roles.guard';
import { SetOutletMemberDto, AssignOutletBankDto, CreateVendorBankAccountDto, CreateVendorOutletDto, ReviewVendorBankAccountDto, UpdateVendorOutletDto, VendorOutletsService } from './vendor-outlets.service';
import { VendorOutletAccessService } from './vendor-outlet-access.service';

@Controller('vendor')
@ApiTags('Vendor outlets')
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
@Roles(UserRole.VENDOR)
export class VendorOutletsController {
  constructor(private readonly service: VendorOutletsService, private readonly access: VendorOutletAccessService) {}

  @Get('outlets')
  @Permissions('vendor.outlet.view')
  list(@CurrentUser() user: AuthUser) { return this.service.list(user); }

  @Post('outlets')
  @Permissions('vendor.outlet.manage')
  create(@CurrentUser() user: AuthUser, @Body() body: CreateVendorOutletDto) { return this.service.create(user, body); }

  @Patch('outlets/:id')
  @Permissions('vendor.outlet.manage')
  update(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() body: UpdateVendorOutletDto) { return this.service.update(user, id, body); }

  @Get('bank-accounts')
  @Permissions('vendor.bank.manage')
  bankAccounts(@CurrentUser() user: AuthUser) { return this.service.bankAccounts(user); }

  @Post('bank-accounts')
  @Permissions('vendor.bank.manage')
  addBankAccount(@CurrentUser() user: AuthUser, @Body() body: CreateVendorBankAccountDto) { return this.service.createBankAccount(user, body); }

  @Patch('outlets/:id/bank-account')
  @Permissions('vendor.bank.manage')
  assignBank(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() body: AssignOutletBankDto) { return this.service.assignBank(user, id, body); }

  @Post('admin/bank-accounts/:id/review')
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @Permissions('vendor.bank.verify')
  reviewBankAccount(@CurrentUser() actor: AuthUser, @Param('id') id: string, @Body() body: ReviewVendorBankAccountDto) { return this.service.reviewBankAccount(actor, id, body); }

  @Get('admin/vendors/:tenantId/outlets')
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @Permissions('settlement.view')
  vendorOutlets(@Param('tenantId') tenantId: string) { return this.service.adminOutlets(tenantId); }

  @Get('admin/bank-accounts/pending')
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @Permissions('vendor.bank.verify')
  pendingBankReviews() { return this.service.pendingBankReviews(); }

  @Put('outlets/:outletId/members/:memberId')
  @Permissions('vendor.team.manage')
  memberAccess(@CurrentUser() user: AuthUser, @Param('outletId') outletId: string, @Param('memberId') memberId: string, @Body() body: SetOutletMemberDto) {
    return this.service.setMemberAccess(user, outletId, memberId, body?.active === true);
  }

  @Get('outlet-scope')
  @Permissions('vendor.outlet.view')
  scope(@CurrentUser() user: AuthUser, @Query('outletId') outletId?: string) { return this.access.resolve(user, outletId, { aggregateRead: true }); }
}
