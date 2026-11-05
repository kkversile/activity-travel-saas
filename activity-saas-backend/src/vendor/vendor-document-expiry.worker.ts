import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { ProductStatus, VendorVerificationStatus } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma/prisma.service';
import { OutboxService } from '../outbox/outbox.service';
import { requiredVendorDocumentsForProduct } from './vendor-document-requirements';

const AUTO_PAUSED = 'PRODUCT_AUTO_PAUSED_DOCUMENT_EXPIRY';
const AUTO_RESUMED = 'PRODUCT_AUTO_RESUMED_DOCUMENT_RENEWAL';
const EXPIRY_REMINDERS = [30, 15, 3] as const;

@Injectable()
export class VendorDocumentExpiryWorker {
  private readonly logger = new Logger(VendorDocumentExpiryWorker.name);

  constructor(private readonly prisma: PrismaService, private readonly audit: AuditService, private readonly outbox: OutboxService) {}

  @Cron(CronExpression.EVERY_DAY_AT_1AM)
  async runDaily() {
    const now = new Date();
    const expiryDatesSynced = await this.syncSavedExpiryDates();
    const productStatus = await this.syncRequiredDocumentProductStatus(now);
    const reminders = await this.sendExpiryReminders(now);
    return { ...productStatus, reminders, expiryDatesSynced };
  }

  async syncSavedExpiryDates() {
    const applications = await this.prisma.vendorOnboardingApplication.findMany({
      select: { tenantId: true, supplementalData: true },
    });
    let synced = 0;
    for (const application of applications) {
      const supplemental = application.supplementalData && typeof application.supplementalData === 'object' && !Array.isArray(application.supplementalData)
        ? application.supplementalData as Record<string, unknown>
        : {};
      const licences = Array.isArray(supplemental.licences) ? supplemental.licences as Array<Record<string, unknown>> : [];
      for (const licence of licences) {
        const type = typeof licence.documentType === 'string' ? licence.documentType : '';
        const validTill = typeof licence.validTill === 'string' ? licence.validTill.trim() : '';
        if (!type || !validTill) continue;
        const expiresAt = parseDateOnlyExpiry(validTill);
        if (!expiresAt) continue;
        const document = await this.prisma.vendorDocument.findUnique({ where: { tenantId_type: { tenantId: application.tenantId, type: type as any } }, select: { versions: { orderBy: { versionNumber: 'desc' }, take: 1, select: { id: true, expiresAt: true } } } });
        const latest = document?.versions[0];
        if (!latest || latest.expiresAt) continue;
        const updated = await this.prisma.vendorDocumentVersion.updateMany({ where: { id: latest.id, expiresAt: null }, data: { expiresAt } });
        synced += updated.count;
      }
    }
    if (synced) this.logger.log(`Document expiry sync: restored ${synced} saved expiry date(s) to current document versions.`);
    return synced;
  }

  async sendExpiryReminders(now: Date) {
    const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    let queued = 0;
    for (const days of EXPIRY_REMINDERS) {
      const startsAt = new Date(today); startsAt.setUTCDate(startsAt.getUTCDate() + days);
      const endsAt = new Date(startsAt); endsAt.setUTCDate(endsAt.getUTCDate() + 1);
      const documents = await this.prisma.vendorDocument.findMany({
        where: { currentStatus: 'VERIFIED', versions: { some: { status: 'VERIFIED', expiresAt: { gte: startsAt, lt: endsAt } } } },
        select: { id: true, tenantId: true, type: true, versions: { orderBy: { versionNumber: 'desc' }, take: 1, select: { id: true, status: true, expiresAt: true } } },
      });
      for (const document of documents) {
        const version = document.versions[0];
        const expiresAt = version?.expiresAt;
        if (!version || version.status !== 'VERIFIED' || !expiresAt || expiresAt < startsAt || expiresAt >= endsAt) continue;
        const eventType = `VENDOR_DOCUMENT_EXPIRY_REMINDER_${days}`;
        const inserted = await this.prisma.$transaction(async (tx) => {
          await tx.$queryRaw`SELECT "id" FROM "VendorDocumentVersion" WHERE "id" = ${version.id} FOR UPDATE`;
          const existing = await tx.auditLog.findFirst({ where: { tenantId: document.tenantId, action: eventType, entityType: 'VendorDocumentVersion', entityId: version.id }, select: { id: true } });
          if (existing) return false;
          await this.audit.write(tx, { tenantId: document.tenantId, action: eventType, entityType: 'VendorDocumentVersion', entityId: version.id, reason: `Verified ${document.type.replaceAll('_', ' ').toLowerCase()} expires in ${days} days.`, metadata: { documentId: document.id, documentType: document.type, expiresAt } });
          await this.outbox.enqueue(tx, { tenantId: document.tenantId, eventType, aggregateType: 'VendorDocumentVersion', aggregateId: version.id, payload: { documentId: document.id, documentType: document.type, expiresAt: expiresAt.toISOString(), daysRemaining: days } });
          return true;
        });
        if (inserted) queued += 1;
      }
    }
    if (queued) this.logger.log(`Document expiry sync: queued ${queued} expiry reminder(s).`);
    return queued;
  }

