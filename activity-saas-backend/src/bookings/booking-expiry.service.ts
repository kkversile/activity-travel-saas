import { Injectable } from '@nestjs/common';
import { BookingStatus, Prisma } from '@prisma/client';
import { AuthUser } from '../common/auth.types';
import { PrismaService } from '../prisma/prisma.service';
import { BookingsService } from './bookings.service';

@Injectable()
export class BookingExpiryService {
  constructor(private readonly prisma: PrismaService, private readonly bookings: BookingsService) {}

  async expireDue(now = new Date(), actor: AuthUser | null = null) {
    const due = await this.prisma.booking.findMany({ where: { recordType: 'CANONICAL', status: { in: [BookingStatus.PENDING_VENDOR_CONFIRMATION, BookingStatus.PENDING_MANUAL_REVIEW] }, confirmationDueAt: { lte: now } }, select: { id: true } });
    const expired: string[] = []; const skipped: string[] = [];
    for (const item of due) {
      try {
        await this.prisma.$transaction(async (tx: Prisma.TransactionClient) => { if ((tx as any).$executeRawUnsafe) await (tx as any).$executeRawUnsafe('SET LOCAL search_path TO public'); const rows = await tx.$queryRawUnsafe<any[]>(`SELECT * FROM "public"."Booking" WHERE "id" = $1 FOR UPDATE`, item.id); if (!rows[0]) return; const booking = await tx.booking.findUniqueOrThrow({ where: { id: item.id } }); if (![BookingStatus.PENDING_VENDOR_CONFIRMATION, BookingStatus.PENDING_MANUAL_REVIEW].includes(booking.status as any) || !booking.confirmationDueAt || booking.confirmationDueAt > now) return; await this.bookings.expireLocked(tx, booking, actor, 'confirmation SLA expired'); expired.push(item.id); }, { timeout: 30000, maxWait: 30000 });
      } catch { skipped.push(item.id); }
    }
    return { expired: expired.length, skipped: skipped.length, bookingIds: expired };
  }
}
