import { Global, Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { OutboxService } from './outbox.service';

@Global()
@Module({ imports: [PrismaModule], providers: [OutboxService], exports: [OutboxService] })
export class OutboxModule {}
