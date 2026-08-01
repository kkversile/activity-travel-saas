import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from "@nestjs/common";
import { ApiHeader, ApiTags } from "@nestjs/swagger";
import { UserRole } from "@prisma/client";
import { AccessTokenGuard } from "../../auth/auth.guard";
import { Roles } from "../../auth/roles.decorator";
import { RolesGuard } from "../../auth/roles.guard";
import { TenantAccessGuard } from "../../auth/tenant.guard";
import { TenantContext, TenantContextValue } from "../../common/tenant-context";
import { DestinationsService } from "./destinations.service";
import { CreateDestinationDto, UpdateDestinationDto } from "./dto/destination.dto";
import { DestinationQueryDto } from "./dto/destination-query.dto";
@ApiTags("destinations") @ApiHeader({ name: "x-tenant-id", required: true }) @Controller("destinations") @UseGuards(AccessTokenGuard, TenantAccessGuard, RolesGuard)
export class DestinationsController { constructor(private readonly destinations: DestinationsService) {} @Get() list(@TenantContext() context: TenantContextValue, @Query() query: DestinationQueryDto) { return this.destinations.list(context.tenantId, query); } @Post() @Roles(UserRole.PARTNER_ADMIN, UserRole.ACTIVITY_MANAGER) create(@TenantContext() context: TenantContextValue, @Body() dto: CreateDestinationDto) { return this.destinations.create(context.tenantId, dto); } @Get(":id") get(@TenantContext() context: TenantContextValue, @Param("id") id: string) { return this.destinations.get(context.tenantId, id); } @Patch(":id") @Roles(UserRole.PARTNER_ADMIN, UserRole.ACTIVITY_MANAGER) update(@TenantContext() context: TenantContextValue, @Param("id") id: string, @Body() dto: UpdateDestinationDto) { return this.destinations.update(context.tenantId, id, dto); } @Delete(":id") @Roles(UserRole.PARTNER_ADMIN) remove(@TenantContext() context: TenantContextValue, @Param("id") id: string) { return this.destinations.remove(context.tenantId, id); } }
