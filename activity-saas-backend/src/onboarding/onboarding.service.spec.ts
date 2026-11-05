import { ServiceUnavailableException } from '@nestjs/common';
import { UserRole, VendorDocumentType, VendorOnboardingStatus } from '@prisma/client';
import { hashOtp } from '../common/secret-crypto';
import { OnboardingService } from './onboarding.service';

describe('OnboardingService.save licence expiry persistence', () => {
  it('persists the customer-facing business display name to the vendor profile', async () => {
    const app = { id: 'application-brand', tenantId: 'tenant-brand', status: VendorOnboardingStatus.DRAFT, currentStep: 1, startedAt: null, agreementSentAt: null, contactNumber: '' };
    const profileUpdate = jest.fn().mockResolvedValue({});
    const tx = {
      vendorOnboardingApplication: { update: jest.fn().mockResolvedValue({ ...app, businessDisplayName: 'Sunrise Experiences' }) },
      vendorDocument: { findUnique: jest.fn() },
      vendorDocumentVersion: { update: jest.fn() },
      vendorProfile: { update: profileUpdate },
      user: { update: jest.fn() },
    };
    const prisma = {
      vendorOnboardingApplication: {
        findUnique: jest.fn().mockResolvedValueOnce(app).mockResolvedValueOnce({ signatureData: null }),
        findMany: jest.fn(),
      },
      vendorDocument: { findMany: jest.fn().mockResolvedValue([]) },
      $transaction: jest.fn(async (callback: (client: typeof tx) => Promise<unknown>) => callback(tx)),
    };
    const service = new OnboardingService(prisma as any, {} as any, {} as any, {} as any);

    await service.save({ role: UserRole.VENDOR, tenantId: 'tenant-brand', sub: 'user-brand' } as any, { businessDisplayName: '  Sunrise Experiences  ' });

    expect(profileUpdate).toHaveBeenCalledWith({ where: { tenantId: 'tenant-brand' }, data: { displayName: 'Sunrise Experiences' } });
  });

  it('stores the inclusive UTC expiry on the latest document version in the same transaction', async () => {
    const app = {
      id: 'application-1',
      tenantId: 'tenant-1',
      status: VendorOnboardingStatus.DRAFT,
      currentStep: 2,
      startedAt: null,
      agreementSentAt: null,
      contactNumber: '',
    };
    const latestVersionUpdate = jest.fn().mockResolvedValue({});
    const tx = {
      vendorOnboardingApplication: {
        update: jest.fn().mockResolvedValue({ ...app, supplementalData: {} }),
      },
      vendorDocument: {
        findUnique: jest.fn().mockResolvedValue({ id: 'document-1', versions: [{ id: 'version-4' }] }),
      },
      vendorDocumentVersion: { update: latestVersionUpdate },
      vendorProfile: { update: jest.fn() },
      user: { update: jest.fn() },
    };
    const prisma = {
      vendorOnboardingApplication: {
        findUnique: jest.fn()
          .mockResolvedValueOnce(app)
          .mockResolvedValueOnce({ signatureData: null }),
        update: jest.fn(),
        findMany: jest.fn(),
      },
      vendorDocument: { findMany: jest.fn().mockResolvedValue([]) },
      $transaction: jest.fn(async (callback: (client: typeof tx) => Promise<unknown>) => callback(tx)),
    };
    const service = new OnboardingService(prisma as any, {} as any, {} as any, {} as any);
    const user = { role: UserRole.VENDOR, tenantId: 'tenant-1', sub: 'user-1', email: 'vendor@example.test' } as any;

    await service.save(user, {
      supplementalData: {
        licences: [{ documentType: VendorDocumentType.PUBLIC_LIABILITY_INSURANCE, validTill: '2027-04-30' }],
      },
    });

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(tx.vendorDocument.findUnique).toHaveBeenCalledWith({
      where: { tenantId_type: { tenantId: 'tenant-1', type: VendorDocumentType.PUBLIC_LIABILITY_INSURANCE } },
      select: { id: true, versions: { orderBy: { versionNumber: 'desc' }, take: 1, select: { id: true } } },
    });
    expect(latestVersionUpdate).toHaveBeenCalledWith({
      where: { id: 'version-4' },
      data: { expiresAt: new Date('2027-04-30T23:59:59.999Z') },
    });
  });

  it('derives the government annexure agreement from the saved supplier type', async () => {
    const app = { id: 'application-1', tenantId: 'tenant-1', status: VendorOnboardingStatus.DRAFT, currentStep: 1, startedAt: null, agreementSentAt: null, contactNumber: '' };
    const txUpdate = jest.fn().mockImplementation(({ data }) => Promise.resolve({ ...app, supplementalData: data.supplementalData }));
    const tx = {
      vendorOnboardingApplication: { update: txUpdate },
      vendorDocument: { findUnique: jest.fn() },
      vendorDocumentVersion: { update: jest.fn() },
      vendorProfile: { update: jest.fn() },
      user: { update: jest.fn() },
    };
    const prisma = {
      vendorOnboardingApplication: {
        findUnique: jest.fn().mockResolvedValueOnce(app).mockResolvedValueOnce({ signatureData: null }),
        findMany: jest.fn(),
      },
      vendorDocument: { findMany: jest.fn().mockResolvedValue([]) },
      $transaction: jest.fn(async (callback: (client: typeof tx) => Promise<unknown>) => callback(tx)),
    };
    const service = new OnboardingService(prisma as any, {} as any, {} as any, {} as any);
    await service.save({ role: UserRole.VENDOR, tenantId: 'tenant-1', sub: 'user-1' } as any, {
      supplementalData: { supplierType: 'Government body', agreementName: 'Activity Vendor Agreement' },
    });
    expect(txUpdate.mock.calls[0][0].data.supplementalData).toMatchObject({
      supplierType: 'Government body',
      agreementName: 'Activity Vendor Agreement (Govt annexure)',
    });
  });
});

