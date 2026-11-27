import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { AuthUser } from '../common/auth.types';
import { DEFAULT_PRODUCT_DESTINATIONS, locationToken, ProductDestination } from '../common/product-entry-contract';

const KEY = 'PRODUCT_DESTINATION_CATALOGUE';
@Injectable()
export class ProductDestinationsService {
  constructor(private readonly prisma: PrismaService, private readonly audit: AuditService) {}
  async list(client: any = this.prisma): Promise<ProductDestination[]> {
    const setting = await client.globalSetting.findFirst({ where: { tenantId: null, key: KEY }, orderBy: { createdAt: 'asc' }, select: { value: true } });
    const extra = Array.isArray(setting?.value?.destinations) ? setting.value.destinations : [];
    const seen = new Set<string>();
    return [...DEFAULT_PRODUCT_DESTINATIONS, ...extra].filter(row => {
      if (!row || !['country','state','city'].every(key => typeof row[key] === 'string' && row[key].trim())) return false;
      const key = JSON.stringify(['country','state','city'].map(field => locationToken(row[field])));
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    }).sort((a,b) => `${a.country}|${a.state}|${a.city}`.localeCompare(`${b.country}|${b.state}|${b.city}`));
  }
  async add(actor: AuthUser, input: unknown) {
    if (!input || typeof input !== 'object' || Array.isArray(input)) throw new BadRequestException('Provide country, state and city.');
    const row = Object.fromEntries(['country', 'state', 'city'].map(field => [field, (input as any)[field]])) as ProductDestination;
    for (const key of ['country', 'state', 'city'] as const) {
      if (typeof row[key] !== 'string' || !row[key].trim() || row[key].length > 100 || /[\x00-\x1f]/.test(row[key])) throw new BadRequestException(`${key} must contain 1–100 printable characters.`);
      row[key] = row[key].trim().replace(/\s+/g, ' ');
    }
    return this.prisma.$transaction(async tx => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(184723, 2)`;
      const all = await this.list(tx);
      if (all.some(existing => ['country','state','city'].every(key => locationToken(existing[key as keyof ProductDestination]) === locationToken(row[key as keyof ProductDestination])))) return { destinations: all, added: false };
      if (all.length >= 5000) throw new BadRequestException('The catalogue supports up to 5,000 destinations.');
      // Reuse canonical parent names to prevent duplicate countries/regions differing only by case.
      row.country = all.find(item => locationToken(item.country) === locationToken(row.country))?.country || row.country;
      row.state = all.find(item => item.country === row.country && locationToken(item.state) === locationToken(row.state))?.state || row.state;
      const previous = await tx.globalSetting.findFirst({ where: { tenantId: null, key: KEY }, orderBy: { createdAt: 'asc' } });
      const extras = Array.isArray((previous?.value as any)?.destinations) ? (previous!.value as any).destinations : [];
      const value = { destinations: [...extras, row] } as Prisma.InputJsonValue;
      const saved = previous ? await tx.globalSetting.update({ where: { id: previous.id }, data: { value, adminId: actor.sub } }) : await tx.globalSetting.create({ data: { key: KEY, tenantId: null, value, adminId: actor.sub } });
      await this.audit.write(tx, { actor, tenantId: null, action: 'PRODUCT_DESTINATION_ADDED', entityType: 'GlobalSetting', entityId: saved.id, afterState: row });
      return { destinations: await this.list(tx), added: true };
    });
  }
}
