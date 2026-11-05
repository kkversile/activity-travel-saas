import { Injectable } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import nodemailer from 'nodemailer';
import { PrismaService } from '../prisma/prisma.service';
import { OutboxService } from './outbox.service';

const BOOKING_EVENTS = [
  'BOOKING_CONFIRMED', 'BOOKING_CONFIRMED_AFTER_FAILOVER', 'BOOKING_CANCELLED_AGENT',
  'BOOKING_CANCELLED_ADMIN', 'BOOKING_CANCELLED_VENDOR', 'BOOKING_CONFIRMATION_EXPIRED',
  'BOOKING_MANUAL_REJECTED', 'VENDOR_REJECTED', 'VENDOR_API_FAILURE',
  'BOOKING_FAILOVER_PENDING_VENDOR',
];
const PAYOUT_EVENTS = [
  'SETTLEMENT_BATCH_READY_FOR_PAYOUT', 'PAYOUT_RELEASE_RECORDED', 'PAYOUT_RELEASE_FAILED',
  'PAYOUT_RECONCILED', 'PAYOUT_RECONCILIATION_REQUIRED',
];
const DOCUMENT_EVENTS = ['PRODUCT_AUTO_PAUSED_DOCUMENT_EXPIRY', 'PRODUCT_AUTO_RESUMED_DOCUMENT_RENEWAL', 'VENDOR_DOCUMENT_EXPIRY_REMINDER_30', 'VENDOR_DOCUMENT_EXPIRY_REMINDER_15', 'VENDOR_DOCUMENT_EXPIRY_REMINDER_3'];
const EVENT_TYPES = [...BOOKING_EVENTS, ...PAYOUT_EVENTS, ...DOCUMENT_EVENTS];

@Injectable()
export class VendorNotificationWorker {
  constructor(private readonly prisma: PrismaService, private readonly outbox: OutboxService) {}

  @Cron(CronExpression.EVERY_30_SECONDS)
  async dispatch() {
    const host = process.env.SMTP_HOST?.trim();
    const user = process.env.SMTP_USER?.trim();
    const password = process.env.SMTP_PASSWORD;
    if (!host || !user || !password) return;

    const port = Number(process.env.SMTP_PORT || 587);
    const transporter = nodemailer.createTransport({
      host,
      port,
      secure: String(process.env.SMTP_SECURE || '').toLowerCase() === 'true' || port === 465,
      auth: { user, pass: password },
    });
    const events = await this.outbox.claimPending(25, EVENT_TYPES);
    for (const event of events) {
      try {
        const payload = event.payload && typeof event.payload === 'object' ? event.payload as Record<string, unknown> : {};
        if (payload.qaOnlyTestFixture === true) {
          await this.outbox.markProcessed(event.id);
          continue;
        }
        const result = await this.resolveVendor(event);
        if (!result) {
          await this.outbox.markProcessed(event.id);
          continue;
        }
        const { tenantId, preferenceKey, label, reference, detail } = result;
        const setting = await this.prisma.globalSetting.findFirst({
          where: { tenantId, key: 'vendor_notification_preferences' },
          select: { value: true },
        });
        const preferences = setting?.value && typeof setting.value === 'object'
          ? setting.value as Record<string, unknown>
          : {};
        if (preferences[preferenceKey] === false) {
          await this.outbox.markProcessed(event.id);
          continue;
        }

        const recipients = await this.prisma.user.findMany({
          where: { tenantId, role: 'VENDOR', active: true },
          orderBy: [{ organizationRole: 'asc' }, { createdAt: 'asc' }],
          select: { email: true, fullName: true },
        });
        if (recipients.length) {
          const from = { name: process.env.SMTP_FROM_NAME?.trim() || 'Voya', address: process.env.SMTP_FROM_EMAIL?.trim() || user };
          const subject = `${label} · ${reference}`;
          const text = [
            `Hello,`, '', detail, '',
            `Reference: ${reference}`,
            `This notification was sent from your Voya vendor workspace.`,
          ].join('\n');
          for (const recipient of recipients) {
            await transporter.sendMail({ from, to: recipient.email, subject, text: `Hello ${recipient.fullName},\n\n${text}` });
          }
        }
        await this.outbox.markProcessed(event.id);
      } catch (error) {
        await this.outbox.retryOrFail(event, error instanceof Error ? error.message : String(error));
      }
    }
  }

