import { Body, Controller, Get, Param, Post, Put, Query, UseGuards } from "@nestjs/common";
import { ApiHeader, ApiTags } from "@nestjs/swagger";
import { UserRole } from "@prisma/client";
import { AccessTokenGuard } from "../auth/auth.guard";
import { Roles } from "../auth/roles.decorator";
import { RolesGuard } from "../auth/roles.guard";
import { TenantAccessGuard } from "../auth/tenant.guard";
import { TenantContext, TenantContextValue } from "../common/tenant-context";
import { UsersService } from "./users.service";
import { CreateUserDto, UpdateUserDto, UserQueryDto } from "./users.dto";

@ApiTags("users")
@ApiHeader({ name: "x-tenant-id", required: true })
@Controller("users")
@UseGuards(AccessTokenGuard, TenantAccessGuard, RolesGuard)
@Roles(UserRole.PLATFORM_ADMIN, UserRole.PARTNER_ADMIN)
export class UsersController {
  constructor(private readonly users: UsersService) {}
  @Get()
  list(@TenantContext() context: TenantContextValue, @Query() query: UserQueryDto) { return this.users.list(context.tenantId, query); }
  @Post()
  create(@TenantContext() context: TenantContextValue, @Body() dto: CreateUserDto) { return this.users.create(context.tenantId, dto); }
  @Put(":id")
  update(@TenantContext() context: TenantContextValue, @Param("id") id: string, @Body() dto: UpdateUserDto) { return this.users.update(context.tenantId, id, dto); }
}
