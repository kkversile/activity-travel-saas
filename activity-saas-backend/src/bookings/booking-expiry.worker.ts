import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { BookingExpiryService } from './booking-expiry.service';

@Injectable()
export class BookingExpiryWorker {
  private readonly logger = new Logger(BookingExpiryWorker.name);

  constructor(private readonly expiry: BookingExpiryService) {}

  @Cron(CronExpression.EVERY_MINUTE)
  async expireDueBookings() {
    // Tests and one-off scripts remain deterministic; production uses the database as authority.
    if (process.env.NODE_ENV === 'test' || process.env.BOOKING_EXPIRY_WORKER_ENABLED === 'false' || process.env.DISABLE_SCHEDULED_WORKERS === 'true') return;
    const result = await this.expiry.expireDue(new Date());
    if (result.expired || result.skipped) this.logger.log(`Booking expiry sweep: ${result.expired} expired, ${result.skipped} skipped`);
  }
}
