import { ConflictException, HttpException, HttpStatus, Injectable, ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { compare, hash } from 'bcryptjs';
import { randomBytes, randomInt } from 'crypto';
import { EmailAuthChallengePurpose, TenantKind, UserRole } from '@prisma/client';
import nodemailer from 'nodemailer';
import { PrismaService } from '../prisma/prisma.service';
import { hashOtp } from '../common/secret-crypto';
import { renderVoyaVendorEmailCodeHtml } from '../common/voya-email-template';
import { LoginDto } from './login.dto';
import { RegisterDto, SetVendorPasswordDto } from './register.dto';

@Injectable()
export class AuthService {
  constructor(private readonly prisma: PrismaService, private readonly jwt: JwtService) {}

  async login(dto: LoginDto) {
    const user = await this.prisma.user.findUnique({ where: { email: dto.email.toLowerCase() } });
    if (!user || !user.active || !(await compare(dto.password, user.passwordHash))) {
      throw new UnauthorizedException('Invalid email or password');
    }
    return this.issueToken(user);
  }

  async requestVendorEmailCode(email: string) {
    const normalizedEmail = email.trim().toLowerCase();
    const existing = await this.prisma.user.findUnique({ where: { email: normalizedEmail }, select: { role: true } });
    const purpose = existing?.role === UserRole.VENDOR ? EmailAuthChallengePurpose.RESET_VENDOR_PASSWORD : EmailAuthChallengePurpose.ACTIVATE_VENDOR;
    const recent = await this.prisma.emailAuthChallenge.findFirst({ where: { email: normalizedEmail, purpose, createdAt: { gt: new Date(Date.now() - 10_000) } } });
    if (recent) throw new HttpException('Please wait before requesting another code', HttpStatus.TOO_MANY_REQUESTS);
    const code = process.env.NODE_ENV === 'production' ? String(randomInt(100000, 1_000_000)) : (process.env.DEMO_OTP || '123456');
    await this.deliverVendorEmailCode(normalizedEmail, code, purpose);
    await this.prisma.emailAuthChallenge.create({ data: { email: normalizedEmail, purpose, codeHash: hashOtp(code), expiresAt: new Date(Date.now() + 10 * 60_000) } });
    return { message: 'If this email can access a vendor account, a verification code has been sent.', demoOtp: process.env.NODE_ENV === 'production' ? undefined : code };
  }

  async verifyVendorEmailCode(email: string, code: string) {
    const normalizedEmail = email.trim().toLowerCase();
    const challenge = await this.prisma.emailAuthChallenge.findFirst({ where: { email: normalizedEmail, consumedAt: null, expiresAt: { gt: new Date() } }, orderBy: { createdAt: 'desc' } });
    if (!challenge || challenge.attempts >= 5) throw new UnauthorizedException('Invalid or expired verification code');
    if (hashOtp(code.trim()) !== challenge.codeHash) {
      await this.prisma.emailAuthChallenge.update({ where: { id: challenge.id }, data: { attempts: { increment: 1 } } });
      throw new UnauthorizedException('Invalid or expired verification code');
    }
    const setupToken = randomBytes(32).toString('base64url');
    await this.prisma.emailAuthChallenge.update({ where: { id: challenge.id }, data: { verifiedAt: new Date(), verificationTokenHash: hashOtp(setupToken) } });
    return { setupToken, email: normalizedEmail, purpose: challenge.purpose };
  }

  async setVendorPassword(dto: SetVendorPasswordDto) {
    const challenge = await this.prisma.emailAuthChallenge.findFirst({ where: { verificationTokenHash: hashOtp(dto.setupToken), verifiedAt: { not: null }, consumedAt: null, expiresAt: { gt: new Date() } }, orderBy: { createdAt: 'desc' } });
    if (!challenge) throw new UnauthorizedException('Your verification session has expired');
    const passwordHash = await hash(dto.password, 10);
    const existing = await this.prisma.user.findUnique({ where: { email: challenge.email } });
    if (existing && existing.role !== UserRole.VENDOR) throw new ConflictException('This email is reserved for another account type');
    const user = await this.prisma.$transaction(async (tx) => {
      const consumed = await tx.emailAuthChallenge.updateMany({ where: { id: challenge.id, consumedAt: null }, data: { consumedAt: new Date() } });
      if (consumed.count !== 1) throw new UnauthorizedException('Your verification session has already been used');
      if (existing) return tx.user.update({ where: { id: existing.id }, data: { passwordHash, active: true, ...(dto.fullName?.trim() ? { fullName: dto.fullName.trim() } : {}) } });
      const base = (dto.fullName?.trim() || challenge.email.split('@')[0]).replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase() || 'vendor';
      const tenant = await tx.tenant.create({ data: { name: `${dto.fullName?.trim() || challenge.email} Vendor`, slug: `${base}-${randomBytes(4).toString('hex')}`, kind: TenantKind.VENDOR } });
      const created = await tx.user.create({ data: { tenantId: tenant.id, email: challenge.email, passwordHash, fullName: dto.fullName?.trim() || challenge.email.split('@')[0], role: UserRole.VENDOR, organizationRole: 'OWNER' } });
      await tx.vendorProfile.create({ data: { tenantId: tenant.id, legalBusinessName: dto.fullName?.trim() || 'Vendor pending onboarding', operatingCity: 'Not set', operatingRegion: 'Not set' } });
      return created;
    });
    return this.issueToken(user);
  }

  async register(dto: RegisterDto) {
    const email = dto.email.toLowerCase();
    if (await this.prisma.user.findUnique({ where: { email } })) throw new ConflictException('An account with this email already exists');
    const slugBase = email.split('@')[0].replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'vendor';
    const slug = `${slugBase}-${Date.now().toString().slice(-6)}`;
    const passwordHash = await hash(dto.password, 10);
    const created = await this.prisma.$transaction(async (tx) => {
      const tenant = await tx.tenant.create({ data: { name: `${dto.fullName} Vendor`, slug, kind: 'VENDOR' } });
      const user = await tx.user.create({ data: { tenantId: tenant.id, email, passwordHash, fullName: dto.fullName, role: 'VENDOR', organizationRole: 'OWNER' } });
      await tx.vendorProfile.create({ data: { tenantId: tenant.id, legalBusinessName: dto.fullName, operatingCity: 'Not set', operatingRegion: 'Not set' } });
      return user;
    });
    const payload = { sub: created.id, email: created.email, role: created.role, tenantId: created.tenantId, organizationRole: created.organizationRole };
    return this.issueToken(created);
  }

  private async issueToken(user: { id: string; email: string; fullName: string; role: UserRole; tenantId: string | null; organizationRole: any; active: boolean }) {
    const payload = { sub: user.id, email: user.email, role: user.role, tenantId: user.tenantId, organizationRole: user.organizationRole };
    return { accessToken: await this.jwt.signAsync(payload), user: { id: user.id, email: user.email, fullName: user.fullName, role: user.role, tenantId: user.tenantId, organizationRole: user.organizationRole, active: user.active } };
  }

  private async deliverVendorEmailCode(email: string, code: string, purpose: EmailAuthChallengePurpose) {
    const smtpHost = process.env.SMTP_HOST?.trim();
    const smtpUser = process.env.SMTP_USER?.trim();
    const smtpPassword = process.env.SMTP_PASSWORD;

    if (smtpHost && smtpUser && smtpPassword) {
      const port = Number(process.env.SMTP_PORT || 587);
      const secure = String(process.env.SMTP_SECURE || '').toLowerCase() === 'true' || port === 465;
      const transporter = nodemailer.createTransport({
        host: smtpHost,
        port,
        secure,
        auth: { user: smtpUser, pass: smtpPassword },
      });
      const isPasswordReset = purpose === EmailAuthChallengePurpose.RESET_VENDOR_PASSWORD;
      try {
        await transporter.sendMail({
          from: {
            name: process.env.SMTP_FROM_NAME?.trim() || 'Voya',
            address: process.env.SMTP_FROM_EMAIL?.trim() || smtpUser,
          },
          to: email,
          subject: isPasswordReset ? 'Reset your Voya vendor password' : 'Complete your Voya vendor access',
          text: `Your Voya verification code is ${code}. It expires in 10 minutes.`,
          html: renderVoyaVendorEmailCodeHtml(code, purpose),
        });
        return;
      } catch (error) {
        console.error('SMTP email delivery failed', error instanceof Error ? error.message : error);
        throw new ServiceUnavailableException('Email delivery failed');
      }
    }

    const webhook = process.env.EMAIL_OTP_WEBHOOK_URL;
    if (!webhook) {
      if (process.env.NODE_ENV === 'production') throw new ServiceUnavailableException('Email delivery is not configured');
      console.info(`[demo email OTP] ${email} ${purpose}: ${code}`);
      return;
    }
    const response = await fetch(webhook, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ to: email, code, purpose, expiresInMinutes: 10 }) });
    if (!response.ok) throw new ServiceUnavailableException('Email delivery failed');
  }
}
