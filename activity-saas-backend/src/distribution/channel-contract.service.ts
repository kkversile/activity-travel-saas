import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { ChannelContractStatus, DistributionCapability, Prisma } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { AuthUser } from '../common/auth.types';
import { OutboxService } from '../outbox/outbox.service';
import { PrismaService } from '../prisma/prisma.service';
import { CreateContractDto, UpdateContractDto } from './distribution.dto';

function contractValues(dto: CreateContractDto) {
  const name = dto.name.trim();
  if (!name) throw new ConflictException({ code: 'CHANNEL_CONTRACT_NAME_REQUIRED', message: 'Contract name must be non-empty' });
  const from = new Date(dto.effectiveFrom);
  const to = dto.effectiveTo ? new Date(dto.effectiveTo) : null;
  if (to && to <= from) throw new ConflictException('Contract effectiveTo must be after effectiveFrom');
  const currencies = [...new Set(dto.allowedCurrencies.map((value) => value.trim().toUpperCase()))];
  if (currencies.some((value) => !/^[A-Z]{3}$/.test(value))) throw new ConflictException({ code: 'CHANNEL_CONTRACT_CURRENCY_INVALID', message: 'Contract currencies must be non-empty ISO 4217 alpha-3 values' });
  if (dto.capabilities.includes(DistributionCapability.PRICING_READ) && currencies.length === 0) throw new ConflictException({ code: 'CHANNEL_CONTRACT_CURRENCY_REQUIRED', message: 'Pricing contracts require at least one allowed currency' });
  return { name, from, to, currencies };
}

