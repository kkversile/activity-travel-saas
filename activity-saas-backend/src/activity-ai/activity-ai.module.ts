import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AuthModule } from '../auth/auth.module';
import { CatalogueModule } from '../catalogue/catalogue.module';
import { PrismaModule } from '../prisma/prisma.module';
import { ActivityAiController } from './activity-ai.controller';
import { ActivityAiService } from './activity-ai.service';
import { ActivityAiResearchService } from './activity-ai-research.service';
import { GeminiProvider } from './providers/gemini.provider';
import { GroqProvider } from './providers/groq.provider';
import { MockAiProvider } from './providers/mock.provider';
@Module({ imports: [AuthModule, CatalogueModule, PrismaModule], controllers: [ActivityAiController], providers: [ActivityAiService, ActivityAiResearchService, GroqProvider, GeminiProvider, MockAiProvider, { provide: 'AI_PROVIDER', inject: [ConfigService, GroqProvider, GeminiProvider, MockAiProvider], useFactory: (config: ConfigService, groq: GroqProvider, gemini: GeminiProvider, mock: MockAiProvider) => { const provider = config.get<string>('AI_PROVIDER', 'mock').toLowerCase(); return provider === 'groq' ? groq : provider === 'gemini' ? gemini : mock; } }] })
export class ActivityAiModule {}
