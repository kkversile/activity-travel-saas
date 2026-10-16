import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { OnboardingService } from './onboarding.service';
import { OnboardingEmailService } from './onboarding-email.service';
import { AdminOnboardingController, VendorOnboardingController } from './onboarding.controller';

@Module({ imports: [AuthModule], controllers: [VendorOnboardingController, AdminOnboardingController], providers: [OnboardingService, OnboardingEmailService], exports: [OnboardingService] })
export class OnboardingModule {}
