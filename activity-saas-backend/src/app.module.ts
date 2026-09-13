import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { CatalogueModule } from './catalogue/catalogue.module';
import { AuthModule } from './auth/auth.module';
import { BookingsModule } from './bookings/bookings.module';
import { DashboardModule } from './dashboard/dashboard.module';
import { PayoutsModule } from './payouts/payouts.module';
import { PrismaModule } from './prisma/prisma.module';
import { RatePlansModule } from './rate-plans/rate-plans.module';
import { VendorModule } from './vendor/vendor.module';
import { AdminModule } from './admin/admin.module';
import { AuditModule } from './audit/audit.module';
import { FilesModule } from './files/files.module';
import { OutboxModule } from './outbox/outbox.module';
import { StorageModule } from './storage/storage.module';
import { RequestContextModule } from './common/request-context.module';
import { CorrelationIdMiddleware } from './common/correlation-id.middleware';
import { CommercialModule } from './commercial/commercial.module';
import { SchedulesModule } from './schedules/schedules.module';
import { InventoryModule } from './inventory/inventory.module';
import { ResourcesModule } from './resources/resources.module';
import { EligibilityModule } from './eligibility/eligibility.module';
import { MarketplaceModule } from './marketplace/marketplace.module';
import { FulfilmentModule } from './fulfilment/fulfilment.module';
import { ScheduleModule } from '@nestjs/schedule';
import { FinanceModule } from './finance/finance.module';
import { QualityModule } from './quality/quality.module';

function validateEnvironment(config: Record<string, unknown>) {
  const databaseUrl = String(config.DATABASE_URL ?? '');
  const jwtSecret = String(config.JWT_SECRET ?? '');
  if (!databaseUrl.startsWith('postgresql://') && !databaseUrl.startsWith('postgres://')) {
    throw new Error('DATABASE_URL must be a PostgreSQL connection string');
  }
  if (jwtSecret.length < 32 || /change|replace|demo/i.test(jwtSecret)) {
    throw new Error('JWT_SECRET must be a non-demo secret of at least 32 characters');
  }
  return config;
}

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validate: validateEnvironment }),
    ScheduleModule.forRoot(),
    PrismaModule,
    AuthModule,
    DashboardModule,
    VendorModule,
    CatalogueModule,
    RatePlansModule,
    SchedulesModule,
    InventoryModule,
    ResourcesModule,
    EligibilityModule,
    MarketplaceModule,
    BookingsModule,
    PayoutsModule,
    AdminModule,
    AuditModule,
    OutboxModule,
    StorageModule,
    FilesModule,
    RequestContextModule,
    CommercialModule,
    FulfilmentModule,
    FinanceModule,
    QualityModule,
  ],
  controllers: [AppController],
  providers: [CorrelationIdMiddleware],
})
export class AppModule {}
