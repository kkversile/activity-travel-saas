import { BadRequestException, Controller, Get, Header, Param, Query, StreamableFile, UseGuards } from "@nestjs/common";
import { ApiHeader, ApiTags } from "@nestjs/swagger";
import { AccessTokenGuard } from "../../auth/auth.guard";
import { TenantAccessGuard } from "../../auth/tenant.guard";
import { RolesGuard } from "../../auth/roles.guard";
import { TenantContext, TenantContextValue } from "../../common/tenant-context";
import { ReportsService } from "./reports.service";
import { ReportQueryDto } from "./dto/report-query.dto";

@ApiTags("reports")
@ApiHeader({ name: "x-tenant-id", required: true })
@Controller("reports")
@UseGuards(AccessTokenGuard, TenantAccessGuard, RolesGuard)
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}
  @Get("bookings") bookings(@TenantContext() c: TenantContextValue, @Query() q: ReportQueryDto) { return this.reports.bookings(c.tenantId, q); }
  @Get("revenue") revenue(@TenantContext() c: TenantContextValue, @Query() q: ReportQueryDto) { return this.reports.revenue(c.tenantId, q); }
  @Get("capacity") capacity(@TenantContext() c: TenantContextValue, @Query() q: ReportQueryDto) { return this.reports.capacity(c.tenantId, q); }
  @Get("cancellations") cancellations(@TenantContext() c: TenantContextValue, @Query() q: ReportQueryDto) { return this.reports.cancellations(c.tenantId, q); }
  @Get("payments") payments(@TenantContext() c: TenantContextValue, @Query() q: ReportQueryDto) { return this.reports.payments(c.tenantId, q); }
  @Get("refunds") refunds(@TenantContext() c: TenantContextValue, @Query() q: ReportQueryDto) { return this.reports.refunds(c.tenantId, q); }
  @Get("agents") agents(@TenantContext() c: TenantContextValue, @Query() q: ReportQueryDto) { return this.reports.partners(c.tenantId, q, "agent"); }
  @Get("suppliers") suppliers(@TenantContext() c: TenantContextValue, @Query() q: ReportQueryDto) { return this.reports.partners(c.tenantId, q, "supplier"); }
  @Get("activities") activities(@TenantContext() c: TenantContextValue, @Query() q: ReportQueryDto) { return this.reports.activities(c.tenantId, q); }
  @Get(":kind/export") @Header("Content-Type", "text/csv; charset=utf-8") async export(@TenantContext() c: TenantContextValue, @Param("kind") kind: string, @Query() q: ReportQueryDto) { if (!["bookings", "capacity", "cancellations", "payments", "refunds", "agents", "suppliers", "activities", "revenue"].includes(kind)) throw new BadRequestException("Unsupported report export"); return new StreamableFile(Buffer.from(await this.reports.exportCsv(c.tenantId, kind as "bookings" | "capacity" | "cancellations" | "payments" | "refunds" | "agents" | "suppliers" | "activities" | "revenue", q), "utf8")); }
}
