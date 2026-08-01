import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { ActivitiesModule } from "./activities/activities.module";
import { AppController } from "./app.controller";
import { BookingsModule } from "./bookings/bookings.module";
import { PrismaModule } from "./prisma/prisma.module";
import { AuthModule } from "./auth/auth.module";
import { UsersModule } from "./users/users.module";
import { CategoriesModule } from "./modules/categories/categories.module";
import { DestinationsModule } from "./modules/destinations/destinations.module";
import { SchedulesModule } from "./modules/schedules/schedules.module";
import { PricePlansModule } from "./modules/price-plans/price-plans.module";
import { CustomersModule } from "./modules/customers/customers.module";
import { CancellationPoliciesModule } from "./modules/cancellation-policies/cancellation-policies.module";
import { PickupPointsModule } from "./modules/pickup-points/pickup-points.module";
import { PaymentsModule } from "./modules/payments/payments.module";
import { RefundsModule } from "./modules/refunds/refunds.module";
import { InvoicesModule } from "./modules/invoices/invoices.module";
import { VariantsModule } from "./modules/variants/variants.module";
import { SuppliersModule } from "./modules/suppliers/suppliers.module";
import { AgentsModule } from "./modules/agents/agents.module";
import { AvailabilityModule } from "./modules/availability/availability.module";
import { ReportsModule } from "./modules/reports/reports.module";
import { VouchersModule } from "./modules/vouchers/vouchers.module";
import { AuditLogsModule } from "./modules/audit-logs/audit-logs.module";
import { RolesModule } from "./modules/roles/roles.module";
import { SettingsModule } from "./modules/settings/settings.module";
import { PassengersModule } from "./modules/passengers/passengers.module";
import { TaxesModule } from "./modules/taxes/taxes.module";
import { DiscountsModule } from "./modules/discounts/discounts.module";
import { AgentCommissionsModule } from "./modules/agent-commissions/agent-commissions.module";
import { BlackoutDatesModule } from "./modules/blackout-dates/blackout-dates.module";
import { DashboardModule } from "./modules/dashboard/dashboard.module";

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate: (config) => {
        if (!config.DATABASE_URL) throw new Error("DATABASE_URL is required");
        if (!config.JWT_SECRET || String(config.JWT_SECRET).length < 32) throw new Error("JWT_SECRET must be at least 32 characters");
        const port = Number(config.API_PORT ?? 4006);
        if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("API_PORT must be a valid TCP port");
        return { ...config, API_PORT: port };
      }
    }),
    PrismaModule,
    AuthModule,
    UsersModule,
    ActivitiesModule,
    BookingsModule,
    CategoriesModule,
    DestinationsModule,
    SchedulesModule,
    PricePlansModule,
    CustomersModule,
    CancellationPoliciesModule,
    PickupPointsModule,
    PaymentsModule,
    RefundsModule,
    InvoicesModule,
    VariantsModule,
    SuppliersModule,
    AgentsModule,
    AvailabilityModule,
    ReportsModule,
    VouchersModule,
    AuditLogsModule,
    RolesModule,
    SettingsModule,
    PassengersModule,
    TaxesModule,
    DiscountsModule,
    AgentCommissionsModule,
    BlackoutDatesModule,
    DashboardModule
  ],
  controllers: [AppController]
})
export class AppModule {}
