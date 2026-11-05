import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PrismaModule } from '../prisma/prisma.module';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { EligibilityModule } from '../eligibility/eligibility.module';
import { BookingsModule } from '../bookings/bookings.module';
import { DistributionModule } from '../distribution/distribution.module';
import { ExperienceMatchingService } from '../experience-matching/experience-matching.service';
import { CatalogueModule } from '../catalogue/catalogue.module';
import { CommercialModule } from '../commercial/commercial.module';

@Module({ imports: [PrismaModule, AuthModule, EligibilityModule, BookingsModule, DistributionModule, CatalogueModule, CommercialModule], controllers: [AdminController], providers: [AdminService, ExperienceMatchingService] })
export class AdminModule {}
