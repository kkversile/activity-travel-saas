import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PrismaModule } from '../prisma/prisma.module';
import { AgentPortalController } from './agent-portal.controller';
import { AgentPortalService } from './agent-portal.service';

@Module({ imports: [AuthModule, PrismaModule], controllers: [AgentPortalController], providers: [AgentPortalService] })
export class AgentPortalModule {}
