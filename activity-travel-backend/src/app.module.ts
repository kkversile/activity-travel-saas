import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { ActivitiesModule } from "./activities/activities.module";
import { AppController } from "./app.controller";
import { BookingsModule } from "./bookings/bookings.module";
import { PrismaModule } from "./prisma/prisma.module";
import { AuthModule } from "./auth/auth.module";
import { UsersModule } from "./users/users.module";

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
    BookingsModule
  ],
  controllers: [AppController]
})
export class AppModule {}
