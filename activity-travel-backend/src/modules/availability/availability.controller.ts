import { Controller, Get, Query, UseGuards } from "@nestjs/common";
import { ApiHeader, ApiTags } from "@nestjs/swagger";
import { AccessTokenGuard } from "../../auth/auth.guard";
import { TenantAccessGuard } from "../../auth/tenant.guard";
import { RolesGuard } from "../../auth/roles.guard";
import { TenantContext, TenantContextValue } from "../../common/tenant-context";
import { SchedulesService } from "../schedules/schedules.service";
import { ScheduleQueryDto } from "../schedules/dto/schedule.dto";

@ApiTags("availability")
@ApiHeader({ name: "x-tenant-id", required: true })
@Controller("availability")
@UseGuards(AccessTokenGuard, TenantAccessGuard, RolesGuard)
export class AvailabilityController {
  constructor(private readonly schedules: SchedulesService) {}

  @Get()
  list(@TenantContext() context: TenantContextValue, @Query() query: ScheduleQueryDto) {
    return this.schedules.list(context.tenantId, query);
  }
}
