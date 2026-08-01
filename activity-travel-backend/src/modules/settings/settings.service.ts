import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";

const allowedSections = new Set(["currencies", "notifications", "taxes"]);

@Injectable()
export class SettingsService {
  constructor(private readonly prisma: PrismaService) {}

  get(tenantId: string) {
    return this.prisma.tenant.findUnique({ where: { id: tenantId }, select: { id: true, name: true, slug: true, currency: true, timezone: true } }).then((tenant) => {
      if (!tenant) throw new NotFoundException("Tenant not found");
      return tenant;
    });
  }

  async update(tenantId: string, data: { name?: string; currency?: string; timezone?: string }) {
    const result = await this.prisma.tenant.update({ where: { id: tenantId }, data: { ...data, currency: data.currency?.toUpperCase() } });
    await this.prisma.auditLog.create({ data: { tenantId, action: "TENANT_SETTINGS_UPDATED", entityType: "Tenant", entityId: tenantId } });
    return result;
  }

  async getSection(tenantId: string, section: string) {
    if (!allowedSections.has(section)) throw new BadRequestException("Unknown settings section");
    const tenant = await this.prisma.tenant.findUnique({ where: { id: tenantId }, select: { settings: true, currency: true } });
    if (!tenant) throw new NotFoundException("Tenant not found");
    const settings = (tenant.settings && typeof tenant.settings === "object" && !Array.isArray(tenant.settings) ? tenant.settings : {}) as Record<string, unknown>;
    const defaults: Record<string, Record<string, unknown>> = {
      currencies: { baseCurrency: tenant.currency, supportedCurrencies: [tenant.currency] },
      notifications: { emailBookings: true, emailCancellations: true, emailPayments: true },
      taxes: { calculationMode: "exclusive", displayOnInvoice: true }
    };
    return { section, value: { ...defaults[section], ...((settings[section] as Record<string, unknown> | undefined) ?? {}) } };
  }

  async updateSection(tenantId: string, section: string, value: Record<string, unknown>) {
    if (!allowedSections.has(section)) throw new BadRequestException("Unknown settings section");
    const tenant = await this.prisma.tenant.findUnique({ where: { id: tenantId }, select: { settings: true } });
    if (!tenant) throw new NotFoundException("Tenant not found");
    const current = (tenant.settings && typeof tenant.settings === "object" && !Array.isArray(tenant.settings) ? tenant.settings : {}) as Record<string, unknown>;
    const settings = { ...current, [section]: value } as Prisma.InputJsonObject;
    await this.prisma.tenant.update({ where: { id: tenantId }, data: { settings } });
    await this.prisma.auditLog.create({ data: { tenantId, action: "SETTINGS_SECTION_UPDATED", entityType: "TenantSettings", entityId: tenantId, metadata: { section } } });
    return { section, value };
  }
}
