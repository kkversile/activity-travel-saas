import { Injectable } from '@nestjs/common';
import { Prisma, UserRole } from '@prisma/client';
import { AuthUser } from '../common/auth.types';
import { PrismaService } from '../prisma/prisma.service';
import { RequestContextService } from '../common/request-context.service';
import { ensurePublicIdentifier, PublicEntity } from '../common/public-identifiers';

type DbClient = PrismaService | Prisma.TransactionClient;
export type AuditInput = { tenantId?: string | null; actor?: AuthUser | null; action: string; entityType: string; entityId?: string | null; reason?: string; beforeState?: unknown; afterState?: unknown; metadata?: unknown; correlationId?: string };

function json(value: unknown): Prisma.InputJsonValue | undefined {
  if (value === undefined || value === null) return undefined;
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

@Injectable()
export class AuditService {
  constructor(private readonly requestContext: RequestContextService) {}

  async write(client: DbClient, input: AuditInput) {
    const event = await client.auditLog.create({ data: {
      tenantId: input.tenantId ?? input.actor?.tenantId ?? null,
      actorId: input.actor?.sub ?? null,
      actorRole: (input.actor?.role as UserRole | undefined) ?? null,
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId ?? null,
      reason: input.reason?.trim() || null,
      beforeState: json(input.beforeState),
      afterState: json(input.afterState),
      metadata: json(input.metadata),
      correlationId: input.correlationId ?? this.requestContext.correlationId ?? null,
    } });
    if ((client as any).publicIdentifier) {
      await ensurePublicIdentifier(client as any, PublicEntity.AUDIT_EVENT, event.id, `EVT-${event.id.toUpperCase()}`);
    }
    return event;
  }
}
