import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from "@nestjs/common";
import { ApiHeader, ApiTags } from "@nestjs/swagger";
import { UserRole } from "@prisma/client";
import { AccessTokenGuard } from "../../auth/auth.guard";
import { Roles } from "../../auth/roles.decorator";
import { RolesGuard } from "../../auth/roles.guard";
import { TenantAccessGuard } from "../../auth/tenant.guard";
import { TenantContext, TenantContextValue } from "../../common/tenant-context";
import { CreatePricePlanDto, PricePlanQueryDto, UpdatePricePlanDto } from "./dto/price-plan.dto";
import { PricePlansService } from "./price-plans.service";
@ApiTags("price-plans") @ApiHeader({ name: "x-tenant-id", required: true }) @Controller("price-plans") @UseGuards(AccessTokenGuard, TenantAccessGuard, RolesGuard)
export class PricePlansController { constructor(private readonly plans: PricePlansService) {} @Get() list(@TenantContext() context: TenantContextValue, @Query() query: PricePlanQueryDto) { return this.plans.list(context.tenantId, query); } @Post() @Roles(UserRole.PARTNER_ADMIN, UserRole.ACTIVITY_MANAGER) create(@TenantContext() context: TenantContextValue, @Body() dto: CreatePricePlanDto) { return this.plans.create(context.tenantId, dto); } @Get(":id") get(@TenantContext() context: TenantContextValue, @Param("id") id: string) { return this.plans.get(context.tenantId, id); } @Patch(":id") @Roles(UserRole.PARTNER_ADMIN, UserRole.ACTIVITY_MANAGER) update(@TenantContext() context: TenantContextValue, @Param("id") id: string, @Body() dto: UpdatePricePlanDto) { return this.plans.update(context.tenantId, id, dto); } @Delete(":id") @Roles(UserRole.PARTNER_ADMIN, UserRole.ACTIVITY_MANAGER) remove(@TenantContext() context: TenantContextValue, @Param("id") id: string) { return this.plans.remove(context.tenantId, id); } }
