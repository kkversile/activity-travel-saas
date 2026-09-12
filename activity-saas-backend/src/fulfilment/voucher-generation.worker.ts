import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { VoucherGenerationService } from './voucher-generation.service';

@Injectable()
export class VoucherGenerationWorker {
  private readonly logger = new Logger(VoucherGenerationWorker.name);
  constructor(private readonly generation: VoucherGenerationService) {}

  @Cron(CronExpression.EVERY_30_SECONDS)
  async process() { if (process.env.DISABLE_SCHEDULED_WORKERS === 'true') return; const result = await this.generation.processNext(); if (result.processed) this.logger.log(`Voucher generation worker: ${result.status ?? 'completed'}`); }
}
