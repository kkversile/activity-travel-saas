import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { SupplierQualityIssueStatus, TenantKind, UserRole } from '@prisma/client';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AuthUser } from '../common/auth.types';
import { CurrentUser } from '../common/current-user.decorator';
import { Permissions } from '../common/permissions.decorator';
import { PermissionsGuard } from '../common/permissions.guard';
import { Roles } from '../common/roles.decorator';
import { RolesGuard } from '../common/roles.guard';
import { PrismaService } from '../prisma/prisma.service';
import { CaptureSnapshotDto, IssueReasonDto, QualityVendorQueryDto, SupplierQualityPolicyDto, TierAssignmentDto, UpdateSupplierQualityPolicyDto } from './supplier-quality.dto';
import { SupplierPerformanceService } from './supplier-performance.service';
import { SupplierQualityIssueService, SupplierQualityPolicyService, SupplierQualitySnapshotService, SupplierTierService } from './supplier-quality.service';

@Controller('vendor')
@ApiTags('Supplier Quality')
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
@Roles(UserRole.VENDOR)
export class VendorQualityController {
  constructor(private readonly performance: SupplierPerformanceService, private readonly prisma: PrismaService) {}
  @Get('performance') @Permissions('supplier.quality.view.own') performanceView(@CurrentUser() user: AuthUser) { return this.performance.computeCurrent(user.tenantId!); }
  @Get('performance/history') @Permissions('supplier.quality.view.own') history(@CurrentUser() user: AuthUser) { return this.prisma.supplierQualitySnapshot.findMany({ where: { vendorTenantId: user.tenantId! }, orderBy: { generatedAt: 'desc' }, take: 24, include: { metricSnapshots: true, policy: { select: { id: true, versionNumber: true, name: true } } } }); }
  @Get('performance/issues') @Permissions('supplier.quality.view.own') issues(@CurrentUser() user: AuthUser) { return this.prisma.supplierQualityIssue.findMany({ where: { vendorTenantId: user.tenantId!, status: { in: [SupplierQualityIssueStatus.OPEN, SupplierQualityIssueStatus.ACKNOWLEDGED] } }, orderBy: { openedAt: 'desc' } }); }
}

@Controller('admin/quality')
@ApiTags('Supplier Quality Administration')
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
@Roles(UserRole.ADMIN, UserRole.SUB_ADMIN)
export class AdminQualityController {
  constructor(private readonly prisma: PrismaService, private readonly performance: SupplierPerformanceService, private readonly snapshots: SupplierQualitySnapshotService, private readonly policies: SupplierQualityPolicyService, private readonly issues: SupplierQualityIssueService, private readonly tiers: SupplierTierService) {}

  @Get('overview') @Permissions('supplier.quality.view.admin') async overview() {
    const [vendors, openIssues, criticalIssues, policy, assignments] = await Promise.all([
      this.prisma.tenant.count({ where: { kind: TenantKind.VENDOR } }),
      this.prisma.supplierQualityIssue.count({ where: { status: { in: [SupplierQualityIssueStatus.OPEN, SupplierQualityIssueStatus.ACKNOWLEDGED] } } }),
      this.prisma.supplierQualityIssue.count({ where: { severity: 'CRITICAL', status: { in: [SupplierQualityIssueStatus.OPEN, SupplierQualityIssueStatus.ACKNOWLEDGED] } } }),
      this.prisma.supplierQualityPolicy.findFirst({ where: { status: 'ACTIVE' }, select: { id: true, versionNumber: true, name: true } }),
      this.prisma.supplierTierAssignment.groupBy({ by: ['tier'], where: { effectiveTo: null }, _count: { _all: true } }),
    ]);
    return { vendorsAssessed: policy ? await this.prisma.supplierQualitySnapshot.findMany({ where: { policyId: policy.id }, distinct: ['vendorTenantId'], select: { vendorTenantId: true } }).then((r) => r.length) : 0, vendors, openIssues, criticalIssues, policy, tierCounts: assignments.reduce((out, row) => ({ ...out, [row.tier]: row._count._all }), {}) };
  }

  @Get('vendors') @Permissions('supplier.quality.view.admin') async vendors(@Query() query: QualityVendorQueryDto) {
    const page = query.page || 1; const limit = query.limit || 25;
    const where = { kind: TenantKind.VENDOR, ...(query.search ? { OR: [{ name: { contains: query.search, mode: 'insensitive' as const } }, { slug: { contains: query.search, mode: 'insensitive' as const } }] } : {}), ...(query.tier ? { tierAssignments: { some: { effectiveTo: null, tier: query.tier } } } : {}), ...(query.issueStatus ? { qualityIssues: { some: { status: query.issueStatus } } } : {}) };
    const [total, rows] = await Promise.all([this.prisma.tenant.count({ where }), this.prisma.tenant.findMany({ where, include: { vendorProfile: true }, orderBy: { name: 'asc' }, skip: (page - 1) * limit, take: limit })]);
    const items = await Promise.all(rows.map(async (vendor) => { const current = await this.performance.computeCurrent(vendor.id); return { vendorTenantId: vendor.id, vendorName: vendor.name, verificationStatus: vendor.vendorProfile?.verificationStatus ?? null, currentTier: current.currentTier, qualityScore: current.overallScore, metrics: current.metrics.filter((m) => [ 'CONFIRMATION_WITHIN_SLA_RATE', 'VENDOR_CANCELLATION_RATE', 'VOUCHER_READY_BEFORE_SERVICE_RATE', 'LAST_MINUTE_STOP_SELL_RATE', 'LIVE_PRODUCT_IMAGE_COVERAGE_RATE' ].includes(m.metricCode)), openIssues: current.openIssues.length, lastAssessed: current.latestSnapshotForCurrentPolicy?.generatedAt ?? null }; }));
    return { items, page, limit, total };
  }

