import { Controller, Get, UseGuards } from "@nestjs/common";
import { ApiHeader, ApiTags } from "@nestjs/swagger";
import { AccessTokenGuard } from "../../auth/auth.guard";
import { RolesGuard } from "../../auth/roles.guard";
import { TenantAccessGuard } from "../../auth/tenant.guard";
import { TenantContext, TenantContextValue } from "../../common/tenant-context";
import { DashboardService } from "./dashboard.service";

@ApiTags("dashboard")
@ApiHeader({ name: "x-tenant-id", required: true })
@Controller("dashboard")
@UseGuards(AccessTokenGuard, TenantAccessGuard, RolesGuard)
export class DashboardController {
  constructor(private readonly dashboard: DashboardService) {}

  @Get("summary")
  summary(@TenantContext() context: TenantContextValue) {
    return this.dashboard.summary(context.tenantId);
  }
}
