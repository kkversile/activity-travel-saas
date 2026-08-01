import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from "@nestjs/common";
import { ApiHeader, ApiTags } from "@nestjs/swagger";
import { UserRole } from "@prisma/client";
import { AccessTokenGuard } from "../../auth/auth.guard";
import { Roles } from "../../auth/roles.decorator";
import { RolesGuard } from "../../auth/roles.guard";
import { TenantAccessGuard } from "../../auth/tenant.guard";
import { TenantContext, TenantContextValue } from "../../common/tenant-context";
import { CreateSupplierDto, SupplierQueryDto, UpdateSupplierDto } from "./dto/supplier.dto";
import { SupplierActivityDto } from "./dto/supplier-activity.dto";
import { SuppliersService } from "./suppliers.service";

@ApiTags("suppliers")
@ApiHeader({ name: "x-tenant-id", required: true })
@Controller("suppliers")
@UseGuards(AccessTokenGuard, TenantAccessGuard, RolesGuard)
export class SuppliersController {
  constructor(private readonly suppliers: SuppliersService) {}

  @Get()
  list(@TenantContext() c: TenantContextValue, @Query() q: SupplierQueryDto) { return this.suppliers.list(c.tenantId, q); }

  @Post()
  @Roles(UserRole.PARTNER_ADMIN)
  create(@TenantContext() c: TenantContextValue, @Body() d: CreateSupplierDto) { return this.suppliers.create(c.tenantId, d); }

  @Get(":id/activities")
  listActivities(@TenantContext() c: TenantContextValue, @Param("id") id: string) { return this.suppliers.listActivities(c.tenantId, id); }

  @Post(":id/activities")
  @Roles(UserRole.PARTNER_ADMIN)
  assignActivity(@TenantContext() c: TenantContextValue, @Param("id") id: string, @Body() d: SupplierActivityDto) { return this.suppliers.assignActivity(c.tenantId, id, d); }

  @Delete(":id/activities/:activityId")
  @Roles(UserRole.PARTNER_ADMIN)
  archiveActivity(@TenantContext() c: TenantContextValue, @Param("id") id: string, @Param("activityId") activityId: string) { return this.suppliers.archiveActivity(c.tenantId, id, activityId); }

  @Get(":id")
  get(@TenantContext() c: TenantContextValue, @Param("id") id: string) { return this.suppliers.get(c.tenantId, id); }

  @Patch(":id")
  @Roles(UserRole.PARTNER_ADMIN)
  update(@TenantContext() c: TenantContextValue, @Param("id") id: string, @Body() d: UpdateSupplierDto) { return this.suppliers.update(c.tenantId, id, d); }

  @Delete(":id")
  @Roles(UserRole.PARTNER_ADMIN)
  remove(@TenantContext() c: TenantContextValue, @Param("id") id: string) { return this.suppliers.remove(c.tenantId, id); }
}
