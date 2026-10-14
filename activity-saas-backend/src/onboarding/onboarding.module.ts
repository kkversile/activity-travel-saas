import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { OnboardingService } from './onboarding.service';
import { AdminOnboardingController, VendorOnboardingController } from './onboarding.controller';

@Module({ imports: [AuthModule], controllers: [VendorOnboardingController, AdminOnboardingController], providers: [OnboardingService], exports: [OnboardingService] })
export class OnboardingModule {}
