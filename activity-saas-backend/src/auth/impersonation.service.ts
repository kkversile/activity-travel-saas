import { ForbiddenException, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { ImpersonationSessionStatus, UserRole } from '@prisma/client';
import { JwtService } from '@nestjs/jwt';
import { AuditService } from '../audit/audit.service';
import { AuthUser } from '../common/auth.types';
import { PrismaService } from '../prisma/prisma.service';

const SESSION_TTL_SECONDS = 15 * 60;

@Injectable()
export class ImpersonationService {
  constructor(private readonly prisma: PrismaService, private readonly jwt: JwtService, private readonly audit: AuditService) {}

  async start(actor: AuthUser, targetUserId: string, reason?: string) {
    if (actor.role !== UserRole.SUPER_ADMIN) throw new ForbiddenException('Only a Super Admin can impersonate users');
    if (actor.sub === targetUserId) throw new ForbiddenException('Self-impersonation is not allowed');

    const target = await this.prisma.user.findUnique({
      where: { id: targetUserId },
      select: { id: true, email: true, fullName: true, role: true, tenantId: true, organizationRole: true, active: true },
    });
    if (!target) throw new NotFoundException('Target user was not found');
    if (!target.active) throw new ForbiddenException('The target user is inactive');
    if (target.role === UserRole.SUPER_ADMIN) throw new ForbiddenException('Super Admin accounts cannot be impersonated');

    const expiresAt = new Date(Date.now() + SESSION_TTL_SECONDS * 1000);
    const normalizedReason = reason?.trim() || 'Support session started by Super Admin';
    const session = await this.prisma.$transaction(async (tx) => {
      const created = await tx.impersonationSession.create({ data: { originalAdminId: actor.sub, targetUserId: target.id, reason: normalizedReason, expiresAt } });
      await this.audit.write(tx, {
        actor,
        action: 'IMPERSONATION_STARTED',
        entityType: 'User',
        entityId: target.id,
        reason: normalizedReason,
        metadata: { sessionId: created.id, targetRole: target.role },
      });
      return created;
    });

    const accessToken = await this.jwt.signAsync({
      sub: target.id,
      email: target.email,
      role: target.role,
      tenantId: target.tenantId,
      organizationRole: target.organizationRole,
      isImpersonating: true,
      impersonationSessionId: session.id,
      impersonatorId: actor.sub,
      impersonatorEmail: actor.email,
    }, { expiresIn: SESSION_TTL_SECONDS });

    return {
      accessToken,
      sessionId: session.id,
      expiresAt: session.expiresAt.toISOString(),
      user: { ...target, isImpersonating: true, impersonatorId: actor.sub, impersonatorEmail: actor.email, impersonationSessionId: session.id },
    };
  }

  async end(user: AuthUser) {
    if (!user.isImpersonating || !user.impersonationSessionId) throw new ForbiddenException('No active impersonation session');
    const session = await this.prisma.impersonationSession.findUnique({ where: { id: user.impersonationSessionId } });
    if (!session || session.originalAdminId !== user.impersonatorId || session.targetUserId !== user.sub) throw new UnauthorizedException('Invalid impersonation session');
    const endedAt = new Date();
    await this.prisma.$transaction(async (tx) => {
      await tx.impersonationSession.updateMany({ where: { id: session.id, status: ImpersonationSessionStatus.ACTIVE }, data: { status: ImpersonationSessionStatus.ENDED, endedAt } });
      await this.audit.write(tx, {
        actor: { sub: session.originalAdminId, email: user.impersonatorEmail || 'unknown', role: UserRole.SUPER_ADMIN, tenantId: null, active: true },
        action: 'IMPERSONATION_ENDED',
        entityType: 'User',
        entityId: session.targetUserId,
        metadata: { sessionId: session.id },
      });
    });
    return { ended: true, sessionId: session.id };
  }

  async history(actor: AuthUser) {
    if (actor.role !== UserRole.SUPER_ADMIN) throw new ForbiddenException('Only a Super Admin can view impersonation history');
    return this.prisma.impersonationSession.findMany({ where: { originalAdminId: actor.sub }, orderBy: { createdAt: 'desc' }, take: 100, select: { id: true, targetUserId: true, status: true, reason: true, expiresAt: true, endedAt: true, createdAt: true } });
  }
}
