import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from "@nestjs/common";
import { ApiHeader, ApiTags } from "@nestjs/swagger";
import { UserRole } from "@prisma/client";
import { AccessTokenGuard } from "../../auth/auth.guard";
import { Roles } from "../../auth/roles.decorator";
import { RolesGuard } from "../../auth/roles.guard";
import { TenantAccessGuard } from "../../auth/tenant.guard";
import { TenantContext, TenantContextValue } from "../../common/tenant-context";
import { CreateCustomRoleDto, RoleQueryDto, UpdateCustomRoleDto } from "./roles.dto";
import { RolesService } from "./roles.service";

@ApiTags("roles")
@ApiHeader({ name: "x-tenant-id", required: true })
@Controller("roles")
@UseGuards(AccessTokenGuard, TenantAccessGuard, RolesGuard)
@Roles(UserRole.PLATFORM_ADMIN, UserRole.PARTNER_ADMIN)
export class RolesController {
  constructor(private readonly roles: RolesService) {}

  @Get()
  list(@TenantContext() context: TenantContextValue, @Query() query: RoleQueryDto) { return this.roles.list(context.tenantId, query); }

  @Post()
  create(@TenantContext() context: TenantContextValue, @Body() dto: CreateCustomRoleDto) { return this.roles.create(context.tenantId, dto); }

  @Patch(":id")
  update(@TenantContext() context: TenantContextValue, @Param("id") id: string, @Body() dto: UpdateCustomRoleDto) { return this.roles.update(context.tenantId, id, dto); }

  @Delete(":id")
  archive(@TenantContext() context: TenantContextValue, @Param("id") id: string) { return this.roles.remove(context.tenantId, id); }
}
