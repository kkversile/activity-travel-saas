import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { CurrentUser } from '../common/current-user.decorator';
import { Permissions } from '../common/permissions.decorator';
import { Roles } from '../common/roles.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../common/roles.guard';
import { PermissionsGuard } from '../common/permissions.guard';
import { AuthUser } from '../common/auth.types';
import { CancellationResolutionDto, FailPayoutDto, FinanceConfigurationDto, ReconcilePayoutDto, ReleasePayoutDto, SettlementBatchDto, SettlementHoldDto, SettlementPreviewDto, VendorAdjustmentDto, VendorSettlementPolicyDto } from './finance.dto';
import { FinanceService } from './finance.service';

@Controller()
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
export class FinanceController {
  constructor(private readonly finance: FinanceService) {}

  @Post('admin/settlements/preview') @Roles(UserRole.ADMIN, UserRole.SUB_ADMIN) @Permissions('settlement.view') preview(@CurrentUser() u: AuthUser, @Body() d: SettlementPreviewDto) { return this.finance.preview(u, d); }
  @Post('admin/settlements') @Roles(UserRole.ADMIN, UserRole.SUB_ADMIN) @Permissions('settlement.manage') createBatch(@CurrentUser() u: AuthUser, @Body() d: SettlementBatchDto) { return this.finance.createBatch(u, d); }
  @Get('admin/settlements') @Roles(UserRole.ADMIN, UserRole.SUB_ADMIN) @Permissions('settlement.view') batches(@Query('vendorTenantId') v?: string) { return this.finance.listBatches(v); }
  @Get('admin/settlements/:id') @Roles(UserRole.ADMIN, UserRole.SUB_ADMIN) @Permissions('settlement.view') batch(@Param('id') id: string) { return this.finance.batch(id); }
  @Get('admin/financial-events') @Roles(UserRole.ADMIN, UserRole.SUB_ADMIN) @Permissions('financial.event.view') events(@Query('vendorTenantId') v?: string) { return this.finance.events(v); }
  @Post('admin/financial-events/vendor-adjustment') @Roles(UserRole.ADMIN, UserRole.SUB_ADMIN) @Permissions('vendor.adjustment.manage') adjustment(@CurrentUser() u: AuthUser, @Body() d: VendorAdjustmentDto) { return this.finance.adjustment(u, d); }
  @Post('admin/cancellations/:id/vendor-settlement-resolution') @Roles(UserRole.ADMIN, UserRole.SUB_ADMIN) @Permissions('financial.cancellation.resolve') resolve(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body() d: CancellationResolutionDto) { return this.finance.resolveCancellation(u, id, d); }
  @Post('admin/settlement-holds') @Roles(UserRole.ADMIN, UserRole.SUB_ADMIN) @Permissions('settlement.hold') hold(@CurrentUser() u: AuthUser, @Body() d: SettlementHoldDto) { return this.finance.createHold(u, d); }
  @Post('admin/settlement-holds/:id/release') @Roles(UserRole.ADMIN, UserRole.SUB_ADMIN) @Permissions('settlement.hold') releaseHold(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body() d: { reason?: string }) { return this.finance.releaseHold(u, id, d.reason); }
  @Get('admin/finance/configuration') @Roles(UserRole.ADMIN, UserRole.SUB_ADMIN) @Permissions('reconciliation.view') configuration() { return this.finance.configuration(); }
  @Post('admin/finance/configuration') @Roles(UserRole.ADMIN, UserRole.SUB_ADMIN) @Permissions('finance.config.manage') configure(@CurrentUser() u: AuthUser, @Body() d: FinanceConfigurationDto) { return this.finance.updateConfiguration(u, d); }
  @Get('admin/vendor-settlement-policies') @Roles(UserRole.ADMIN, UserRole.SUB_ADMIN) @Permissions('settlement.policy.manage') policies() { return this.finance.policies(); }
  @Post('admin/vendor-settlement-policies/:vendorTenantId') @Roles(UserRole.ADMIN, UserRole.SUB_ADMIN) @Permissions('settlement.policy.manage') policy(@CurrentUser() u: AuthUser, @Param('vendorTenantId') v: string, @Body() d: VendorSettlementPolicyDto) { return this.finance.updatePolicy(u, v, d); }
  @Get('admin/payouts') @Roles(UserRole.ADMIN, UserRole.SUB_ADMIN) @Permissions('payout.view') adminPayouts(@Query('vendorTenantId') v?: string) { return this.finance.payouts(v); }
  @Post('admin/payouts/:id/record-release') @Roles(UserRole.ADMIN, UserRole.SUB_ADMIN) @Permissions('payout.release') recordRelease(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body() d: ReleasePayoutDto) { return this.finance.recordRelease(u, id, d); }
  @Post('admin/payouts/:id/record-failure') @Roles(UserRole.ADMIN, UserRole.SUB_ADMIN) @Permissions('payout.release') recordFailure(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body() d: FailPayoutDto) { return this.finance.recordFailure(u, id, d); }
  @Post('admin/payouts/:id/retry') @Roles(UserRole.ADMIN, UserRole.SUB_ADMIN) @Permissions('payout.release') retry(@CurrentUser() u: AuthUser, @Param('id') id: string) { return this.finance.retry(u, id); }
  @Post('admin/payouts/:id/reconcile') @Roles(UserRole.ADMIN, UserRole.SUB_ADMIN) @Permissions('payout.reconcile') reconcile(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body() d: ReconcilePayoutDto) { return this.finance.reconcile(u, id, d); }
  @Get('settlements') @Roles(UserRole.VENDOR) @Permissions('settlement.view') vendorSettlements(@CurrentUser() u: AuthUser) { return this.finance.vendorSettlements(u); }
}
