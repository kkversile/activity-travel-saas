import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { CommercialModule } from '../commercial/commercial.module';
import { PrismaModule } from '../prisma/prisma.module';
import { ResourcesModule } from '../resources/resources.module';
import { CutoffService } from './cutoff.service';
import { EligibilityService } from './eligibility.service';

@Module({ imports: [PrismaModule, AuthModule, CommercialModule, ResourcesModule], providers: [CutoffService, EligibilityService], exports: [EligibilityService] })
export class EligibilityModule {}
