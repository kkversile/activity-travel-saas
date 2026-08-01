import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from "@nestjs/common";
import { ApiHeader, ApiTags } from "@nestjs/swagger";
import { UserRole } from "@prisma/client";
import { AccessTokenGuard } from "../../auth/auth.guard";
import { Roles } from "../../auth/roles.decorator";
import { RolesGuard } from "../../auth/roles.guard";
import { TenantAccessGuard } from "../../auth/tenant.guard";
import { TenantContext, TenantContextValue } from "../../common/tenant-context";
import { CategoriesService } from "./categories.service";
import { CreateCategoryDto, UpdateCategoryDto } from "./dto/category.dto";
import { CategoryQueryDto } from "./dto/category-query.dto";
@ApiTags("categories") @ApiHeader({ name: "x-tenant-id", required: true }) @Controller("categories") @UseGuards(AccessTokenGuard, TenantAccessGuard, RolesGuard)
export class CategoriesController { constructor(private readonly categories: CategoriesService) {} @Get() list(@TenantContext() context: TenantContextValue, @Query() query: CategoryQueryDto) { return this.categories.list(context.tenantId, query); } @Post() @Roles(UserRole.PARTNER_ADMIN, UserRole.ACTIVITY_MANAGER) create(@TenantContext() context: TenantContextValue, @Body() dto: CreateCategoryDto) { return this.categories.create(context.tenantId, dto, context.userId); } @Get(":id") get(@TenantContext() context: TenantContextValue, @Param("id") id: string) { return this.categories.get(context.tenantId, id); } @Patch(":id") @Roles(UserRole.PARTNER_ADMIN, UserRole.ACTIVITY_MANAGER) update(@TenantContext() context: TenantContextValue, @Param("id") id: string, @Body() dto: UpdateCategoryDto) { return this.categories.update(context.tenantId, id, dto, context.userId); } @Delete(":id") @Roles(UserRole.PARTNER_ADMIN) remove(@TenantContext() context: TenantContextValue, @Param("id") id: string) { return this.categories.remove(context.tenantId, id, context.userId); } }
