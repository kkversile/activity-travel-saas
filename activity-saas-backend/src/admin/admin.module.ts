import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PrismaModule } from '../prisma/prisma.module';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { EligibilityModule } from '../eligibility/eligibility.module';
import { BookingsModule } from '../bookings/bookings.module';
import { DistributionModule } from '../distribution/distribution.module';
import { ExperienceMatchingService } from '../experience-matching/experience-matching.service';

@Module({ imports: [PrismaModule, AuthModule, EligibilityModule, BookingsModule, DistributionModule], controllers: [AdminController], providers: [AdminService, ExperienceMatchingService] })
export class AdminModule {}
