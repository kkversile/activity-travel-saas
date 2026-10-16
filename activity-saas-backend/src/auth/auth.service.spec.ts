import { EmailAuthChallengePurpose, UserRole } from '@prisma/client';
import { hashOtp } from '../common/secret-crypto';
import { AuthService } from './auth.service';

describe('email-first vendor access', () => {
  function make() {
    const challenge: any = {
      id: 'challenge-1', email: 'new-vendor@example.com', purpose: EmailAuthChallengePurpose.ACTIVATE_VENDOR,
      codeHash: '', verificationTokenHash: null, expiresAt: new Date(Date.now() + 60_000), attempts: 0,
      verifiedAt: null, consumedAt: null, createdAt: new Date(), updatedAt: new Date(),
    };
    const user = { id: 'user-1', email: challenge.email, fullName: 'New Vendor', role: UserRole.VENDOR, tenantId: 'tenant-1', organizationRole: 'OWNER', active: true };
    const tx = {
      emailAuthChallenge: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
      tenant: { create: jest.fn().mockResolvedValue({ id: 'tenant-1' }) },
      user: { create: jest.fn().mockResolvedValue(user), update: jest.fn().mockResolvedValue(user) },
      vendorProfile: { create: jest.fn().mockResolvedValue({ id: 'profile-1' }) },
    };
    const prisma = {
      user: { findUnique: jest.fn().mockResolvedValue(null) },
      emailAuthChallenge: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue(challenge),
        update: jest.fn().mockResolvedValue(challenge),
      },
      $transaction: jest.fn((callback: (client: typeof tx) => unknown) => callback(tx)),
    } as any;
    const jwt = { signAsync: jest.fn().mockResolvedValue('access-token') } as any;
    return { service: new AuthService(prisma, jwt), prisma, challenge, tx, user };
  }

  it('requests and verifies a demo email code without exposing account existence', async () => {
    const { service, prisma, challenge } = make();
    const requested = await service.requestVendorEmailCode(challenge.email);
    expect(requested.message).toContain('verification code');
    expect(requested.demoOtp).toBeDefined();
    expect(prisma.emailAuthChallenge.create).toHaveBeenCalled();

    const stored = prisma.emailAuthChallenge.create.mock.calls[0][0].data;
    challenge.codeHash = stored.codeHash;
    prisma.emailAuthChallenge.findFirst.mockResolvedValue(challenge);
    const verified = await service.verifyVendorEmailCode(challenge.email, requested.demoOtp!);

    expect(verified.setupToken).toHaveLength(43);
    expect(prisma.emailAuthChallenge.update).toHaveBeenCalledWith(expect.objectContaining({ where: { id: challenge.id } }));
  });

  it('creates a vendor tenant and signs the user in after first-time password setup', async () => {
    const { service, prisma, tx, user, challenge } = make();
    challenge.verifiedAt = new Date();
    challenge.verificationTokenHash = hashOtp('verified-token');
    prisma.emailAuthChallenge.findFirst.mockResolvedValue(challenge);

    const result = await service.setVendorPassword({ setupToken: 'verified-token', password: 'secure-password' });

    expect(tx.tenant.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ kind: 'VENDOR' }) }));
    expect(tx.user.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ role: 'VENDOR', email: challenge.email }) }));
    expect(result).toMatchObject({ accessToken: 'access-token', user: { id: user.id, role: UserRole.VENDOR } });
  });
});
