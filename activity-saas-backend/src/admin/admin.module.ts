import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PrismaModule } from '../prisma/prisma.module';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { EligibilityModule } from '../eligibility/eligibility.module';

@Module({ imports: [PrismaModule, AuthModule, EligibilityModule], controllers: [AdminController], providers: [AdminService] })
export class AdminModule {}