  async syncRequiredDocumentProductStatus(now: Date) {
    const vendors = await this.prisma.tenant.findMany({
      where: {
        kind: 'VENDOR',
        vendorProfile: { verificationStatus: VendorVerificationStatus.VERIFIED },
        products: { some: { status: { in: [ProductStatus.LIVE, ProductStatus.SUSPENDED] }, deletedAt: null } },
      },
      select: {
        id: true,
        vendorDocuments: {
          select: { type: true, currentStatus: true, versions: { orderBy: { versionNumber: 'desc' }, take: 1, select: { status: true, expiresAt: true } } },
        },
        products: {
          where: { status: { in: [ProductStatus.LIVE, ProductStatus.SUSPENDED] }, deletedAt: null },
          select: { id: true, status: true, currentRevision: { select: { type: true, subType: true, category: true, subCategory: true } } },
        },
      },
    });

    let paused = 0;
    let resumed = 0;
    for (const vendor of vendors) {
      const application = await this.prisma.vendorOnboardingApplication.findUnique({ where: { tenantId: vendor.id }, select: { supplementalData: true } });
      const supplemental = application?.supplementalData && typeof application.supplementalData === 'object' && !Array.isArray(application.supplementalData) ? application.supplementalData as Record<string, unknown> : {};
      const documents = new Map<string, { valid: boolean; expiresAt: Date | null }>(vendor.vendorDocuments.map((document) => {
        const latest = document.versions[0];
        const valid = document.currentStatus === 'VERIFIED' && latest?.status === 'VERIFIED' && (!latest.expiresAt || latest.expiresAt > now);
        return [document.type, { valid, expiresAt: latest?.expiresAt ?? null }] as const;
      }));
      const invalidFor = (product: typeof vendor.products[number]) => requiredVendorDocumentsForProduct(supplemental.categories, product.currentRevision).filter((type) => !documents.get(type)?.valid);

      const suspendedIds = vendor.products.filter((row) => row.status === ProductStatus.SUSPENDED).map((row) => row.id);
      const transitions = suspendedIds.length ? await this.prisma.auditLog.findMany({
        where: { tenantId: vendor.id, entityType: 'Product', entityId: { in: suspendedIds }, action: { in: [AUTO_PAUSED, AUTO_RESUMED] } },
        orderBy: { createdAt: 'desc' }, select: { entityId: true, action: true },
      }) : [];
      const latestTransition = new Map<string, string>();
      for (const transition of transitions) if (transition.entityId && !latestTransition.has(transition.entityId)) latestTransition.set(transition.entityId, transition.action);

      for (const product of vendor.products.filter((row) => row.status === ProductStatus.LIVE)) {
        const documentTypes = invalidFor(product);
        if (!documentTypes.length) continue;
        const reason = `Required vendor documents are missing, expired, or awaiting verification: ${documentTypes.join(', ')}.`;
        const changed = await this.prisma.$transaction(async (tx) => {
          const result = await tx.product.updateMany({ where: { id: product.id, tenantId: vendor.id, status: ProductStatus.LIVE, deletedAt: null }, data: { status: ProductStatus.SUSPENDED } });
          if (result.count !== 1) return false;
          await this.audit.write(tx, { tenantId: vendor.id, action: AUTO_PAUSED, entityType: 'Product', entityId: product.id, reason, beforeState: { status: ProductStatus.LIVE }, afterState: { status: ProductStatus.SUSPENDED }, metadata: { documentTypes } });
          await this.outbox.enqueue(tx, { tenantId: vendor.id, eventType: AUTO_PAUSED, aggregateType: 'Product', aggregateId: product.id, payload: { reason, documentTypes } });
          return true;
        });
        if (changed) paused += 1;
      }

      for (const product of vendor.products.filter((row) => row.status === ProductStatus.SUSPENDED && latestTransition.get(row.id) === AUTO_PAUSED && invalidFor(row).length === 0)) {
        const changed = await this.prisma.$transaction(async (tx) => {
          const result = await tx.product.updateMany({ where: { id: product.id, tenantId: vendor.id, status: ProductStatus.SUSPENDED, deletedAt: null }, data: { status: ProductStatus.LIVE } });
          if (result.count !== 1) return false;
          await this.audit.write(tx, { tenantId: vendor.id, action: AUTO_RESUMED, entityType: 'Product', entityId: product.id, reason: 'Required vendor documents are verified and valid again.', beforeState: { status: ProductStatus.SUSPENDED }, afterState: { status: ProductStatus.LIVE }, metadata: { documentTypes: requiredVendorDocumentsForProduct(supplemental.categories, product.currentRevision) } });
          await this.outbox.enqueue(tx, { tenantId: vendor.id, eventType: AUTO_RESUMED, aggregateType: 'Product', aggregateId: product.id, payload: { documentTypes: requiredVendorDocumentsForProduct(supplemental.categories, product.currentRevision) } });
          return true;
        });
        if (changed) resumed += 1;
      }
    }

    if (paused || resumed) this.logger.log(`Document expiry sync: paused ${paused}, resumed ${resumed} vendor products.`);
    return { paused, resumed };
  }
}

function parseDateOnlyExpiry(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [year, month, day] = value.split('-').map(Number);
  const result = new Date(Date.UTC(year, month - 1, day, 23, 59, 59, 999));
  return result.getUTCFullYear() === year && result.getUTCMonth() === month - 1 && result.getUTCDate() === day ? result : null;
}
