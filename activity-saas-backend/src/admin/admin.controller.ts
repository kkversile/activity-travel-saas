import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Param,
  Patch,
  Put,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";
import { ApiBody, ApiOkResponse, ApiQuery, ApiTags } from "@nestjs/swagger";
import { BookingMode, BookingRecordType, BookingStatus, UserRole } from "@prisma/client";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { AuthUser } from "../common/auth.types";
import { CurrentUser } from "../common/current-user.decorator";
import { Roles } from "../common/roles.decorator";
import { RolesGuard } from "../common/roles.guard";
import { Permissions } from "../common/permissions.decorator";
import { PermissionsGuard } from "../common/permissions.guard";
import {
  AdminCreateProductDraftDto,
  AdminProductListQueryDto,
  AgentSuspensionDto,
  CouponDecisionDto,
  CouponStatusDto,
  CommercialGuardrailConfigurationDto,
  CreateAdminDto,
  CreatePlatformCouponDto,
  CreateVendorDto,
  DocumentReviewDto,
  EligibilityInspectDto,
  ResetAdminPasswordDto,
  UpdateAdminStatusDto,
  VendorCommercialChangeDto,
  VendorCommercialReviewDto,
  VendorVerificationDto,
} from "./governance.dto";
import { EligibilityService } from "../eligibility/eligibility.service";
import { AdminService } from "./admin.service";
import {
  BookingDecisionDto,
  BookingListQueryDto,
} from "../bookings/booking.dto";
import { BookingExpiryService } from "../bookings/booking-expiry.service";
import { BookingsService } from "../bookings/bookings.service";
import { CancellationService } from "../bookings/cancellation.service";
import {
  AdminCancellationListQueryDto,
  FinancialResolutionDto,
  OperationalCancellationDto,
  RefundConfirmDto,
  RefundFailDto,
} from "../bookings/cancellation.dto";
import {
  CreateExperienceMasterDto,
  DecideExperienceSuggestionDto,
  ExperiencePreviewQueryDto,
  ExperienceProductSearchDto,
  LinkExperienceProductDto,
  MapMasterOptionDto,
  PinExperienceProductDto,
  UpdateExperienceMasterDto,
  UpdateExperienceSelectionRulesDto,
} from "../experience-matching/experience-matching.dto";
import { ExperienceMatchingService } from "../experience-matching/experience-matching.service";
import { CatalogueService } from "../catalogue/catalogue.service";

