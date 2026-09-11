import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

type DbClient = PrismaService | Prisma.TransactionClient;
@Injectable()
export class OutboxService {
  constructor(private readonly prisma: PrismaService) {}
  enqueue(client: DbClient, input: { tenantId?: string | null; eventType: string; aggregateType: string; aggregateId?: string | null; payload: Record<string, unknown> }) {
    return client.outboxEvent.create({ data: { tenantId: input.tenantId ?? null, eventType: input.eventType, aggregateType: input.aggregateType, aggregateId: input.aggregateId ?? null, payload: input.payload as Prisma.InputJsonValue } });
  }
  async claimPending(limit = 50) {
    return this.prisma.$transaction(async (tx) => {
      const candidates = await tx.outboxEvent.findMany({ where: { status: 'PENDING', availableAt: { lte: new Date() } }, orderBy: { createdAt: 'asc' }, take: limit });
      const claimed = [];
      for (const event of candidates) {
        const result = await tx.outboxEvent.updateMany({ where: { id: event.id, status: 'PENDING' }, data: { status: 'PROCESSING', attemptCount: { increment: 1 } } });
        if (result.count === 1) claimed.push({ ...event, status: 'PROCESSING' as const, attemptCount: event.attemptCount + 1 });
      }
      return claimed;
    });
  }
  markProcessed(id: string) { return this.prisma.outboxEvent.update({ where: { id }, data: { status: 'PROCESSED', processedAt: new Date() } }); }
  markFailed(id: string, error: string) { return this.prisma.outboxEvent.update({ where: { id }, data: { status: 'FAILED', lastError: error.slice(0, 2000) } }); }
}
