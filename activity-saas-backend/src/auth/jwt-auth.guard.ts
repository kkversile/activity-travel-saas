import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { ImpersonationSessionStatus } from '@prisma/client';
import { JwtService } from '@nestjs/jwt';
import { AuthUser } from '../common/auth.types';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(private readonly jwt: JwtService, private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<{ headers: Record<string, string | undefined>; user?: AuthUser }>();
    const auth = request.headers.authorization;
    if (!auth?.startsWith('Bearer ')) throw new UnauthorizedException('Missing bearer token');
    try {
      const payload = await this.jwt.verifyAsync<AuthUser>(auth.slice(7));
      const current = await this.prisma.user.findUnique({
        where: { id: payload.sub },
        select: { id: true, email: true, fullName: true, role: true, tenantId: true, organizationRole: true, active: true, mustChangePassword: true },
      });
      if (!current?.active || current.role !== payload.role || current.tenantId !== payload.tenantId) {
        throw new UnauthorizedException('Session is no longer valid');
      }
      if (payload.isImpersonating) {
        if (!payload.impersonationSessionId || !payload.impersonatorId || payload.impersonatorId === payload.sub) throw new UnauthorizedException('Invalid impersonation session');
        const session = await this.prisma.impersonationSession.findUnique({ where: { id: payload.impersonationSessionId } });
        if (!session || session.status !== ImpersonationSessionStatus.ACTIVE || session.originalAdminId !== payload.impersonatorId || session.targetUserId !== current.id || session.expiresAt.getTime() <= Date.now()) throw new UnauthorizedException('Impersonation session is expired or revoked');
        const original = await this.prisma.user.findFirst({ where: { id: session.originalAdminId, role: 'SUPER_ADMIN', active: true }, select: { id: true, email: true } });
        if (!original) throw new UnauthorizedException('The original Super Admin session is no longer active');
      }
      request.user = { sub: current.id, email: current.email, fullName: current.fullName, role: current.role, tenantId: current.tenantId, organizationRole: current.organizationRole, active: current.active, mustChangePassword: current.mustChangePassword, isImpersonating: Boolean(payload.isImpersonating), impersonationSessionId: payload.impersonationSessionId, impersonatorId: payload.impersonatorId, impersonatorEmail: payload.impersonatorEmail };
      return true;
    } catch (error) {
      if (error instanceof UnauthorizedException) throw error;
      throw new UnauthorizedException('Invalid or expired token');
    }
  }
}
