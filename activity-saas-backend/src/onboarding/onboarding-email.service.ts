import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { TenantKind, UserRole } from '@prisma/client';
import nodemailer from 'nodemailer';
import { PrismaService } from '../prisma/prisma.service';
import { OnboardingEmailAudience, OnboardingEmailKind, onboardingEmailCopy, renderVoyaOnboardingEmailHtml } from './onboarding-email-template';

@Injectable()
export class OnboardingEmailService {
  constructor(private readonly prisma: PrismaService) {}

  async notifySubmitted(tenantId: string, vendorName?: string | null) {
    const recipient = process.env.ONBOARDING_ADMIN_EMAIL?.trim() || 'dhisoftai@gmail.com';
    const name = vendorName?.trim() || await this.vendorName(tenantId);
    await this.send(recipient, name, 'SUBMITTED', 'SUBMITTED', null, 'ADMIN');
  }

  async notifyReview(tenantId: string, kind: OnboardingEmailKind, status: string, reason?: string | null) {
    const vendor = await this.vendorContact(tenantId);
    if (!vendor?.email) throw new ServiceUnavailableException('Vendor email is not available for onboarding notification');
    await this.send(vendor.email, vendor.name, kind, status, reason);
  }

  private async vendorContact(tenantId: string) {
    const tenant = await this.prisma.tenant.findFirst({ where: { id: tenantId, kind: TenantKind.VENDOR }, select: { name: true, users: { where: { role: UserRole.VENDOR, active: true }, orderBy: { createdAt: 'asc' }, take: 1, select: { email: true, fullName: true } } } });
    const user = tenant?.users[0];
    return user ? { email: user.email, name: user.fullName || tenant.name } : null;
  }

  private async vendorName(tenantId: string) {
    const tenant = await this.prisma.tenant.findFirst({ where: { id: tenantId, kind: TenantKind.VENDOR }, select: { name: true } });
    return tenant?.name || 'Voya vendor';
  }

  private async send(to: string, vendorName: string, kind: OnboardingEmailKind, status: string, reason?: string | null, audience: OnboardingEmailAudience = 'VENDOR') {
    const smtpHost = process.env.SMTP_HOST?.trim();
    const smtpUser = process.env.SMTP_USER?.trim();
    const smtpPassword = process.env.SMTP_PASSWORD;
    if (!smtpHost || !smtpUser || !smtpPassword) throw new ServiceUnavailableException('Email delivery is not configured');
    const port = Number(process.env.SMTP_PORT || 587);
    const secure = String(process.env.SMTP_SECURE || '').toLowerCase() === 'true' || port === 465;
    const transporter = nodemailer.createTransport({ host: smtpHost, port, secure, auth: { user: smtpUser, pass: smtpPassword } });
    const copy = onboardingEmailCopy(kind);
    try {
      const greeting = audience === 'ADMIN' ? 'Hello Voya Admin Team,' : `Hello ${vendorName},`;
      const signInMessage = audience === 'ADMIN' ? 'Please sign in to your Voya Admin Console to review the latest vendor onboarding application.' : 'Please sign in to your Voya Vendor Console to view the latest application status and continue the onboarding process.';
      await transporter.sendMail({ from: { name: process.env.SMTP_FROM_NAME?.trim() || 'Voya', address: process.env.SMTP_FROM_EMAIL?.trim() || smtpUser }, to, subject: copy.subject, text: `${copy.heading}\n\n${greeting}\n\n${copy.intro}\n\nApplication status: ${status.replaceAll('_', ' ')}${reason ? `\n\nReviewer note: ${reason}` : ''}\n\n${signInMessage}`, html: renderVoyaOnboardingEmailHtml({ kind, vendorName, status, reason, audience }) });
    } catch (error) {
      console.error('Onboarding email delivery failed', error instanceof Error ? error.message : error);
      throw new ServiceUnavailableException('Onboarding email delivery failed');
    }
  }
}