@Controller("admin")
@ApiTags("Administration")
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
@Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
export class AdminController {
  constructor(
    private readonly service: AdminService,
    private readonly eligibility: EligibilityService,
    private readonly bookings: BookingsService,
    private readonly expiry: BookingExpiryService,
    private readonly cancellations: CancellationService,
    private readonly matching: ExperienceMatchingService,
    private readonly catalogue: CatalogueService,
  ) {}
  @Get("platform-admins") @Roles(UserRole.SUPER_ADMIN) platformAdmins() {
    return this.service.platformAdmins();
  }
  @Get("impersonation/targets")
  @Roles(UserRole.SUPER_ADMIN)
  impersonationTargets() {
    return this.service.impersonationTargets();
  }
  @Post("platform-admins")
  @Roles(UserRole.SUPER_ADMIN)
  @ApiBody({
    schema: {
      type: "object",
      example: {
        fullName: "Operations Admin",
        email: "operations@voya.demo",
        password: "ChangeMe@123",
      },
    },
  })
  createAdmin(@CurrentUser() user: AuthUser, @Body() dto: CreateAdminDto) {
    return this.service.createAdmin(user, dto);
  }
  @Post("vendors")
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @ApiBody({
    schema: {
      type: "object",
      example: {
        vendorName: "Demo Adventures Pvt. Ltd.",
        ownerName: "Demo Owner",
        cityName: "Malvan",
        mobile: "+919422018833",
        supplierType: "DIRECT_OPERATOR",
        email: "vendor@example.com",
        commercialModel: "COMMISSIONABLE",
        commissionPercent: 18,
        accountManagerName: "Operations One",
      },
    },
  })
  createVendor(@CurrentUser() user: AuthUser, @Body() dto: CreateVendorDto) {
    return this.service.createVendor(user, dto);
  }
  @Patch("platform-admins/:id/status")
  @Roles(UserRole.SUPER_ADMIN)
  updateAdminStatus(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Body() dto: UpdateAdminStatusDto,
  ) {
    return this.service.setAdminStatus(user, id, dto.active);
  }
  @Patch("platform-admins/:id/password")
  @Roles(UserRole.SUPER_ADMIN)
  resetAdminPassword(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Body() dto: ResetAdminPasswordDto,
  ) {
    return this.service.resetAdminPassword(user, id, dto.password);
  }
  @Patch("users/:id/password")
  @Roles(UserRole.SUPER_ADMIN)
  resetManagedUserPassword(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Body() dto: ResetAdminPasswordDto,
  ) {
    return this.service.resetManagedUserPassword(user, id, dto.password);
  }
  @Get("bookings")
  @ApiQuery({ name: "q", required: false, description: "Search booking/public codes, voucher codes, customer details, activity and vendor names." })
  @ApiQuery({ name: "channel", required: false, description: "Filter by channel code, such as VOYA_WEB, VOYA_AGENT or VOYA_API." })
  @ApiQuery({ name: "channelType", required: false, enum: ["INTERNAL_MARKETPLACE", "DIRECT", "OTA", "PARTNER_API"], description: "Filter by persisted distribution-channel type; PARTNER_API includes every partner-specific channel code." })
  @ApiQuery({ name: "status", required: false, enum: BookingStatus })
  @ApiQuery({ name: "statusGroup", required: false, enum: ["REJECTED"], description: "REJECTED combines vendor and manual rejections." })
  @ApiQuery({ name: "recordType", required: false, enum: BookingRecordType })
  @ApiQuery({ name: "bookingMode", required: false, enum: BookingMode })
  @ApiQuery({ name: "from", required: false, description: "Service date lower bound (YYYY-MM-DD)." })
  @ApiQuery({ name: "to", required: false, description: "Service date upper bound (YYYY-MM-DD)." })
  @ApiQuery({ name: "vendorTenantId", required: false })
  @ApiQuery({ name: "agentTenantId", required: false })
  @ApiQuery({ name: "page", required: false, type: Number, minimum: 1, default: 1 })
  @ApiQuery({ name: "limit", required: false, type: Number, minimum: 1, maximum: 100, default: 25 })
  @ApiOkResponse({ description: "A page of matching bookings and pagination metadata.", schema: { type: "object", required: ["items", "pagination"], properties: { items: { type: "array", items: { type: "object", additionalProperties: true } }, pagination: { type: "object", required: ["page", "limit", "total", "totalPages"], properties: { page: { type: "integer" }, limit: { type: "integer" }, total: { type: "integer" }, totalPages: { type: "integer" } } } } } })
  @Permissions("booking.view.admin") bookingsList(
    @Query() query: BookingListQueryDto,
  ) {
    return this.bookings.adminList(query);
  }
  @Get("bookings/:id") @Permissions("booking.view.admin") bookingsDetail(
    @Param("id") id: string,
  ) {
    return this.bookings.adminDetail(id);
  }
  @Post("bookings/:id/manual-confirm")
  @Permissions("booking.manual.decide")
  manualConfirm(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.bookings.manualConfirm(user, id);
  }
  @Post("bookings/:id/manual-reject")
  @Permissions("booking.manual.decide")
  manualReject(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Body() dto: BookingDecisionDto,
  ) {
    return this.bookings.manualReject(user, id, dto);
  }
  @Post("bookings/:id/confirm")
  @Permissions("booking.manual.decide")
  confirmLegacyPath(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.bookings.manualConfirm(user, id);
  }
  @Post("bookings/:id/reject")
  @Permissions("booking.manual.decide")
  rejectLegacyPath(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Body() dto: BookingDecisionDto,
  ) {
    return this.bookings.manualReject(user, id, dto);
  }
  @Post("bookings/expire-due") @Permissions("booking.expiry.run") expireDue(
    @CurrentUser() user: AuthUser,
  ) {
    return this.expiry.expireDue(new Date(), user);
  }
  @Post("bookings/:id/cancellation/preview")
  @Permissions("booking.cancel.admin")
  cancellationPreview(@Param("id") id: string) {
    return this.cancellations.adminPreview(id);
  }
  @Post("bookings/:id/cancellation")
  @Permissions("booking.cancel.admin")
  cancel(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Body() dto: OperationalCancellationDto,
  ) {
    return this.cancellations.operationalCancel(user, id, dto, "ADMIN");
  }
  @Get("refunds") @Permissions("refund.view") refunds() {
    return this.cancellations.refunds();
  }
  @Get("cancellations") @Permissions("refund.view") cancellationQueue(
    @Query() query: AdminCancellationListQueryDto,
  ) {
    return this.cancellations.operationalCancellations(query);
  }
  @Post("refunds/:id/confirm") @Permissions("refund.manage") confirmRefund(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Body() dto: RefundConfirmDto,
  ) {
    return this.cancellations.confirmRefund(user, id, dto);
  }
  @Post("refunds/:id/fail") @Permissions("refund.manage") failRefund(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Body() dto: RefundFailDto,
  ) {
    return this.cancellations.failRefund(user, id, dto);
  }
  @Post("refunds/:id/retry") @Permissions("refund.manage") retryRefund(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
  ) {
    return this.cancellations.retryRefund(user, id);
  }
  @Post("cancellations/:id/resolve-financial")
  @Permissions("financial.cancellation.resolve")
  resolveFinancial(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Body() dto: FinancialResolutionDto,
  ) {
    return this.cancellations.resolveFinancial(user, id, dto);
  }
  @Get("dashboard") @Permissions("audit.view") dashboard(
    @Query("period") period?: string,
  ) {
    return this.service.dashboard(period);
  }
  @Get("approvals") @Permissions("audit.view") approvals(
    @Query("type") type?: string,
    @CurrentUser() user?: AuthUser,
  ) {
    return this.service.approvals(type, user?.sub);
  }
  @Get("audit-log") @Permissions("audit.view") auditLog(
    @Query("action") action?: string,
    @Query("entityType") entityType?: string,
    @Query("limit") limit?: string,
  ) {
    return this.service.auditLog({ action, entityType, limit });
  }
  @Get("settings/visitor-pricing")
  @Permissions("platform.settings.manage")
  visitorPricingSettings() {
    return this.service.visitorPricingSettings();
  }
  @Patch("settings/visitor-pricing")
  @Permissions("platform.settings.manage")
  updateVisitorPricingSettings(
    @CurrentUser() user: AuthUser,
    @Body()
    dto: { showEligibilityBasis?: boolean; showVerificationRequired?: boolean },
  ) {
    return this.service.updateVisitorPricingSettings(user, dto);
  }
  @Get("settings/commercial-guardrails")
  @Permissions("platform.settings.manage")
  commercialGuardrails() {
    return this.service.commercialGuardrails();
  }
  @Patch("settings/commercial-guardrails")
  @Permissions("platform.settings.manage")
  submitCommercialGuardrails(@CurrentUser() user: AuthUser, @Body() dto: CommercialGuardrailConfigurationDto) {
    return this.service.submitCommercialGuardrails(user, dto);
  }
  @Post("settings/commercial-guardrails/approve")
  @Roles(UserRole.SUPER_ADMIN)
  @Permissions("platform.settings.manage")
  approveCommercialGuardrails(@CurrentUser() user: AuthUser) {
    return this.service.approveCommercialGuardrails(user);
  }
  @Get("settings/activity-content")
  @Permissions("platform.settings.manage")
  activityContentSettings() {
    return this.service.activityContentSettings();
  }
  @Get("activity-content-settings")
  @Permissions("product.view")
  activityContentSettingsForProductWizard() {
    return this.service.activityContentSettings();
  }
  @Patch("settings/activity-content")
  @Permissions("platform.settings.manage")
  updateActivityContentSettings(
    @CurrentUser() user: AuthUser,
    @Body()
    dto: {
      terms?: string[];
      howToRedeem?: string[];
      bookingQuestions?: Array<{
        code: string;
        label: string;
        type: string;
        required?: boolean;
      }>;
    },
  ) {
    return this.service.updateActivityContentSettings(user, dto as any);
  }
  @Get("settings/overview")
  @Permissions("platform.settings.manage")
  configurationOverview() {
    return this.service.configurationOverview();
  }
  @Get("vendors") @Permissions("vendor.profile.view") vendors() {
    return this.service.vendors();
  }
  @Get("products") @Permissions("product.view") products(
    @Query() query: AdminProductListQueryDto,
  ) {
    return this.service.products(query);
  }
  @Get("lookup") @Permissions("product.view") lookup(@Query("q") query: string, @CurrentUser() user: AuthUser) {
    return this.service.globalLookup(query, user.role === UserRole.SUPER_ADMIN);
  }
  @Post("products") @Permissions("product.edit") createProductOnBehalf(
    @CurrentUser() user: AuthUser,
    @Body() dto: AdminCreateProductDraftDto,
  ) {
    if (
      dto.approvalMode === "PUBLISH_DIRECTLY" &&
      user.role !== UserRole.SUPER_ADMIN
    )
      throw new ForbiddenException(
        "Only super admins can publish an activity directly",
      );
    const {
      tenantId,
      channels,
      rankingBoost,
      marginOverride,
      approvalMode,
      internalNote,
      ...draft
    } = dto;
    const adminMetadata = {
      channels: channels || [],
      rankingBoost: rankingBoost || "NONE",
      marginOverride: marginOverride || "USE_PRICING_RULES",
      approvalMode: approvalMode || "SEND_TO_QC",
      internalNote: internalNote?.trim() || null,
    };
    return this.catalogue.createDraftAsAdmin(user, tenantId, {
      ...draft,
      channels: channels || [],
      sourcePayload: { ...(draft.sourcePayload || {}), admin: adminMetadata },
    });
  }
  @Get("promotions") @Permissions("product.view") promotions() {
    return this.service.promotions();
  }
  @Post("promotions") @Permissions("product.edit") createPromotion(
    @CurrentUser() user: AuthUser,
    @Body() dto: Record<string, unknown>,
  ) {
    return this.service.createPromotion(user, dto);
  }
  @Patch("promotions/:id") @Permissions("product.edit") updatePromotion(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Body() dto: Record<string, unknown>,
  ) {
    return this.service.updatePromotion(user, id, dto);
  }
  @Get("platform-coupons") @Permissions("product.view") platformCoupons() {
    return this.service.platformCoupons();
  }
  @Post("platform-coupons") @Permissions("product.edit") createPlatformCoupon(
    @CurrentUser() user: AuthUser,
    @Body() dto: CreatePlatformCouponDto,
  ) {
    return this.service.createPlatformCoupon(user, dto);
  }
  @Post("platform-coupons/:id/approve")
  @Permissions("product.publish")
  approvePlatformCoupon(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
  ) {
    return this.service.decidePlatformCoupon(user, id, "APPROVE");
  }
  @Post("platform-coupons/:id/reject")
  @Permissions("product.publish")
  rejectPlatformCoupon(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Body() dto: CouponDecisionDto,
  ) {
    return this.service.decidePlatformCoupon(user, id, "REJECT", dto.reason);
  }
  @Patch("platform-coupons/:id/status")
  @Permissions("product.edit")
  setPlatformCouponStatus(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Body() dto: CouponStatusDto,
  ) {
    return this.service.setPlatformCouponStatus(
      user,
      id,
      dto.status as "ACTIVE" | "PAUSED",
    );
  }
  @Get("experience-matching/products")
  @Permissions("product.view")
  matchingProducts(@Query() query: ExperienceProductSearchDto) {
    return this.matching.products(query);
  }
  @Get("experience-matching/suggestions")
  @Permissions("product.view")
  matchingSuggestions() {
    return this.matching.suggestions();
  }
  @Get("mapping-suggestions")
  @Permissions("product.view")
  documentedMappingSuggestions() {
    return this.matching.suggestions();
  }
  @Post("mapping-suggestions/:id/decide")
  @Permissions("product.publish")
  decideMappingSuggestion(@CurrentUser() user: AuthUser, @Param("id") id: string, @Body() dto: DecideExperienceSuggestionDto) {
    return this.matching.decideSuggestion(user, id, dto);
  }
  @Get("experience-matching/masters")
  @Permissions("product.view")
  matchingMasters() {
    return this.matching.masters();
  }
  @Get("experience-matching/insights")
  @Permissions("product.view")
  matchingInsights() {
    return this.matching.insights();
  }
  @Get("experience-matching/selection-rules")
  @Permissions("product.view")
  matchingSelectionRules(@Query("scope") scope?: string) {
    return this.matching.selectionRules(scope || "GLOBAL");
  }
  @Patch("experience-matching/selection-rules")
  @Permissions("product.publish")
  updateMatchingSelectionRules(
    @CurrentUser() user: AuthUser,
    @Body() dto: UpdateExperienceSelectionRulesDto,
  ) {
    return this.matching.updateSelectionRules(user, dto);
  }
  @Put("selection-rules/:scope")
  @Permissions("product.publish")
  updateDocumentedSelectionRules(@CurrentUser() user: AuthUser, @Param("scope") scope: string, @Body() dto: UpdateExperienceSelectionRulesDto) {
    return this.matching.updateSelectionRules(user, { ...dto, scope });
  }
  @Post("experience-matching/selection-rules/approve")
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @Permissions("product.publish")
  approveMatchingSelectionRules(
    @CurrentUser() user: AuthUser,
    @Body("scope") scope?: string,
  ) {
    return this.matching.approveSelectionRules(user, scope || "GLOBAL");
  }
  @Get("experience-matching/masters/:id/preview")
  @Permissions("product.view")
  matchingPreview(
    @Param("id") id: string,
    @Query() query: ExperiencePreviewQueryDto,
  ) {
    return this.matching.preview(id, query);
  }
  @Get("master-options/:id/ranking")
  @Permissions("product.view")
  documentedMasterRanking(@Param("id") id: string, @Query() query: ExperiencePreviewQueryDto) {
    return this.matching.preview(id, query);
  }
  @Get("experience-matching/masters/:id")
  @Permissions("product.view")
  matchingDetail(@Param("id") id: string) {
    return this.matching.detail(id);
  }
  @Post("experience-matching/masters")
  @Permissions("product.publish")
  createMatchingMaster(
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateExperienceMasterDto,
  ) {
    return this.matching.createMaster(user, dto);
  }
  @Patch("experience-matching/masters/:id")
  @Permissions("product.publish")
  updateMatchingMaster(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Body() dto: UpdateExperienceMasterDto,
  ) {
    return this.matching.update(user, id, dto);
  }
  @Post("experience-matching/masters/:id/products")
  @Permissions("product.publish")
  linkMatchingProduct(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Body() dto: LinkExperienceProductDto,
  ) {
    return this.matching.link(user, id, dto);
  }
  @Delete("experience-matching/masters/:id/products/:productId")
  @Permissions("product.publish")
  unlinkMatchingProduct(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Param("productId") productId: string,
  ) {
    return this.matching.unlink(user, id, productId);
  }
  @Post("experience-matching/masters/:id/pin")
  @Permissions("product.publish")
  pinMatchingProduct(@CurrentUser() user: AuthUser, @Param("id") id: string, @Body() dto: PinExperienceProductDto) {
    return this.matching.pinProduct(user, id, dto);
  }
  @Post("master-options/:id/pin")
  @Permissions("product.publish")
  pinMasterOption(@CurrentUser() user: AuthUser, @Param("id") id: string, @Body() dto: PinExperienceProductDto) {
    return this.matching.pinProduct(user, id, dto);
  }
  @Post("master-options/:id/map")
  @Permissions("product.publish")
  mapMasterOption(@CurrentUser() user: AuthUser, @Param("id") id: string, @Body() dto: MapMasterOptionDto) {
    return this.matching.mapMasterOption(user, id, dto);
  }
  @Post("experience-matching/suggestions/:id/reject")
  @Permissions("product.publish")
  rejectMatchingSuggestion(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
  ) {
    return this.matching.rejectSuggestion(user, id);
  }
  @Post("products/:id/deactivate")
  @Permissions("product.publish")
  deactivateProduct(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.service.deactivateProduct(user, id);
  }
  @Post("products/:id/archive") @Permissions("product.publish") archiveProduct(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
  ) {
    return this.service.archiveProduct(user, id);
  }
  @Get("agents") @Permissions("agent.governance.view") agents() {
    return this.service.agents();
  }
  @Get("agents/tiers") @Permissions("agent.governance.view") agentTiers() {
    return this.service.agentTiers();
  }
  @Patch("agents/tiers") @Permissions("agent.governance.edit") updateAgentTiers(
    @CurrentUser() user: AuthUser,
    @Body() dto: { tiers: unknown[]; reason: string },
  ) {
    return this.service.updateAgentTiers(user, dto.tiers, dto.reason);
  }
  @Post("agent-tier-change-requests/:requestId/approve") @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN) @Permissions("agent.governance.edit") approveAgentTiers(@CurrentUser() user: AuthUser, @Param("requestId") requestId: string) {
    return this.service.approveAgentTiers(user, requestId);
  }
  @Post("agent-tier-change-requests/:requestId/reject") @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN) @Permissions("agent.governance.edit") rejectAgentTiers(@CurrentUser() user: AuthUser, @Param("requestId") requestId: string, @Body() dto: { reason: string }) {
    return this.service.rejectAgentTiers(user, requestId, dto.reason);
  }
  @Patch("agents/:tenantId/commercials")
  @Permissions("agent.governance.edit")
  updateAgentCommercials(
    @CurrentUser() user: AuthUser,
    @Param("tenantId") tenantId: string,
    @Body()
    dto: {
      tier?: string;
      commissionPercent?: number;
      creditLimit?: number;
      creditDays?: number;
      markupAllowedPercent?: number;
      reason: string;
    },
  ) {
    return this.service.updateAgentCommercials(user, tenantId, dto);
  }
  @Post("agent-commercial-change-requests/:requestId/approve") @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN) @Permissions("agent.governance.edit") approveAgentCommercialChange(@CurrentUser() user: AuthUser, @Param("requestId") requestId: string) {
    return this.service.approveAgentCommercialChange(user, requestId);
  }
  @Post("agent-commercial-change-requests/:requestId/reject") @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN) @Permissions("agent.governance.edit") rejectAgentCommercialChange(@CurrentUser() user: AuthUser, @Param("requestId") requestId: string, @Body() dto: { reason: string }) {
    return this.service.rejectAgentCommercialChange(user, requestId, dto.reason);
  }
  @Post("agents/:tenantId/wallet/credit")
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @Permissions("agent.governance.edit")
  creditAgentWallet(
    @CurrentUser() user: AuthUser,
    @Param("tenantId") tenantId: string,
    @Body() dto: { amount: number; reason: string; reference?: string; paymentMethod?: string },
  ) {
    return this.service.creditAgentWallet(
      user,
      tenantId,
      dto.amount,
      dto.reason,
      dto.reference,
      dto.paymentMethod,
    );
  }
  @Post("agent-wallet-credit-requests/:requestId/approve") @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN) @Permissions("agent.governance.edit") approveAgentWalletCredit(@CurrentUser() user: AuthUser, @Param("requestId") requestId: string) {
    return this.service.approveAgentWalletCredit(user, requestId);
  }
  @Post("agent-wallet-credit-requests/:requestId/reject") @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN) @Permissions("agent.governance.edit") rejectAgentWalletCredit(@CurrentUser() user: AuthUser, @Param("requestId") requestId: string, @Body() dto: { reason: string }) {
    return this.service.rejectAgentWalletCredit(user, requestId, dto.reason);
  }
  @Get("agent-wallet-ledger")
  @Permissions("agent.governance.view")
  agentWalletLedger() {
    return this.service.agentWalletLedger();
  }
  @Post("agents/:tenantId/approve")
  @Permissions("agent.governance.edit")
  approveAgent(
    @CurrentUser() user: AuthUser,
    @Param("tenantId") tenantId: string,
  ) {
    return this.service.approveAgent(user, tenantId);
  }
  @Post("agents/:tenantId/suspend")
  @Permissions("agent.governance.edit")
  suspendAgent(
    @CurrentUser() user: AuthUser,
    @Param("tenantId") tenantId: string,
    @Body() dto: AgentSuspensionDto,
  ) {
    return this.service.suspendAgent(user, tenantId, dto.reason);
  }
  @Post("rate-plans/:ratePlanId/agent-channel")
  @Permissions("marketplace.channel.manage")
  setAgentChannel(
    @CurrentUser() user: AuthUser,
    @Param("ratePlanId") ratePlanId: string,
    @Body() dto: { enabled: boolean },
  ) {
    return this.service.setRatePlanChannel(user, ratePlanId, dto.enabled);
  }
  @Post("eligibility/inspect") @Permissions("eligibility.inspect") inspect(
    @Body() dto: EligibilityInspectDto,
  ) {
    return this.eligibility.evaluate({
      agentTenantId: dto.agentTenantId,
      ratePlanId: dto.ratePlanId,
      sessionId: dto.sessionId,
      travellers: dto.travellers as any,
      units: dto.units,
      now: dto.now ? new Date(dto.now) : undefined,
      channelCode: "VOYA_AGENT",
    });
  }
  @Get("vendors/:tenantId")
  @Permissions("vendor.profile.view", "document.view")
  vendor(@Param("tenantId") tenantId: string) {
    return this.service.vendor(tenantId);
  }
  @Patch("vendors/:tenantId/commercials")
  @Permissions("commercial.internal.edit")
  requestVendorCommercialChange(@CurrentUser() user: AuthUser, @Param("tenantId") tenantId: string, @Body() dto: VendorCommercialChangeDto) {
    return this.service.requestVendorCommercialChange(user, tenantId, dto);
  }
  @Post("vendors/:tenantId/commercials/:requestId/approve")
  @Permissions("commercial.internal.edit")
  approveVendorCommercialChange(@CurrentUser() user: AuthUser, @Param("tenantId") tenantId: string, @Param("requestId") requestId: string, @Body() dto: VendorCommercialReviewDto) {
    return this.service.reviewVendorCommercialChange(user, tenantId, requestId, "APPROVED", dto.reason);
  }
  @Post("vendors/:tenantId/commercials/:requestId/reject")
  @Permissions("commercial.internal.edit")
  rejectVendorCommercialChange(@CurrentUser() user: AuthUser, @Param("tenantId") tenantId: string, @Param("requestId") requestId: string, @Body() dto: VendorCommercialReviewDto) {
    return this.service.reviewVendorCommercialChange(user, tenantId, requestId, "REJECTED", dto.reason);
  }
  @Patch("vendors/:tenantId/verification")
  @ApiBody({
    schema: {
      type: "object",
      example: {
        status: "VERIFIED",
        reason: "Business details and documents verified.",
      },
    },
  })
  @Permissions("document.review")
  verification(
    @CurrentUser() user: AuthUser,
    @Param("tenantId") tenantId: string,
    @Body() dto: VendorVerificationDto,
  ) {
    return this.service.verification(user, tenantId, dto.status, dto.reason);
  }
  @Patch("vendors/:tenantId/documents/versions/:versionId")
  @ApiBody({
    schema: {
      type: "object",
      example: {
        status: "VERIFIED",
        reason: "Document reviewed and accepted.",
      },
    },
  })
  @Permissions("document.review")
  document(
    @CurrentUser() user: AuthUser,
    @Param("tenantId") tenantId: string,
    @Param("versionId") versionId: string,
    @Body() dto: DocumentReviewDto,
  ) {
    return this.service.document(
      user,
      tenantId,
      versionId,
      dto.status,
      dto.reason,
    );
  }
}
