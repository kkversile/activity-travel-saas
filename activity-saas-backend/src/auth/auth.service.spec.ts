import { EmailAuthChallengePurpose, OrganizationRole, UserRole } from '@prisma/client';
import { hash } from 'bcryptjs';
import { hashOtp } from '../common/secret-crypto';
import { AuthService } from './auth.service';

describe('email-first vendor access', () => {
  it('accepts a single-use team invitation and attaches the user to the existing vendor tenant', async () => {
    const token = 'A'.repeat(43);
    const invitedUser = { id: 'member-1', email: 'ops@example.com', fullName: 'Operations Member', role: UserRole.VENDOR, tenantId: 'tenant-existing', organizationRole: OrganizationRole.OPERATIONS, active: true, mustChangePassword: false };
    const invitation = { id: 'invite-1', tenantId: 'tenant-existing', email: 'ops@example.com', role: OrganizationRole.OPERATIONS, status: 'INVITED', expiresAt: new Date(Date.now() + 60_000) };
    const tx: any = {
      $queryRawUnsafe: jest.fn().mockResolvedValue([{ id: 'invite-1' }]),
      vendorTeamInvitation: { findFirst: jest.fn().mockResolvedValue(invitation), update: jest.fn().mockResolvedValue({}) },
      user: { create: jest.fn().mockResolvedValue(invitedUser) },
      publicIdentifierSequence: { upsert: jest.fn().mockResolvedValue({ lastValue: 2 }) },
    };
    const prisma: any = { user: { findUnique: jest.fn().mockResolvedValue(null) }, $transaction: jest.fn((callback: (client: any) => unknown) => callback(tx)) };
    const jwt = { signAsync: jest.fn().mockResolvedValue('member-token') } as any;
    const service = new AuthService(prisma, jwt);

    const result = await service.register({ fullName: 'Operations Member', email: 'ops@example.com', password: 'secure1234', acceptedTerms: true, teamInviteToken: token } as any);

    expect(tx.user.create).toHaveBeenCalledWith({ data: expect.objectContaining({ tenantId: 'tenant-existing', email: 'ops@example.com', organizationRole: OrganizationRole.OPERATIONS, role: UserRole.VENDOR }) });
    expect(tx.vendorTeamInvitation.update).toHaveBeenCalledWith({ where: { id: 'invite-1' }, data: { status: 'ACCEPTED', acceptedAt: expect.any(Date), tokenHash: null } });
    expect(tx.tenant).toBeUndefined();
    expect(result).toMatchObject({ accessToken: 'member-token', user: { tenantId: 'tenant-existing', organizationRole: OrganizationRole.OPERATIONS } });
  });

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
      vendorTrustedDevice: { create: jest.fn().mockResolvedValue({ id: 'trusted-device-1' }), upsert: jest.fn().mockResolvedValue({ id: 'trusted-device-1' }), deleteMany: jest.fn().mockResolvedValue({ count: 0 }) },
      vendorProfile: { create: jest.fn().mockResolvedValue({ id: 'profile-1' }) },
      publicIdentifierSequence: { upsert: jest.fn().mockResolvedValue({ lastValue: 1 }) },
    };
    const prisma = {
      user: { findUnique: jest.fn().mockResolvedValue(null), findFirst: jest.fn().mockResolvedValue(null), update: jest.fn().mockResolvedValue(null) },
      vendorOnboardingApplication: { findMany: jest.fn().mockResolvedValue([]) },
      globalSetting: { findFirst: jest.fn().mockResolvedValue(null) },
      vendorTrustedDevice: { findFirst: jest.fn().mockResolvedValue(null), update: jest.fn().mockResolvedValue({}), deleteMany: jest.fn().mockResolvedValue({ count: 0 }) },
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

  it('signs a vendor in immediately with valid password credentials on a new device', async () => {
    const { service, prisma, challenge, user } = make();
    const { hash } = await import('bcryptjs');
    prisma.user.findUnique.mockResolvedValue({ ...user, passwordHash: await hash('correct-password', 4) });
    const result = await service.login({ email: user.email, password: 'correct-password', deviceToken: 'device-token-123456789012345678901234' } as any);
    expect(result).toMatchObject({ accessToken: 'access-token', user: { id: user.id, role: UserRole.VENDOR } });
    expect(prisma.emailAuthChallenge.create).not.toHaveBeenCalled();
    expect(prisma.user.update).toHaveBeenCalledWith({ where: { id: user.id }, data: { lastLoginAt: expect.any(Date) } });
  });

  it('resolves a verified vendor mobile number to its owner account for password login', async () => {
    const { service, prisma, user } = make();
    const { hash } = await import('bcryptjs');
    const owner = { ...user, passwordHash: await hash('correct-password', 4) };
    prisma.vendorOnboardingApplication.findMany.mockResolvedValue([{ tenantId: user.tenantId }]);
    prisma.user.findFirst.mockResolvedValue(owner);

    const result = await service.login({ email: '98765 43210', password: 'correct-password' } as any);

    expect(prisma.vendorOnboardingApplication.findMany).toHaveBeenCalledWith({
      where: { contactNumber: '+919876543210', phoneVerifiedAt: { not: null } },
      select: { tenantId: true },
      take: 2,
    });
    expect(prisma.user.findFirst).toHaveBeenCalledWith({
      where: { tenantId: user.tenantId, role: UserRole.VENDOR, organizationRole: OrganizationRole.OWNER },
    });
    expect(result).toMatchObject({ accessToken: 'access-token', user: { id: owner.id, role: UserRole.VENDOR } });
  });

  it('rejects a mobile number shared by multiple verified vendor applications', async () => {
    const { service, prisma } = make();
    prisma.vendorOnboardingApplication.findMany.mockResolvedValue([{ tenantId: 'tenant-1' }, { tenantId: 'tenant-2' }]);

    await expect(service.login({ email: '+919876543210', password: 'correct-password' } as any)).rejects.toThrow('Invalid email/mobile or password');
    expect(prisma.user.findFirst).not.toHaveBeenCalled();
  });

  it('requests a passwordless vendor login code through a rate-limited login challenge', async () => {
    const { service, prisma, challenge, user } = make();
    prisma.user.findUnique.mockResolvedValue(user);
    prisma.emailAuthChallenge.create.mockResolvedValue({ ...challenge, id: 'passwordless-challenge' });
    jest.spyOn(service as any, 'deliverVendorEmailCode').mockResolvedValue(undefined);

    const result = await service.requestVendorLoginCode(user.email);

    expect(result).toMatchObject({ challengeId: 'passwordless-challenge', demoOtp: expect.any(String) });
    expect(prisma.emailAuthChallenge.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ email: user.email, purpose: EmailAuthChallengePurpose.LOGIN_VENDOR, codeHash: expect.any(String) }),
    }));
  });

  it('does not disclose whether an email belongs to a vendor for passwordless login', async () => {
    const { service, prisma, challenge } = make();

    const result = await service.requestVendorLoginCode(challenge.email);

    expect(result).toMatchObject({ challengeId: expect.stringMatching(/^[a-f0-9]{32}$/), message: expect.stringContaining('If this email can access a vendor account') });
    expect(prisma.emailAuthChallenge.create).not.toHaveBeenCalled();
  });

  it('trusts the device and issues a session only after consuming a valid sign-in code', async () => {
    const { service, prisma, challenge, tx, user } = make();
    challenge.purpose = EmailAuthChallengePurpose.LOGIN_VENDOR;
    challenge.codeHash = hashOtp('123456');
    prisma.emailAuthChallenge.findFirst.mockResolvedValue(challenge);
    prisma.user.findUnique.mockResolvedValue(user);
    const result = await service.verifyVendorLoginCode(challenge.id, '123456', 'device-token-123456789012345678901234');
    expect(tx.emailAuthChallenge.updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ id: challenge.id, purpose: EmailAuthChallengePurpose.LOGIN_VENDOR }) }));
    expect(tx.vendorTrustedDevice.upsert).toHaveBeenCalledWith(expect.objectContaining({
      where: { tokenHash: hashOtp('device-token-123456789012345678901234') },
      create: expect.objectContaining({ userId: user.id, tokenHash: hashOtp('device-token-123456789012345678901234') }),
      update: expect.objectContaining({ userId: user.id }),
    }));
    expect(result).toMatchObject({ accessToken: 'access-token', user: { id: user.id } });
  });

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

  it('sends an activation code for an Admin-created vendor who has not set their password', async () => {
    const { service, prisma, challenge } = make();
    prisma.user.findUnique.mockResolvedValue({ role: UserRole.VENDOR, mustChangePassword: true });
    await service.requestVendorEmailCode(challenge.email);
    expect(prisma.emailAuthChallenge.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ purpose: EmailAuthChallengePurpose.ACTIVATE_VENDOR }) }));
  });

  it('sets the password on the existing Admin-created vendor account after activation', async () => {
    const { service, prisma, challenge, tx } = make();
    challenge.verifiedAt = new Date();
    challenge.verificationTokenHash = hashOtp('setup-token');
    prisma.emailAuthChallenge.findFirst.mockResolvedValue(challenge);
    prisma.user.findUnique.mockResolvedValue({ id: 'user-1', email: challenge.email, role: UserRole.VENDOR, active: true, mustChangePassword: true });

    await service.setVendorPassword({ setupToken: 'setup-token', password: 'secure-password' });

    expect(tx.user.update).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'user-1' }, data: expect.objectContaining({ active: true, mustChangePassword: false, passwordHash: expect.any(String) }) }));
    expect(tx.user.create).not.toHaveBeenCalled();
    expect(tx.tenant.create).not.toHaveBeenCalled();
  });

  it('creates a vendor tenant and signs the user in after first-time password setup', async () => {
    const { service, prisma, tx, user, challenge } = make();
    challenge.verifiedAt = new Date();
    challenge.verificationTokenHash = hashOtp('verified-token');
    prisma.emailAuthChallenge.findFirst.mockResolvedValue(challenge);

    const result = await service.setVendorPassword({ setupToken: 'verified-token', password: 'secure-password' });

    expect(tx.tenant.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ kind: 'VENDOR' }) }));
    expect(tx.user.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ role: 'VENDOR', email: challenge.email }) }));
    expect(tx.vendorProfile.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ legalBusinessName: '', voucherShortCode: 'AAA' }) }));
    expect(result).toMatchObject({ accessToken: 'access-token', user: { id: user.id, role: UserRole.VENDOR } });
  });

  it('changes a password when the current password and confirmation are valid', async () => {
    const { service, prisma } = make();
    prisma.user.findUnique.mockResolvedValue({ id: 'user-1', passwordHash: await hash('old-password', 4), active: true });
    prisma.user.update.mockResolvedValue({});

    await expect(service.changePassword({ sub: 'user-1' }, {
      currentPassword: 'old-password',
      newPassword: 'new-password',
      confirmPassword: 'new-password',
    })).resolves.toEqual({ message: 'Password changed successfully' });
    expect(prisma.user.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'user-1' },
      data: expect.objectContaining({ passwordHash: expect.any(String), mustChangePassword: false }),
    }));
  });

  it('rejects a password change when confirmation does not match', async () => {
    const { service, prisma } = make();

    await expect(service.changePassword({ sub: 'user-1' }, {
      currentPassword: 'old-password',
      newPassword: 'new-password',
      confirmPassword: 'different-password',
    })).rejects.toThrow('New password and confirmation do not match');
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
  });
});
