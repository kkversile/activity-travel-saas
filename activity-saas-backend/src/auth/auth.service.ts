import { ConflictException, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { compare } from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service';
import { LoginDto } from './login.dto';
import { RegisterDto } from './register.dto';

@Injectable()
export class AuthService {
  constructor(private readonly prisma: PrismaService, private readonly jwt: JwtService) {}

  async login(dto: LoginDto) {
    const user = await this.prisma.user.findUnique({ where: { email: dto.email.toLowerCase() } });
    if (!user || !user.active || !(await compare(dto.password, user.passwordHash))) {
      throw new UnauthorizedException('Invalid email or password');
    }

    const payload = { sub: user.id, email: user.email, role: user.role, tenantId: user.tenantId };
    return {
      accessToken: await this.jwt.signAsync(payload),
      user: { id: user.id, email: user.email, fullName: user.fullName, role: user.role, tenantId: user.tenantId },
    };
  }

  async register(dto: RegisterDto) {
    const email = dto.email.toLowerCase();
    if (await this.prisma.user.findUnique({ where: { email } })) throw new ConflictException('An account with this email already exists');
    const slugBase = email.split('@')[0].replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'vendor';
    const slug = `${slugBase}-${Date.now().toString().slice(-6)}`;
    const passwordHash = await import('bcryptjs').then(({ hash }) => hash(dto.password, 10));
    const created = await this.prisma.$transaction(async (tx) => {
      const tenant = await tx.tenant.create({ data: { name: `${dto.fullName} Vendor`, slug, kind: 'VENDOR' } });
      const user = await tx.user.create({ data: { tenantId: tenant.id, email, passwordHash, fullName: dto.fullName, role: 'VENDOR' } });
      await tx.vendorProfile.create({ data: { tenantId: tenant.id, legalBusinessName: dto.fullName, operatingCity: 'Not set', operatingRegion: 'Not set', documentStatus: {} } });
      return user;
    });
    const payload = { sub: created.id, email: created.email, role: created.role, tenantId: created.tenantId };
    return { accessToken: await this.jwt.signAsync(payload), user: { id: created.id, email: created.email, fullName: created.fullName, role: created.role, tenantId: created.tenantId } };
  }
}
