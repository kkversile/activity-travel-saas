import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { ActivitiesModule } from './activities/activities.module';
import { AuthModule } from './auth/auth.module';
import { AvailabilityModule } from './availability/availability.module';
import { BookingsModule } from './bookings/bookings.module';
import { DashboardModule } from './dashboard/dashboard.module';
import { PayoutsModule } from './payouts/payouts.module';
import { PrismaModule } from './prisma/prisma.module';
import { RatePlansModule } from './rate-plans/rate-plans.module';
import { VendorModule } from './vendor/vendor.module';
import { AdminModule } from './admin/admin.module';

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
    PrismaModule,
    AuthModule,
    DashboardModule,
    VendorModule,
    ActivitiesModule,
    RatePlansModule,
    AvailabilityModule,
    BookingsModule,
    PayoutsModule,
    AdminModule,
  ],
  controllers: [AppController],
})
export class AppModule {}
