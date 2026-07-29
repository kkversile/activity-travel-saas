import { Injectable, UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PrismaService } from "../prisma/prisma.service";
import { hashPassword, hashToken, randomToken, signAccessToken, verifyPassword } from "./crypto";
import type { LoginDto, RefreshDto } from "./dto";

@Injectable()
export class AuthService {
  private readonly accessSeconds = 15 * 60;
  private readonly refreshDays = 30;

  constructor(private readonly prisma: PrismaService, private readonly config: ConfigService) {}

  async login(dto: LoginDto) {
    const user = await this.prisma.user.findUnique({ where: { email: dto.email.toLowerCase() }, include: { memberships: true } });
    if (!user?.isActive || !user.passwordHash || !(await verifyPassword(dto.password, user.passwordHash))) {
      throw new UnauthorizedException("Invalid email or password");
    }
    const tokens = await this.issueTokens(user);
    await this.prisma.auditLog.create({ data: { tenantId: user.tenantId, actorUserId: user.id, action: "LOGIN", entityType: "User", entityId: user.id } });
    return { ...tokens, user: this.publicUser(user) };
  }

  async refresh(dto: RefreshDto) {
    const tokenHash = hashToken(dto.refreshToken);
    const existing = await this.prisma.refreshToken.findUnique({ where: { tokenHash }, include: { user: { include: { memberships: true } } } });
    if (!existing || existing.revokedAt || existing.expiresAt <= new Date() || !existing.user.isActive) throw new UnauthorizedException("Invalid refresh token");
    const next = await this.issueTokens(existing.user);
    const replacementHash = hashToken(next.refreshToken);
    await this.prisma.refreshToken.update({ where: { id: existing.id }, data: { revokedAt: new Date(), replacedByTokenHash: replacementHash } });
    await this.prisma.auditLog.create({ data: { tenantId: existing.user.tenantId, actorUserId: existing.user.id, action: "REFRESH_TOKEN_ROTATED", entityType: "RefreshToken", entityId: existing.id } });
    return { ...next, user: this.publicUser(existing.user) };
  }

  async logout(dto: RefreshDto): Promise<{ success: true }> {
    await this.prisma.refreshToken.updateMany({ where: { tokenHash: hashToken(dto.refreshToken), revokedAt: null }, data: { revokedAt: new Date() } });
    return { success: true };
  }

  async me(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId }, include: { memberships: { include: { tenant: true } } } });
    if (!user || !user.isActive) throw new UnauthorizedException();
    return this.publicUser(user);
  }

  async ensureDemoPassword(userId: string, password: string): Promise<void> {
    await this.prisma.user.update({ where: { id: userId }, data: { passwordHash: await hashPassword(password) } });
  }

  private async issueTokens(user: { id: string; email: string; displayName: string; role: string }) {
    const now = Math.floor(Date.now() / 1000);
    const accessToken = signAccessToken({ sub: user.id, email: user.email, displayName: user.displayName, role: user.role, jti: randomToken(), iat: now, exp: now + this.accessSeconds }, this.config.getOrThrow<string>("JWT_SECRET"));
    const refreshToken = randomToken();
    await this.prisma.refreshToken.create({ data: { userId: user.id, tokenHash: hashToken(refreshToken), expiresAt: new Date(Date.now() + this.refreshDays * 24 * 60 * 60 * 1000) } });
    return { accessToken, refreshToken, expiresIn: this.accessSeconds };
  }

  private publicUser(user: { id: string; email: string; displayName: string; role: string; tenantId?: string | null; memberships?: Array<{ tenantId: string; role: string; tenant?: { id: string; name: string; slug: string } }> }) {
    return {
      id: user.id,
      email: user.email,
      displayName: user.displayName,
      role: user.role,
      tenantId: user.tenantId,
      memberships: (user.memberships ?? []).map((membership) => ({
        tenantId: membership.tenantId,
        role: membership.role,
        tenant: membership.tenant
      }))
    };
  }
}