describe('OnboardingService.requestOtp delivery safeguards', () => {
  const originalNodeEnv = process.env.NODE_ENV;
  const originalConfiguredOtp = process.env.ONBOARDING_PHONE_OTP;
  afterEach(() => {
    if (originalNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = originalNodeEnv;
    if (originalConfiguredOtp === undefined) delete process.env.ONBOARDING_PHONE_OTP;
    else process.env.ONBOARDING_PHONE_OTP = originalConfiguredOtp;
  });

  function setup() {
    const application = { id: 'application-1', tenantId: 'tenant-1', status: VendorOnboardingStatus.DRAFT, otpRequestedAt: null };
    const update = jest.fn().mockResolvedValue({ otpExpiresAt: new Date('2026-11-04T12:10:00Z') });
    const prisma = { vendorOnboardingApplication: { findUnique: jest.fn().mockResolvedValue(application), update } };
    return { service: new OnboardingService(prisma as any, {} as any, {} as any, {} as any), update };
  }

  const user = { role: UserRole.VENDOR, tenantId: 'tenant-1', sub: 'user-1' } as any;

  it('uses a random six-digit demo code in non-production and persists only its hash', async () => {
    process.env.NODE_ENV = 'test';
    delete process.env.ONBOARDING_PHONE_OTP;
    const { service, update } = setup();

    const result = await service.requestOtp(user, '+919876543210');

    expect(result.demoOtp).toMatch(/^\d{6}$/);
    expect(result.demoOtp).not.toBe('123456');
    expect(update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ otpHash: hashOtp(result.demoOtp!), contactNumber: '+919876543210' }),
    }));
  });

  it('fails closed in production until SMS delivery is configured', async () => {
    process.env.NODE_ENV = 'production';
    const { service, update } = setup();

    await expect(service.requestOtp(user, '+919876543210')).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(update).not.toHaveBeenCalled();
  });
});
