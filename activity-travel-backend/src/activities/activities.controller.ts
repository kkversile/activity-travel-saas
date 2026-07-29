import { Body, Controller, Get, Param, Post, Put, Query, UseGuards } from "@nestjs/common";
import { ApiHeader, ApiTags } from "@nestjs/swagger";
import {
  TenantContext,
  TenantContextValue
} from "../common/tenant-context";
import { ActivitiesService } from "./activities.service";
import { AccessTokenGuard } from "../auth/auth.guard";
import { TenantAccessGuard } from "../auth/tenant.guard";
import { RolesGuard } from "../auth/roles.guard";
import { Roles } from "../auth/roles.decorator";
import { UserRole, ActivityStatus } from "@prisma/client";
import { CreateActivityDto, CreateBlackoutDto, CreateCancellationRuleDto, CreateCategoryDto, CreateDestinationDto, CreatePricePlanDto, CreateRecurringScheduleDto, CreateScheduleDto, CreateVariantDto, UpdateActivityDto } from "./dto/activity.dto";

@ApiTags("activities")
@ApiHeader({ name: "x-tenant-id", required: true })
@UseGuards(AccessTokenGuard, TenantAccessGuard, RolesGuard)
@Controller("activities")
export class ActivitiesController {
  constructor(private readonly activitiesService: ActivitiesService) {}

  @Get()
  list(@TenantContext() context: TenantContextValue, @Query("search") search?: string, @Query("status") status?: ActivityStatus, @Query("page") page?: string) {
    return this.activitiesService.list(context.tenantId, { search, status, page: page ? Number(page) : undefined });
  }

  @Post()
  @Roles(UserRole.PARTNER_ADMIN, UserRole.ACTIVITY_MANAGER)
  create(@TenantContext() context: TenantContextValue, @Body() dto: CreateActivityDto) { return this.activitiesService.create(context.tenantId, dto); }

  @Put(":id")
  @Roles(UserRole.PARTNER_ADMIN, UserRole.ACTIVITY_MANAGER)
  update(@TenantContext() context: TenantContextValue, @Param("id") id: string, @Body() dto: UpdateActivityDto) { return this.activitiesService.update(context.tenantId, id, dto); }

  @Post(":id/publish")
  @Roles(UserRole.PARTNER_ADMIN, UserRole.ACTIVITY_MANAGER)
  publish(@TenantContext() context: TenantContextValue, @Param("id") id: string) { return this.activitiesService.publish(context.tenantId, id, ActivityStatus.PUBLISHED); }

  @Post(":id/schedules")
  @Roles(UserRole.PARTNER_ADMIN, UserRole.ACTIVITY_MANAGER)
  createSchedule(@TenantContext() context: TenantContextValue, @Param("id") id: string, @Body() dto: CreateScheduleDto) { return this.activitiesService.createSchedule(context.tenantId, id, dto); }

  @Post(":id/prices")
  @Roles(UserRole.PARTNER_ADMIN, UserRole.ACTIVITY_MANAGER)
  createPrice(@TenantContext() context: TenantContextValue, @Param("id") id: string, @Body() dto: CreatePricePlanDto) { return this.activitiesService.createPricePlan(context.tenantId, id, dto); }

  @Get(":id/availability")
  availability(@TenantContext() context: TenantContextValue, @Param("id") id: string) { return this.activitiesService.availability(context.tenantId, id); }

  @Get("catalog/categories")
  categories(@TenantContext() context: TenantContextValue) { return this.activitiesService.listCategories(context.tenantId); }

  @Post("catalog/categories")
  @Roles(UserRole.PARTNER_ADMIN, UserRole.ACTIVITY_MANAGER)
  createCategory(@TenantContext() context: TenantContextValue, @Body() dto: CreateCategoryDto) { return this.activitiesService.createCategory(context.tenantId, dto); }

  @Get("catalog/destinations")
  destinations(@TenantContext() context: TenantContextValue) { return this.activitiesService.listDestinations(context.tenantId); }

  @Post("catalog/destinations")
  @Roles(UserRole.PARTNER_ADMIN, UserRole.ACTIVITY_MANAGER)
  createDestination(@TenantContext() context: TenantContextValue, @Body() dto: CreateDestinationDto) { return this.activitiesService.createDestination(context.tenantId, dto); }

  @Post(":id/recurrences")
  @Roles(UserRole.PARTNER_ADMIN, UserRole.ACTIVITY_MANAGER)
  createRecurrence(@TenantContext() context: TenantContextValue, @Param("id") id: string, @Body() dto: CreateRecurringScheduleDto) { return this.activitiesService.createRecurringSchedule(context.tenantId, id, dto); }

  @Post(":id/recurrences/:recurringId/generate")
  @Roles(UserRole.PARTNER_ADMIN, UserRole.ACTIVITY_MANAGER)
  generateRecurrence(@TenantContext() context: TenantContextValue, @Param("recurringId") recurringId: string) { return this.activitiesService.generateRecurringDepartures(context.tenantId, recurringId); }

  @Post("schedules/:scheduleId/blackouts")
  @Roles(UserRole.PARTNER_ADMIN, UserRole.ACTIVITY_MANAGER)
  addBlackout(@TenantContext() context: TenantContextValue, @Param("scheduleId") scheduleId: string, @Body() dto: CreateBlackoutDto) { return this.activitiesService.addBlackout(context.tenantId, scheduleId, dto); }

  @Get(":id/variants")
  variants(@TenantContext() context: TenantContextValue, @Param("id") id: string) { return this.activitiesService.listVariants(context.tenantId, id); }

  @Post(":id/variants")
  @Roles(UserRole.PARTNER_ADMIN, UserRole.ACTIVITY_MANAGER)
  createVariant(@TenantContext() context: TenantContextValue, @Param("id") id: string, @Body() dto: CreateVariantDto) { return this.activitiesService.createVariant(context.tenantId, id, dto); }

  @Get(":id/cancellation-rules")
  cancellationRules(@TenantContext() context: TenantContextValue, @Param("id") id: string) { return this.activitiesService.listCancellationRules(context.tenantId, id); }

  @Post(":id/cancellation-rules")
  @Roles(UserRole.PARTNER_ADMIN, UserRole.ACTIVITY_MANAGER)
  createCancellationRule(@TenantContext() context: TenantContextValue, @Param("id") id: string, @Body() dto: CreateCancellationRuleDto) { return this.activitiesService.createCancellationRule(context.tenantId, id, dto); }

  @Get(":id")
  getById(
    @TenantContext() context: TenantContextValue,
    @Param("id") id: string
  ) {
    return this.activitiesService.getById(context.tenantId, id);
  }
}
