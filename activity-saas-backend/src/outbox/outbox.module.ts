import { Global, Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { OutboxService } from './outbox.service';
import { VendorNotificationWorker } from './vendor-notification.worker';

@Global()
@Module({ imports: [PrismaModule], providers: [OutboxService, VendorNotificationWorker], exports: [OutboxService] })
export class OutboxModule {}
