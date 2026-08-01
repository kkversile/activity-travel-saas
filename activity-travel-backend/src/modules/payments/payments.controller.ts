import { Body, Controller, Get, Param, Post, Query, UseGuards } from "@nestjs/common";
import { ApiHeader, ApiTags } from "@nestjs/swagger";
import { UserRole } from "@prisma/client";
import { AccessTokenGuard } from "../../auth/auth.guard";
import { Roles } from "../../auth/roles.decorator";
import { RolesGuard } from "../../auth/roles.guard";
import { TenantAccessGuard } from "../../auth/tenant.guard";
import { TenantContext, TenantContextValue } from "../../common/tenant-context";
import { CreatePaymentDto, PaymentQueryDto, PaymentWebhookDto } from "./dto/payment.dto";
import { PaymentsService } from "./payments.service";

@ApiTags("payments")
@ApiHeader({ name: "x-tenant-id", required: true })
@Controller("payments")
@UseGuards(AccessTokenGuard, TenantAccessGuard, RolesGuard)
export class PaymentsController {
  constructor(private readonly payments: PaymentsService) {}
  @Get() list(@TenantContext() c: TenantContextValue, @Query() q: PaymentQueryDto) { return this.payments.list(c.tenantId, q); }
  @Post() @Roles(UserRole.PARTNER_ADMIN, UserRole.BOOKING_AGENT) create(@TenantContext() c: TenantContextValue, @Body() d: CreatePaymentDto) { return this.payments.create(c.tenantId, d); }
  @Post("webhooks/mock") @Roles(UserRole.PARTNER_ADMIN) webhook(@TenantContext() c: TenantContextValue, @Body() d: PaymentWebhookDto) { return this.payments.handleWebhook(c.tenantId, d); }
  @Get(":id") get(@TenantContext() c: TenantContextValue, @Param("id") id: string) { return this.payments.get(c.tenantId, id); }
  @Post(":id/capture") @Roles(UserRole.PARTNER_ADMIN) capture(@TenantContext() c: TenantContextValue, @Param("id") id: string) { return this.payments.capture(c.tenantId, id); }
  @Post(":id/fail") @Roles(UserRole.PARTNER_ADMIN) fail(@TenantContext() c: TenantContextValue, @Param("id") id: string) { return this.payments.fail(c.tenantId, id); }
}