@Injectable()
export class ChannelContractService {
  constructor(private readonly prisma: PrismaService, private readonly audit: AuditService, private readonly outbox: OutboxService) {}
  list(channelId?: string) { return this.prisma.channelContract.findMany({ where: channelId ? { channelId } : undefined, orderBy: [{ channelId: 'asc' }, { versionNumber: 'desc' }] }); }
  active(channelId: string, db: PrismaService | Prisma.TransactionClient = this.prisma) { return db.channelContract.findFirst({ where: { channelId, status: ChannelContractStatus.ACTIVE }, orderBy: { versionNumber: 'desc' } }); }
  async create(user: AuthUser, channelId: string, dto: CreateContractDto) {
    const values = contractValues(dto);
    try {
      return await this.prisma.$transaction(async (tx) => {
        const channel = await tx.distributionChannel.findUnique({ where: { id: channelId } });
        if (!channel) throw new NotFoundException('Distribution channel not found');
        await tx.$queryRaw`SELECT "id" FROM "public"."DistributionChannel" WHERE "id" = ${channelId} FOR UPDATE`;
        const latest = await tx.channelContract.findFirst({ where: { channelId }, orderBy: { versionNumber: 'desc' }, select: { versionNumber: true } });
        const contract = await tx.channelContract.create({ data: { channelId, versionNumber: (latest?.versionNumber ?? 0) + 1, name: values.name, effectiveFrom: values.from, effectiveTo: values.to, capabilities: dto.capabilities, allowedCurrencies: values.currencies, availabilityHorizonDays: dto.availabilityHorizonDays, createdById: user.sub, metadata: (dto.metadata ?? {}) as Prisma.InputJsonValue } });
        await this.audit.write(tx, { actor: user, action: 'CHANNEL_CONTRACT_CREATED', entityType: 'ChannelContract', entityId: contract.id, afterState: { channelId, versionNumber: contract.versionNumber, status: contract.status } });
        await this.outbox.enqueue(tx, { eventType: 'CHANNEL_CONTRACT_CREATED', aggregateType: 'ChannelContract', aggregateId: contract.id, payload: { channelId, versionNumber: contract.versionNumber } });
        return contract;
      });
    } catch (error: any) { if (error?.code === 'P2002') throw new ConflictException({ code: 'CHANNEL_CONTRACT_VERSION_CONFLICT', message: 'Contract version allocation raced; retry' }); throw error; }
  }
  async update(user: AuthUser, id: string, dto: UpdateContractDto) {
    const values = contractValues(dto);
    return this.prisma.$transaction(async (tx) => {
      const current = await tx.channelContract.findUnique({ where: { id } });
      if (!current) throw new NotFoundException('Channel contract not found');
      if (current.status !== ChannelContractStatus.DRAFT) throw new ConflictException('Active or retired contracts are immutable');
      const result = await tx.channelContract.updateMany({ where: { id, status: ChannelContractStatus.DRAFT, lockVersion: dto.expectedLockVersion }, data: { name: values.name, effectiveFrom: values.from, effectiveTo: values.to, capabilities: dto.capabilities, allowedCurrencies: values.currencies, availabilityHorizonDays: dto.availabilityHorizonDays, metadata: (dto.metadata ?? {}) as Prisma.InputJsonValue, lockVersion: { increment: 1 } } });
      if (result.count !== 1) throw new ConflictException({ code: 'CHANNEL_CONTRACT_VERSION_MISMATCH', message: 'Channel contract changed; reload and retry' });
      const updated = await tx.channelContract.findUniqueOrThrow({ where: { id } });
      await this.audit.write(tx, { actor: user, action: 'CHANNEL_CONTRACT_UPDATED', entityType: 'ChannelContract', entityId: id, afterState: { lockVersion: updated.lockVersion } });
      await this.outbox.enqueue(tx, { eventType: 'CHANNEL_CONTRACT_UPDATED', aggregateType: 'ChannelContract', aggregateId: id, payload: { channelId: updated.channelId, versionNumber: updated.versionNumber, lockVersion: updated.lockVersion } });
      return updated;
    });
  }
  async activate(user: AuthUser, id: string) {
    try {
      return await this.prisma.$transaction(async (tx) => {
        const candidate = await tx.channelContract.findUnique({ where: { id } }); if (!candidate) throw new NotFoundException('Channel contract not found');
        if (candidate.status !== ChannelContractStatus.DRAFT) throw new ConflictException('Only draft contracts can be activated');
        await tx.$queryRaw`SELECT "id" FROM "public"."DistributionChannel" WHERE "id" = ${candidate.channelId} FOR UPDATE`;
        const channel = await tx.distributionChannel.findUniqueOrThrow({ where: { id: candidate.channelId } }); if (!channel.active) throw new ConflictException({ code: 'CHANNEL_INACTIVE', message: 'Inactive channels cannot activate contracts' });
        const active = await tx.channelContract.findFirst({ where: { channelId: candidate.channelId, status: ChannelContractStatus.ACTIVE }, select: { id: true } }); if (active) throw new ConflictException({ code: 'CHANNEL_ACTIVE_CONTRACT_EXISTS', message: 'Retire the active contract before activating another' });
        const changed = await tx.channelContract.updateMany({ where: { id, status: ChannelContractStatus.DRAFT }, data: { status: ChannelContractStatus.ACTIVE, activatedById: user.sub, activatedAt: new Date(), lockVersion: { increment: 1 } } }); if (changed.count !== 1) throw new ConflictException('Contract was activated concurrently; reload and retry');
        const activated = await tx.channelContract.findUniqueOrThrow({ where: { id } });
        await this.audit.write(tx, { actor: user, action: 'CHANNEL_CONTRACT_ACTIVATED', entityType: 'ChannelContract', entityId: id, afterState: { channelId: candidate.channelId, versionNumber: activated.versionNumber } });
        await this.outbox.enqueue(tx, { eventType: 'CHANNEL_CONTRACT_ACTIVATED', aggregateType: 'ChannelContract', aggregateId: id, payload: { channelId: candidate.channelId, versionNumber: activated.versionNumber } });
        return activated;
      });
    } catch (error: any) { if (error?.code === 'P2002') throw new ConflictException({ code: 'CHANNEL_ACTIVE_CONTRACT_EXISTS', message: 'Retire the active contract before activating another' }); throw error; }
  }
  async retire(user: AuthUser, id: string) {
    return this.prisma.$transaction(async (tx) => {
      const candidate = await tx.channelContract.findUnique({ where: { id } }); if (!candidate) throw new NotFoundException('Channel contract not found'); if (candidate.status !== ChannelContractStatus.ACTIVE) throw new ConflictException('Only active contracts can be retired');
      await tx.$queryRaw`SELECT "id" FROM "public"."DistributionChannel" WHERE "id" = ${candidate.channelId} FOR UPDATE`;
      const changed = await tx.channelContract.updateMany({ where: { id, status: ChannelContractStatus.ACTIVE }, data: { status: ChannelContractStatus.RETIRED, retiredById: user.sub, retiredAt: new Date(), lockVersion: { increment: 1 } } }); if (changed.count !== 1) throw new ConflictException('Contract changed; reload and retry');
      const retired = await tx.channelContract.findUniqueOrThrow({ where: { id } });
      await this.audit.write(tx, { actor: user, action: 'CHANNEL_CONTRACT_RETIRED', entityType: 'ChannelContract', entityId: id, afterState: { status: retired.status } });
      await this.outbox.enqueue(tx, { eventType: 'CHANNEL_CONTRACT_RETIRED', aggregateType: 'ChannelContract', aggregateId: id, payload: { channelId: candidate.channelId, versionNumber: candidate.versionNumber } });
      return retired;
    });
  }
}
