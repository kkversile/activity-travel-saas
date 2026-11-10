import { BadRequestException, ConflictException, HttpException, HttpStatus, Injectable, ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { compare, hash } from 'bcryptjs';
import { createHash, randomBytes, randomInt } from 'crypto';
import { EmailAuthChallengePurpose, OrganizationRole, TenantKind, UserRole } from '@prisma/client';
import nodemailer from 'nodemailer';
import { PrismaService } from '../prisma/prisma.service';
import { hashOtp } from '../common/secret-crypto';
import { renderVoyaVendorEmailCodeHtml } from '../common/voya-email-template';
import { allocatePublicCode, allocateVendorVoucherShortCode, ensurePublicIdentifier, PublicEntity } from '../common/public-identifiers';
import { publicIdentifier } from '../common/public-identifiers';
import { LoginDto } from './login.dto';
import { ChangePasswordDto, RegisterDto, SetVendorPasswordDto } from './register.dto';

@Injectable()
export class AuthService {
  constructor(private readonly prisma: PrismaService, private readonly jwt: JwtService) {}

  async login(dto: LoginDto) {
    const identifier = dto.email.trim();
    let user: Awaited<ReturnType<PrismaService['user']['findUnique']>> = null;
    if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(identifier)) {
      user = await this.prisma.user.findUnique({ where: { email: identifier.toLowerCase() } });
    } else {
      const phoneDigits = identifier.replace(/\D/g, '');
      const contactNumber = identifier.trim().startsWith('+') ? `+${phoneDigits}` : phoneDigits.length === 10 ? `+91${phoneDigits}` : `+${phoneDigits}`;
      if (/^\+?[1-9]\d{9,14}$/.test(contactNumber)) {
        const matchingApplications = await this.prisma.vendorOnboardingApplication.findMany({
          where: { contactNumber, phoneVerifiedAt: { not: null } },
          select: { tenantId: true },
          take: 2,
        });
        if (matchingApplications.length === 1) {
          user = await this.prisma.user.findFirst({
            where: { tenantId: matchingApplications[0].tenantId, role: UserRole.VENDOR, organizationRole: OrganizationRole.OWNER },
          });
        }
      }
    }
    if (!user || !user.active || !(await compare(dto.password, user.passwordHash))) {
      throw new UnauthorizedException('Invalid email/mobile or password');
    }
    await this.prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
    return this.issueToken(user);
  }

  async verifyVendorLoginCode(challengeId: string, code: string, deviceToken: string) {
    const challenge = await this.prisma.emailAuthChallenge.findFirst({ where: { id: challengeId, purpose: EmailAuthChallengePurpose.LOGIN_VENDOR, consumedAt: null, expiresAt: { gt: new Date() } } });
    if (!challenge || challenge.attempts >= 5) throw new UnauthorizedException('Invalid or expired sign-in code');
    if (hashOtp(code.trim()) !== challenge.codeHash) {
      await this.prisma.emailAuthChallenge.update({ where: { id: challenge.id }, data: { attempts: { increment: 1 } } });
      throw new UnauthorizedException('Invalid or expired sign-in code');
    }
    const user = await this.prisma.user.findUnique({ where: { email: challenge.email } });
    if (!user || !user.active || user.role !== UserRole.VENDOR || !user.tenantId) throw new UnauthorizedException('Vendor account is no longer active');
    const now = new Date();
    await this.prisma.$transaction(async (tx) => {
      const consumed = await tx.emailAuthChallenge.updateMany({ where: { id: challenge.id, purpose: EmailAuthChallengePurpose.LOGIN_VENDOR, consumedAt: null, attempts: { lt: 5 } }, data: { consumedAt: now } });
      if (consumed.count !== 1) throw new UnauthorizedException('Sign-in code has already been used');
      const tokenHash = hashOtp(deviceToken);
      await tx.vendorTrustedDevice.upsert({
        where: { tokenHash },
        create: { userId: user.id, tokenHash, expiresAt: new Date(now.getTime() + 365 * 86400_000), lastUsedAt: now },
        update: { userId: user.id, expiresAt: new Date(now.getTime() + 365 * 86400_000), lastUsedAt: now },
      });
      await tx.user.update({ where: { id: user.id }, data: { lastLoginAt: now } });
    });
    return this.issueToken(user);
  }

  async verifyVendorLoginLink(token: string, deviceToken: string) {
    const normalizedToken = token.trim();
    if (!/^[A-Za-z0-9_-]{43}$/.test(normalizedToken)) throw new UnauthorizedException('Invalid or expired verification link');
    const tokenHash = hashOtp(normalizedToken);
    const now = new Date();
    const challenge = await this.prisma.emailAuthChallenge.findFirst({
      where: { verificationTokenHash: tokenHash, purpose: EmailAuthChallengePurpose.LOGIN_VENDOR, consumedAt: null, expiresAt: { gt: now }, attempts: { lt: 5 } },
    });
    if (!challenge) throw new UnauthorizedException('Invalid or expired verification link');
    const user = await this.prisma.user.findUnique({ where: { email: challenge.email } });
    if (!user || !user.active || user.role !== UserRole.VENDOR || !user.tenantId) throw new UnauthorizedException('Vendor account is no longer active');

    await this.prisma.$transaction(async (tx) => {
      const consumed = await tx.emailAuthChallenge.updateMany({
        where: { id: challenge.id, verificationTokenHash: tokenHash, purpose: EmailAuthChallengePurpose.LOGIN_VENDOR, consumedAt: null, expiresAt: { gt: now }, attempts: { lt: 5 } },
        data: { consumedAt: now },
      });
      if (consumed.count !== 1) throw new UnauthorizedException('Verification link has already been used');
      const deviceHash = hashOtp(deviceToken);
      await tx.vendorTrustedDevice.upsert({
        where: { tokenHash: deviceHash },
        create: { userId: user.id, tokenHash: deviceHash, expiresAt: new Date(now.getTime() + 365 * 86400_000), lastUsedAt: now },
        update: { userId: user.id, expiresAt: new Date(now.getTime() + 365 * 86400_000), lastUsedAt: now },
      });
      await tx.user.update({ where: { id: user.id }, data: { lastLoginAt: now } });
    });
    return this.issueToken(user);
  }

  async requestVendorLoginCode(email: string) {
    const normalizedEmail = email.trim().toLowerCase();
    const user = await this.prisma.user.findUnique({
      where: { email: normalizedEmail },
      select: { id: true, email: true, role: true, tenantId: true, active: true },
    });
    // Keep the response the same for unknown and ineligible accounts.
    if (!user || !user.active || user.role !== UserRole.VENDOR || !user.tenantId) {
      return { challengeId: randomBytes(16).toString('hex'), message: 'If this email can access a vendor account, a sign-in code has been sent.' };
    }
    const recent = await this.prisma.emailAuthChallenge.findFirst({
      where: { email: normalizedEmail, purpose: EmailAuthChallengePurpose.LOGIN_VENDOR, createdAt: { gt: new Date(Date.now() - 10_000) } },
      select: { id: true },
    });
    if (recent) throw new HttpException('Please wait before requesting another sign-in code', HttpStatus.TOO_MANY_REQUESTS);
    const code = process.env.NODE_ENV === 'production' ? String(randomInt(100000, 1_000_000)) : (process.env.DEMO_OTP || '123456');
    const verificationToken = randomBytes(32).toString('base64url');
    const expiresAt = new Date(Date.now() + 10 * 60_000);
    const challenge = await this.prisma.emailAuthChallenge.create({
      data: { email: normalizedEmail, purpose: EmailAuthChallengePurpose.LOGIN_VENDOR, codeHash: hashOtp(code), verificationTokenHash: hashOtp(verificationToken), expiresAt },
    });
    await this.deliverVendorEmailCode(normalizedEmail, code, EmailAuthChallengePurpose.LOGIN_VENDOR, this.vendorLoginVerificationUrl(verificationToken));
    return {
      challengeId: challenge.id,
      message: 'If this email can access a vendor account, a sign-in code has been sent.',
      demoOtp: process.env.NODE_ENV === 'production' ? undefined : code,
    };
  }

  async changePassword(user: { sub: string }, dto: ChangePasswordDto) {
    if (dto.newPassword !== dto.confirmPassword) {
      throw new BadRequestException('New password and confirmation do not match');
    }
    if (dto.currentPassword === dto.newPassword) {
      throw new BadRequestException('New password must be different from current password');
    }

    const existing = await this.prisma.user.findUnique({
      where: { id: user.sub },
      select: { id: true, passwordHash: true, active: true },
    });
    if (!existing || !existing.active || !(await compare(dto.currentPassword, existing.passwordHash))) {
      throw new UnauthorizedException('Current password is incorrect');
    }

    await this.prisma.user.update({
      where: { id: existing.id },
      data: { passwordHash: await hash(dto.newPassword, 10), mustChangePassword: false },
    });
    await this.prisma.vendorTrustedDevice?.deleteMany({ where: { userId: existing.id } });
    return { message: 'Password changed successfully' };
  }

  async requestVendorEmailCode(email: string) {
    const normalizedEmail = email.trim().toLowerCase();
    const existing = await this.prisma.user.findUnique({ where: { email: normalizedEmail }, select: { role: true, mustChangePassword: true } });
    const purpose = existing?.role === UserRole.VENDOR && !existing.mustChangePassword ? EmailAuthChallengePurpose.RESET_VENDOR_PASSWORD : EmailAuthChallengePurpose.ACTIVATE_VENDOR;
    const recent = await this.prisma.emailAuthChallenge.findFirst({ where: { email: normalizedEmail, purpose, createdAt: { gt: new Date(Date.now() - 10_000) } } });
    if (recent) throw new HttpException('Please wait before requesting another code', HttpStatus.TOO_MANY_REQUESTS);
    const code = process.env.NODE_ENV === 'production' ? String(randomInt(100000, 1_000_000)) : (process.env.DEMO_OTP || '123456');
    await this.deliverVendorEmailCode(normalizedEmail, code, purpose);
    await this.prisma.emailAuthChallenge.create({ data: { email: normalizedEmail, purpose, codeHash: hashOtp(code), expiresAt: new Date(Date.now() + 10 * 60_000) } });
    return { message: 'If this email can access a vendor account, a verification code has been sent.', demoOtp: process.env.NODE_ENV === 'production' ? undefined : code };
  }

  async verifyVendorEmailCode(email: string, code: string) {
    const normalizedEmail = email.trim().toLowerCase();
    const challenge = await this.prisma.emailAuthChallenge.findFirst({ where: { email: normalizedEmail, purpose: { in: [EmailAuthChallengePurpose.ACTIVATE_VENDOR, EmailAuthChallengePurpose.RESET_VENDOR_PASSWORD] }, consumedAt: null, expiresAt: { gt: new Date() } }, orderBy: { createdAt: 'desc' } });
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
      if (existing) {
        await tx.vendorTrustedDevice?.deleteMany({ where: { userId: existing.id } });
        return tx.user.update({ where: { id: existing.id }, data: { passwordHash, active: true, mustChangePassword: false } });
      }
      const emailName = challenge.email.split('@')[0];
      const base = emailName.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase() || 'vendor';
      const tenant = await tx.tenant.create({ data: { name: `${challenge.email} Vendor`, slug: `${base}-${randomBytes(4).toString('hex')}`, kind: TenantKind.VENDOR } });
      const created = await tx.user.create({ data: { tenantId: tenant.id, email: challenge.email, passwordHash, fullName: emailName, role: UserRole.VENDOR, organizationRole: 'OWNER' } });
      await ensurePublicIdentifier(tx, PublicEntity.USER, created.id, await allocatePublicCode(tx, PublicEntity.USER, 'VU-', 5));
      await tx.vendorProfile.create({ data: { tenantId: tenant.id, legalBusinessName: '', operatingCity: 'Not set', operatingRegion: 'Not set', voucherShortCode: await allocateVendorVoucherShortCode(tx) } });
      return created;
    });
    return this.issueToken(user);
  }

  async register(dto: RegisterDto) {
    const email = dto.email.toLowerCase();
    if (await this.prisma.user.findUnique({ where: { email } })) throw new ConflictException('An account with this email already exists');
    const passwordHash = await hash(dto.password, 10);
    if (dto.teamInviteToken) {
      if (!/^[A-Za-z0-9_-]{40,60}$/.test(dto.teamInviteToken)) throw new BadRequestException('Invitation is invalid or expired.');
      const tokenHash = createHash('sha256').update(dto.teamInviteToken).digest('hex');
      const created = await this.prisma.$transaction(async (tx) => {
        const locked = await tx.$queryRawUnsafe<any[]>(`SELECT "id" FROM "public"."VendorTeamInvitation" WHERE "tokenHash" = $1 FOR UPDATE`, tokenHash);
        if (!locked[0]) throw new BadRequestException('Invitation is invalid or expired.');
        const invitation = await tx.vendorTeamInvitation.findFirst({ where: { id: locked[0].id, email, status: 'INVITED', expiresAt: { gt: new Date() } }, include: { tenant: { select: { kind: true } } } });
        if (!invitation) throw new BadRequestException('Invitation is invalid, expired, or belongs to a different email address.');
        const role = invitation.tenant?.kind === TenantKind.TRAVEL_AGENT ? UserRole.TRAVEL_AGENT : UserRole.VENDOR;
        const user = await tx.user.create({ data: { tenantId: invitation.tenantId, email, passwordHash, fullName: dto.fullName, role, organizationRole: invitation.role } });
        await ensurePublicIdentifier(tx, PublicEntity.USER, user.id, await allocatePublicCode(tx, PublicEntity.USER, 'VU-', 5));
        await tx.vendorTeamInvitation.update({ where: { id: invitation.id }, data: { status: 'ACCEPTED', acceptedAt: new Date(), tokenHash: null } });
        return user;
      });
      return this.issueToken(created);
    }
    const slugBase = email.split('@')[0].replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'vendor';
    const slug = `${slugBase}-${Date.now().toString().slice(-6)}`;
    const created = await this.prisma.$transaction(async (tx) => {
      const tenant = await tx.tenant.create({ data: { name: `${dto.fullName} Vendor`, slug, kind: 'VENDOR' } });
      const user = await tx.user.create({ data: { tenantId: tenant.id, email, passwordHash, fullName: dto.fullName, role: 'VENDOR', organizationRole: 'OWNER' } });
      await ensurePublicIdentifier(tx, PublicEntity.USER, user.id, await allocatePublicCode(tx, PublicEntity.USER, 'VU-', 5));
      await tx.vendorProfile.create({ data: { tenantId: tenant.id, legalBusinessName: dto.businessName?.trim() || dto.fullName, operatingCity: dto.city?.trim() || 'Not set', operatingRegion: 'Not set', category: dto.category?.trim() || null, registrationMobile: dto.mobile?.trim() || null, termsAcceptedAt: dto.acceptedTerms === true ? new Date() : null, voucherShortCode: await allocateVendorVoucherShortCode(tx) } });
      return user;
    });
    const payload = { sub: created.id, email: created.email, role: created.role, tenantId: created.tenantId, organizationRole: created.organizationRole };
    return this.issueToken(created);
  }

  async previewVendorTeamInvitation(token: string) {
    if (!/^[A-Za-z0-9_-]{40,60}$/.test(token)) throw new BadRequestException('Invitation is invalid or expired.');
    const tokenHash = createHash('sha256').update(token).digest('hex');
    const invitation = await this.prisma.vendorTeamInvitation.findFirst({ where: { tokenHash, status: 'INVITED', expiresAt: { gt: new Date() } }, include: { tenant: { select: { name: true, kind: true } } } });
    if (!invitation) throw new BadRequestException('Invitation is invalid or expired.');
    return { email: invitation.email, role: invitation.role, workspaceName: invitation.tenant.name, workspaceKind: invitation.tenant.kind, expiresAt: invitation.expiresAt };
  }

  private async issueToken(user: { id: string; email: string; fullName: string; role: UserRole; tenantId: string | null; organizationRole: any; active: boolean; mustChangePassword: boolean }) {
    const payload = { sub: user.id, email: user.email, role: user.role, tenantId: user.tenantId, organizationRole: user.organizationRole, mustChangePassword: user.mustChangePassword };
    return { accessToken: await this.jwt.signAsync(payload), user: { id: user.id, publicCode: await publicIdentifier(this.prisma, PublicEntity.USER, user.id), email: user.email, fullName: user.fullName, role: user.role, tenantId: user.tenantId, organizationRole: user.organizationRole, active: user.active, mustChangePassword: user.mustChangePassword } };
  }

  private vendorLoginVerificationUrl(token: string) {
    const configuredBase = process.env.VENDOR_PORTAL_URL?.trim();
    const allowedOrigin = process.env.CORS_ORIGINS?.split(',').map((value) => value.trim()).find(Boolean) || 'http://localhost:3007';
    const fallbackBase = `${allowedOrigin.replace(/\/$/, '')}${process.env.NODE_ENV === 'production' ? '/voya' : ''}`;
    const url = new URL(configuredBase || fallbackBase);
    if (!['http:', 'https:'].includes(url.protocol)) throw new ServiceUnavailableException('Vendor portal URL must use HTTP or HTTPS');
    url.pathname = `${url.pathname.replace(/\/+$/, '')}/register`.replace(/\/{2,}/g, '/');
    url.search = '';
    url.hash = new URLSearchParams({ emailVerify: token }).toString();
    return url.toString();
  }

  private async deliverVendorEmailCode(email: string, code: string, purpose: EmailAuthChallengePurpose, verificationUrl?: string) {
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
      const isLogin = purpose === EmailAuthChallengePurpose.LOGIN_VENDOR;
      try {
        await transporter.sendMail({
          from: {
            name: process.env.SMTP_FROM_NAME?.trim() || 'Voya',
            address: process.env.SMTP_FROM_EMAIL?.trim() || smtpUser,
          },
          to: email,
          subject: isPasswordReset ? 'Reset your Voya vendor password' : isLogin ? 'Your Voya sign-in verification code' : 'Complete your Voya vendor access',
          text: `Your Voya verification code is ${code}. It expires in 10 minutes.${verificationUrl ? ` Or verify and sign in here: ${verificationUrl}` : ''}`,
          html: renderVoyaVendorEmailCodeHtml(code, purpose, verificationUrl),
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
    const response = await fetch(webhook, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ to: email, code, purpose, expiresInMinutes: 10, ...(verificationUrl ? { verificationUrl } : {}) }) });
    if (!response.ok) throw new ServiceUnavailableException('Email delivery failed');
  }
}
