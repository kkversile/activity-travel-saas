import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from "@nestjs/common";
import { ApiHeader, ApiTags } from "@nestjs/swagger";
import { UserRole } from "@prisma/client";
import { AccessTokenGuard } from "../../auth/auth.guard";
import { Roles } from "../../auth/roles.decorator";
import { RolesGuard } from "../../auth/roles.guard";
import { TenantAccessGuard } from "../../auth/tenant.guard";
import { TenantContext, TenantContextValue } from "../../common/tenant-context";
import { CreateCustomerDto, CustomerQueryDto, UpdateCustomerDto } from "./dto/customer.dto";
import { CustomersService } from "./customers.service";
@ApiTags("customers") @ApiHeader({ name: "x-tenant-id", required: true }) @Controller("customers") @UseGuards(AccessTokenGuard, TenantAccessGuard, RolesGuard)
export class CustomersController { constructor(private readonly customers: CustomersService) {} @Get() list(@TenantContext() context: TenantContextValue, @Query() query: CustomerQueryDto) { return this.customers.list(context.tenantId, query); } @Post() @Roles(UserRole.PARTNER_ADMIN, UserRole.BOOKING_AGENT) create(@TenantContext() context: TenantContextValue, @Body() dto: CreateCustomerDto) { return this.customers.create(context.tenantId, dto); } @Get(":id") get(@TenantContext() context: TenantContextValue, @Param("id") id: string) { return this.customers.get(context.tenantId, id); } @Patch(":id") @Roles(UserRole.PARTNER_ADMIN, UserRole.BOOKING_AGENT) update(@TenantContext() context: TenantContextValue, @Param("id") id: string, @Body() dto: UpdateCustomerDto) { return this.customers.update(context.tenantId, id, dto); } @Delete(":id") @Roles(UserRole.PARTNER_ADMIN) remove(@TenantContext() context: TenantContextValue, @Param("id") id: string) { return this.customers.remove(context.tenantId, id); } }
