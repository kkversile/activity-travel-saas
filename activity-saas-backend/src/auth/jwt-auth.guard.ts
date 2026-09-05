import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
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
        select: { id: true, email: true, fullName: true, role: true, tenantId: true, active: true },
      });
      if (!current?.active || current.role !== payload.role || current.tenantId !== payload.tenantId) {
        throw new UnauthorizedException('Session is no longer valid');
      }
      request.user = { sub: current.id, email: current.email, fullName: current.fullName, role: current.role, tenantId: current.tenantId };
      return true;
    } catch (error) {
      if (error instanceof UnauthorizedException) throw error;
      throw new UnauthorizedException('Invalid or expired token');
    }
  }
}