  @Get('vendors/:vendorTenantId') @Permissions('supplier.quality.view.admin') detail(@Param('vendorTenantId') id: string) { return this.performance.computeCurrent(id); }
  @Get('vendors/:vendorTenantId/history') @Permissions('supplier.quality.view.admin') async vendorHistory(@Param('vendorTenantId') id: string, @Query() query: QualityVendorQueryDto) {
    await this.performance.computeCurrent(id);
    const page = query.page || 1; const limit = query.limit || 25;
    const [total, items] = await Promise.all([
      this.prisma.supplierQualitySnapshot.count({ where: { vendorTenantId: id } }),
      this.prisma.supplierQualitySnapshot.findMany({ where: { vendorTenantId: id }, orderBy: { generatedAt: 'desc' }, skip: (page - 1) * limit, take: limit, include: { metricSnapshots: true, policy: { select: { id: true, versionNumber: true, name: true } } } }),
    ]);
    return { items, page, limit, total };
  }
  @Get('vendors/:vendorTenantId/tiers') @Permissions('supplier.quality.view.admin') async vendorTiers(@Param('vendorTenantId') id: string, @Query() query: QualityVendorQueryDto) {
    await this.performance.computeCurrent(id);
    const page = query.page || 1; const limit = query.limit || 25;
    const [total, items] = await Promise.all([
      this.prisma.supplierTierAssignment.count({ where: { vendorTenantId: id } }),
      this.prisma.supplierTierAssignment.findMany({ where: { vendorTenantId: id }, orderBy: { effectiveFrom: 'desc' }, skip: (page - 1) * limit, take: limit, include: { sourceSnapshot: { select: { id: true, generatedAt: true, policyId: true, overallScore: true, recommendedTier: true } } } }),
    ]);
    return { items, page, limit, total };
  }
  @Post('vendors/:vendorTenantId/recalculate') @Permissions('supplier.quality.snapshot.manage') recalculate(@Param('vendorTenantId') id: string) { return this.performance.computeCurrent(id); }
  @Post('vendors/:vendorTenantId/snapshots') @Permissions('supplier.quality.snapshot.manage') snapshot(@CurrentUser() user: AuthUser, @Param('vendorTenantId') id: string, @Body() dto: CaptureSnapshotDto) { return this.snapshots.capture(user, id, dto); }
  @Get('issues') @Permissions('supplier.quality.view.admin') issueList(@Query('vendorTenantId') vendorTenantId?: string) { return this.issues.list(vendorTenantId); }
  @Post('issues/:id/acknowledge') @Permissions('supplier.quality.issue.manage') acknowledge(@CurrentUser() user: AuthUser, @Param('id') id: string) { return this.issues.transition(user, id, 'acknowledge'); }
  @Post('issues/:id/resolve') @Permissions('supplier.quality.issue.manage') resolve(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: IssueReasonDto) { return this.issues.transition(user, id, 'resolve', dto); }
  @Post('issues/:id/dismiss') @Permissions('supplier.quality.issue.manage') dismiss(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: IssueReasonDto) { return this.issues.transition(user, id, 'dismiss', dto); }
  @Post('vendors/:vendorTenantId/tier') @Permissions('supplier.tier.manage') tier(@CurrentUser() user: AuthUser, @Param('vendorTenantId') id: string, @Body() dto: TierAssignmentDto) { return this.tiers.assign(user, id, dto); }
  @Get('policies') @Permissions('supplier.quality.view.admin') policyList() { return this.policies.list(); }
  @Post('policies') @Permissions('supplier.quality.policy.manage') policyCreate(@CurrentUser() user: AuthUser, @Body() dto: SupplierQualityPolicyDto) { return this.policies.create(user, dto); }
  @Patch('policies/:id') @Permissions('supplier.quality.policy.manage') policyUpdate(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: UpdateSupplierQualityPolicyDto) { return this.policies.update(user, id, dto); }
  @Post('policies/:id/activate') @Permissions('supplier.quality.policy.manage') policyActivate(@CurrentUser() user: AuthUser, @Param('id') id: string) { return this.policies.activate(user, id); }
  @Post('policies/:id/retire') @Permissions('supplier.quality.policy.manage') policyRetire(@CurrentUser() user: AuthUser, @Param('id') id: string) { return this.policies.retire(user, id); }
}
