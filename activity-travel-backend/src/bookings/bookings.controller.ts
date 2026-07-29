import { Body, Controller, Get, Param, Post, UseGuards } from "@nestjs/common";
import { ApiHeader, ApiTags } from "@nestjs/swagger";
import {
  TenantContext,
  TenantContextValue
} from "../common/tenant-context";
import { BookingsService } from "./bookings.service";
import { CreateBookingDto } from "./dto/create-booking.dto";
import { AccessTokenGuard } from "../auth/auth.guard";
import { TenantAccessGuard } from "../auth/tenant.guard";
import { RolesGuard } from "../auth/roles.guard";
import { Roles } from "../auth/roles.decorator";
import { UserRole } from "@prisma/client";
import { CreateVoucherDto } from "./dto/voucher.dto";

@ApiTags("bookings")
@ApiHeader({ name: "x-tenant-id", required: true })
@UseGuards(AccessTokenGuard, TenantAccessGuard, RolesGuard)
@Controller("bookings")
export class BookingsController {
  constructor(private readonly bookingsService: BookingsService) {}

  @Post()
  @Roles(UserRole.PARTNER_ADMIN, UserRole.ACTIVITY_MANAGER, UserRole.BOOKING_AGENT)
  create(
    @TenantContext() context: TenantContextValue,
    @Body() dto: CreateBookingDto
  ) {
    return this.bookingsService.create(context.tenantId, dto);
  }

  @Get()
  @Roles(UserRole.PARTNER_ADMIN, UserRole.ACTIVITY_MANAGER, UserRole.BOOKING_AGENT, UserRole.VIEWER)
  list(@TenantContext() context: TenantContextValue) { return this.bookingsService.list(context.tenantId); }

  @Get("vouchers")
  @Roles(UserRole.PARTNER_ADMIN, UserRole.BOOKING_AGENT, UserRole.ACTIVITY_MANAGER, UserRole.VIEWER)
  vouchers(@TenantContext() context: TenantContextValue) { return this.bookingsService.listVouchers(context.tenantId); }

  @Post("vouchers")
  @Roles(UserRole.PARTNER_ADMIN, UserRole.ACTIVITY_MANAGER)
  createVoucher(@TenantContext() context: TenantContextValue, @Body() dto: CreateVoucherDto) { return this.bookingsService.createVoucher(context.tenantId, dto); }

  @Get("customers")
  @Roles(UserRole.PARTNER_ADMIN, UserRole.ACTIVITY_MANAGER, UserRole.BOOKING_AGENT, UserRole.VIEWER)
  customers(@TenantContext() context: TenantContextValue) { return this.bookingsService.listCustomers(context.tenantId); }

  @Post(":id/confirm")
  @Roles(UserRole.PARTNER_ADMIN, UserRole.ACTIVITY_MANAGER, UserRole.BOOKING_AGENT)
  confirm(@TenantContext() context: TenantContextValue, @Param("id") id: string) { return this.bookingsService.confirm(context.tenantId, id); }

  @Post(":id/cancel")
  @Roles(UserRole.PARTNER_ADMIN, UserRole.ACTIVITY_MANAGER, UserRole.BOOKING_AGENT)
  cancel(@TenantContext() context: TenantContextValue, @Param("id") id: string) { return this.bookingsService.cancel(context.tenantId, id); }

  @Get(":id")
  @Roles(UserRole.PARTNER_ADMIN, UserRole.ACTIVITY_MANAGER, UserRole.BOOKING_AGENT, UserRole.VIEWER)
  getById(
    @TenantContext() context: TenantContextValue,
    @Param("id") id: string
  ) {
    return this.bookingsService.getById(context.tenantId, id);
  }
}
