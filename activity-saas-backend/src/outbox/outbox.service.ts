import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

type DbClient = PrismaService | Prisma.TransactionClient;
export const OUTBOX_DELIVERY_LEASE_MS = 120_000;
@Injectable()
export class OutboxService {
  constructor(private readonly prisma: PrismaService) {}
  enqueue(client: DbClient, input: { tenantId?: string | null; eventType: string; aggregateType: string; aggregateId?: string | null; payload: Record<string, unknown> }) {
    return client.outboxEvent.create({ data: { tenantId: input.tenantId ?? null, eventType: input.eventType, aggregateType: input.aggregateType, aggregateId: input.aggregateId ?? null, payload: input.payload as Prisma.InputJsonValue } });
  }
  requeueExpiredProcessing(eventTypes: string[]) {
    if (!eventTypes.length) throw new Error('Explicit leased event types are required');
    const expired = { status: 'PROCESSING' as const, eventType: { in: eventTypes }, availableAt: { lte: new Date() } };
    return this.prisma.outboxEvent.updateMany({ where: { ...expired, attemptCount: { gte: 5 } }, data: { status: 'FAILED', lastError: 'Delivery lease expired after five attempts' } })
      .then(() => this.prisma.outboxEvent.updateMany({ where: { ...expired, attemptCount: { lt: 5 } }, data: { status: 'PENDING' } }));
  }
  async claimPending(limit = 50, eventTypes?: string[], leasedEventTypes: string[] = []) {
    return this.prisma.$transaction(async (tx) => {
      const candidates = await tx.outboxEvent.findMany({ where: { status: 'PENDING', availableAt: { lte: new Date() }, ...(eventTypes?.length ? { eventType: { in: eventTypes } } : {}) }, orderBy: { createdAt: 'asc' }, take: limit });
      const claimed = [];
      let leasedClaimed = false;
      for (const event of candidates) {
        const leased = leasedEventTypes.includes(event.eventType);
        // Deliver one leased event first, rather than letting a whole batch's
        // leases expire while waiting behind slow SMTP deliveries.
        if (leased && leasedClaimed) continue;
        const lease = leased ? { availableAt: new Date(Date.now() + OUTBOX_DELIVERY_LEASE_MS) } : {};
        const result = await tx.outboxEvent.updateMany({ where: { id: event.id, status: 'PENDING' }, data: { status: 'PROCESSING', attemptCount: { increment: 1 }, ...lease } });
        if (result.count === 1) {
          const record = { ...event, ...lease, status: 'PROCESSING' as const, attemptCount: event.attemptCount + 1 };
          if (leased) { claimed.unshift(record); leasedClaimed = true; }
          else claimed.push(record);
        }
      }
      return claimed;
    });
  }
  markProcessed(id: string) { return this.prisma.outboxEvent.update({ where: { id }, data: { status: 'PROCESSED', processedAt: new Date() } }); }
  markFailed(id: string, error: string) { return this.prisma.outboxEvent.update({ where: { id }, data: { status: 'FAILED', lastError: error.slice(0, 2000) } }); }
  retryOrFail(event: { id: string; attemptCount: number }, error: string) {
    if (event.attemptCount >= 5) return this.markFailed(event.id, error);
    const delayMs = Math.min(60 * 60_000, 30_000 * (2 ** Math.max(0, event.attemptCount - 1)));
    return this.prisma.outboxEvent.update({ where: { id: event.id }, data: { status: 'PENDING', availableAt: new Date(Date.now() + delayMs), lastError: error.slice(0, 2000) } });
  }
}
