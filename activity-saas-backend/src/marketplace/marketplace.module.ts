import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { EligibilityModule } from '../eligibility/eligibility.module';
import { PrismaModule } from '../prisma/prisma.module';
import { MarketplaceController } from './marketplace.controller';
import { MarketplaceRankingService } from './marketplace-ranking.service';
import { MarketplaceService } from './marketplace.service';
import { DemandModule } from '../demand/demand.module';

@Module({ imports: [PrismaModule, AuthModule, EligibilityModule, DemandModule], controllers: [MarketplaceController], providers: [MarketplaceService, MarketplaceRankingService] })
export class MarketplaceModule {}
