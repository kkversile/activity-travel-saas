import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import nodemailer from 'nodemailer';
import { PrismaService } from '../prisma/prisma.service';

type ProductEmailKind = 'SUBMITTED' | 'REJECTED' | 'APPROVED';

function escapeHtml(value: string) {
  return value.replace(/[&<>'"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[character] ?? character);
}

@Injectable()
export class CatalogueEmailService {
  constructor(private readonly prisma: PrismaService) {}

  async notifySubmitted(revisionId: string) {
    const revision = await this.revisionDetails(revisionId);
    if (!revision) throw new ServiceUnavailableException('Product revision is not available for email notification');
    await this.send(await this.adminRecipients(), 'SUBMITTED', revision, null);
  }

  async notifyDecision(revisionId: string, kind: 'REJECTED' | 'APPROVED', reason?: string | null) {
    const revision = await this.revisionDetails(revisionId);
    const recipient = revision?.product.tenant.users[0];
    if (!revision || !recipient?.email) throw new ServiceUnavailableException('Vendor email is not available for product notification');
    await this.send([recipient.email], kind, revision, reason ?? null);
  }

  private async revisionDetails(revisionId: string) {
    return this.prisma.productRevision.findUnique({
      where: { id: revisionId },
      select: {
        id: true, versionNumber: true, productName: true,
        product: { select: { productCode: true, tenant: { select: { name: true, users: { where: { role: UserRole.VENDOR, active: true }, orderBy: { createdAt: 'asc' }, take: 1, select: { email: true, fullName: true } } } } } },
      },
    });
  }

  private async adminRecipients() {
    const configured = [process.env.PRODUCT_ADMIN_EMAIL, process.env.ONBOARDING_ADMIN_EMAIL].flatMap((value) => (value || '').split(',')).map((value) => value.trim().toLowerCase()).filter(Boolean);
    const admins = await this.prisma.user.findMany({ where: { role: { in: [UserRole.ADMIN, UserRole.SUPER_ADMIN] }, active: true }, select: { email: true } });
    const recipients = [...new Set([...configured, ...admins.map((admin) => admin.email.toLowerCase())])];
    return recipients.length ? recipients : ['dhisoftai@gmail.com'];
  }

  private async send(to: string[], kind: ProductEmailKind, revision: any, reason: string | null) {
    const smtpHost = process.env.SMTP_HOST?.trim(); const smtpUser = process.env.SMTP_USER?.trim(); const smtpPassword = process.env.SMTP_PASSWORD;
    if (!smtpHost || !smtpUser || !smtpPassword) throw new ServiceUnavailableException('Email delivery is not configured');
    const port = Number(process.env.SMTP_PORT || 587); const secure = String(process.env.SMTP_SECURE || '').toLowerCase() === 'true' || port === 465;
    const transporter = nodemailer.createTransport({ host: smtpHost, port, secure, auth: { user: smtpUser, pass: smtpPassword } });
    const productName = revision.productName || revision.product.productCode; const vendorName = revision.product.tenant.name;
    const subject = kind === 'SUBMITTED' ? `Voya product submitted for review: ${productName}` : kind === 'APPROVED' ? `Voya product approved: ${productName}` : `Voya product revision rejected: ${productName}`;
    const status = kind === 'SUBMITTED' ? 'UNDER REVIEW' : kind; const greeting = kind === 'SUBMITTED' ? 'Hello Voya Admin Team,' : `Hello ${revision.product.tenant.users[0]?.fullName || vendorName},`;
    const nextStep = kind === 'SUBMITTED' ? 'Please sign in to the Voya Admin Console to review this product submission.' : kind === 'APPROVED' ? 'Your product is now published. Please sign in to the Voya Vendor Console to view its live status.' : 'Please sign in to the Voya Vendor Console, address the reviewer note, and resubmit the product.';
    const reasonBlock = reason?.trim() ? `\n\nReviewer note: ${reason.trim()}` : '';
    const text = `${subject}\n\n${greeting}\n\nProduct: ${productName}\nProduct code: ${revision.product.productCode}\nRevision: v${revision.versionNumber}\nStatus: ${status}${reasonBlock}\n\n${nextStep}`;
    const html = `<!doctype html><html lang="en"><body style="margin:0;background:#f6f4ee;font-family:Arial,Helvetica,sans-serif;color:#162b50"><div style="padding:32px 12px"><table width="100%" cellspacing="0" cellpadding="0" style="max-width:680px;margin:0 auto;background:#fff;border:1px solid #e4e1d9;border-radius:14px;overflow:hidden"><tr><td style="padding:24px 32px;background:#111f3d;color:#fff;font-size:23px;font-weight:800">Voya <span style="font-size:11px;letter-spacing:1.8px;color:#aab8d0">PRODUCT WORKFLOW</span></td></tr><tr><td style="height:6px;background:#efa832;font-size:0">&nbsp;</td></tr><tr><td style="padding:32px"><div style="font-size:12px;font-weight:800;letter-spacing:1.6px;text-transform:uppercase;color:#c88920;margin-bottom:12px">PRODUCT ${kind}</div><h1 style="margin:0 0 18px;color:#111f3d;font-size:26px">${escapeHtml(subject)}</h1><p style="color:#526886;line-height:1.6">${escapeHtml(greeting)}</p><table width="100%" cellspacing="0" cellpadding="0" style="margin:24px 0;border:1px solid #e6dfcf;border-radius:10px;background:#fffaf0"><tr><td style="padding:18px 20px"><b>Product</b><br>${escapeHtml(productName)}<br><br><b>Product code</b><br>${escapeHtml(revision.product.productCode)}<br><br><b>Revision</b><br>v${revision.versionNumber}<br><br><b>Status</b><br>${escapeHtml(status)}</td></tr></table>${reason?.trim() ? `<div style="padding:16px 18px;border-left:4px solid #d65b4b;background:#fff1ef;color:#526886;line-height:1.6"><strong style="color:#111f3d">Reviewer note</strong><br>${escapeHtml(reason.trim())}</div>` : ''}<p style="color:#71809a;font-size:13px;line-height:1.6">${escapeHtml(nextStep)}</p></td></tr></table></div></body></html>`;
    try {
      await transporter.sendMail({ from: { name: process.env.SMTP_FROM_NAME?.trim() || 'Voya', address: process.env.SMTP_FROM_EMAIL?.trim() || smtpUser }, to, subject, text, html });
      console.info(`[product email] ${kind} sent to ${to.join(', ')}`, { productCode: revision.product.productCode, revisionId: revision.id });
    } catch (error) {
      console.error('Product email delivery failed', error instanceof Error ? error.message : error);
      throw new ServiceUnavailableException('Product email delivery failed');
    }
  }
}
