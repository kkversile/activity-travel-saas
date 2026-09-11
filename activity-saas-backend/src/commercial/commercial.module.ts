import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { AuditModule } from '../audit/audit.module';
import { OutboxModule } from '../outbox/outbox.module';
import { PrismaModule } from '../prisma/prisma.module';
import { CommercialCalculatorService } from './commercial-calculator.service';
import { CommercialController } from './commercial.controller';
import { CommercialService } from './commercial.service';

@Module({ imports: [PrismaModule, AuthModule, AuditModule, OutboxModule], controllers: [CommercialController], providers: [CommercialService, CommercialCalculatorService], exports: [CommercialService, CommercialCalculatorService] })
export class CommercialModule {}
