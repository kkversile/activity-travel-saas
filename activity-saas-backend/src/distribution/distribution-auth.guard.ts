import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ChannelContractStatus, ChannelCredentialStatus, DistributionCapability } from '@prisma/client';
import { createHash, timingSafeEqual } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { DistributionAuthContext } from './distribution.types';

export const DISTRIBUTION_CONTEXT = 'distributionContext';
export const DISTRIBUTION_CAPABILITIES = 'distributionCapabilities';

@Injectable()
export class DistributionAuthGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest<any>();
    const authorization = String(request.headers.authorization || '');
    const supplied = request.headers['x-api-key'] || (authorization.startsWith('ApiKey ') ? authorization.slice(7) : undefined);
    if (!supplied) throw new UnauthorizedException('Missing distribution API key');
    const prefix = String(supplied).split('.')[0];
    const credential = await this.prisma.channelApiCredential.findUnique({
      where: { keyPrefix: prefix },
      include: { channel: { include: { contracts: { where: { status: ChannelContractStatus.ACTIVE }, orderBy: { versionNumber: 'desc' }, take: 1 } } } },
    });
    if (!credential) throw new UnauthorizedException('Invalid distribution API key');
    const expected = Buffer.from(credential.keyHash, 'hex');
    const actual = createHash('sha256').update(String(supplied)).digest();
    if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) throw new UnauthorizedException('Invalid distribution API key');
    const now = new Date();
    if (credential.status !== ChannelCredentialStatus.ACTIVE || (credential.expiresAt && credential.expiresAt <= now)) throw new UnauthorizedException('Distribution API key is inactive or expired');
    const contract = credential.channel.contracts[0];
    if (!credential.channel.active || !contract || contract.effectiveFrom > now || (contract.effectiveTo && contract.effectiveTo <= now)) throw new UnauthorizedException('Distribution channel contract is inactive');
    const contractCapabilities = new Set(contract.capabilities);
    const capabilities = credential.scopes.filter((scope) => contractCapabilities.has(scope));
    await this.prisma.channelApiCredential.update({ where: { id: credential.id }, data: { lastUsedAt: now } });
    const auth: DistributionAuthContext = { credentialId: credential.id, channelId: credential.channelId, channelCode: credential.channel.code, channelName: credential.channel.name, channelType: credential.channel.type, contractId: contract.id, contractVersion: contract.versionNumber, contractStatus: contract.status, capabilities, allowedCurrencies: contract.allowedCurrencies, availabilityHorizonDays: contract.availabilityHorizonDays };
    request[DISTRIBUTION_CONTEXT] = auth;
    return true;
  }
}

@Injectable()
export class DistributionCapabilityGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}
  canActivate(context: ExecutionContext) {
    const required = this.reflector.getAllAndOverride<DistributionCapability[]>(DISTRIBUTION_CAPABILITIES, [context.getHandler(), context.getClass()]) || [];
    const auth = context.switchToHttp().getRequest<any>()[DISTRIBUTION_CONTEXT] as DistributionAuthContext;
    if (required.every((capability) => auth?.capabilities.includes(capability))) return true;
    throw new UnauthorizedException('Distribution credential lacks the required capability; effective contract capability is required');
  }
}