  private async resolveVendor(event: { tenantId: string | null; eventType: string; aggregateType: string; aggregateId: string | null; payload: unknown }) {
    if (event.eventType.startsWith('VENDOR_DOCUMENT_EXPIRY_REMINDER_') && event.aggregateType === 'VendorDocumentVersion' && event.aggregateId && event.tenantId) {
      const version = await this.prisma.vendorDocumentVersion.findFirst({
        where: { id: event.aggregateId, vendorDocument: { tenantId: event.tenantId } },
        select: { expiresAt: true, vendorDocument: { select: { type: true } } },
      });
      if (!version) return null;
      const days = Number(event.eventType.split('_').at(-1));
      return {
        tenantId: event.tenantId,
        preferenceKey: 'documentExpiryEmail',
        label: `Document expires in ${days} days`,
        reference: version.vendorDocument.type.replaceAll('_', ' '),
        detail: `Your verified ${version.vendorDocument.type.replaceAll('_', ' ').toLowerCase()} expires on ${version.expiresAt?.toISOString().slice(0, 10) || 'the recorded expiry date'}. Upload a renewed document in Business profile & KYC.`,
      };
    }
    if (DOCUMENT_EVENTS.includes(event.eventType) && event.aggregateType === 'Product' && event.aggregateId && event.tenantId) {
      const product = await this.prisma.product.findFirst({
        where: { id: event.aggregateId, tenantId: event.tenantId },
        select: { productCode: true, currentRevision: { select: { productName: true } } },
      });
      if (!product) return null;
      const paused = event.eventType === 'PRODUCT_AUTO_PAUSED_DOCUMENT_EXPIRY';
      const payload = event.payload && typeof event.payload === 'object' ? event.payload as Record<string, unknown> : {};
      const documentTypes = Array.isArray(payload.documentTypes) ? payload.documentTypes.map((type) => String(type).replaceAll('_', ' ').toLowerCase()).join(', ') : 'required vendor documents';
      return {
        tenantId: event.tenantId,
        preferenceKey: 'documentExpiryEmail',
        label: paused ? 'Product sales paused · documents need attention' : 'Product sales resumed · documents verified',
        reference: product.productCode,
        detail: `${product.currentRevision?.productName || product.productCode}: ${paused ? `sales were paused because these required documents need renewal or verification: ${documentTypes}` : `sales resumed after required documents were verified and found valid: ${documentTypes}`}${payload.reason ? `. ${String(payload.reason)}` : ''}`,
      };
    }
    if (BOOKING_EVENTS.includes(event.eventType) && event.aggregateType === 'Booking' && event.aggregateId) {
      const booking = await this.prisma.booking.findUnique({
        where: { id: event.aggregateId },
        select: { vendorTenantId: true, bookingCode: true, status: true, serviceDate: true },
      });
      if (!booking) return null;
      const isCancellation = event.eventType.includes('CANCEL');
      const payload = event.payload && typeof event.payload === 'object' ? event.payload as Record<string, unknown> : {};
      return {
        tenantId: booking.vendorTenantId,
        preferenceKey: isCancellation ? 'cancellationEmail' : 'bookingEmail',
        label: isCancellation ? 'Booking cancelled' : 'Booking update',
        reference: booking.bookingCode,
        detail: `Booking ${booking.bookingCode} is now ${booking.status.replaceAll('_', ' ').toLowerCase()}. Service date: ${booking.serviceDate.toISOString().slice(0, 10)}.${payload.reason ? ` Reason: ${String(payload.reason)}` : ''}`,
      };
    }
    if (PAYOUT_EVENTS.includes(event.eventType) && event.tenantId) {
      const payload = event.payload && typeof event.payload === 'object' ? event.payload as Record<string, unknown> : {};
      const reference = event.aggregateId || String(payload.batchCode || payload.payoutId || 'payout');
      const label = event.eventType === 'PAYOUT_RELEASE_FAILED' || event.eventType === 'PAYOUT_RECONCILIATION_REQUIRED'
        ? 'Payout needs attention'
        : 'Payout update';
      const amount = payload.amount ?? payload.netPayable ?? payload.expectedAmount;
      return {
        tenantId: event.tenantId,
        preferenceKey: 'payoutEmail',
        label,
        reference,
        detail: `${event.eventType.replaceAll('_', ' ').toLowerCase()}${amount === undefined ? '' : ` · ${String(amount)} ${String(payload.currency || 'INR')}`}${payload.reason ? `. ${String(payload.reason)}` : ''}`,
      };
    }
    return null;
  }
}
