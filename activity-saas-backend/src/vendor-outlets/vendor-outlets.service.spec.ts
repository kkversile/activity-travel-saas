import { BadRequestException } from '@nestjs/common';
import { VendorOutletsService } from './vendor-outlets.service';

const owner = { sub: 'owner-1', tenantId: 'tenant-1', role: 'VENDOR', organizationRole: 'OWNER' } as any;

describe('VendorOutletsService bank controls', () => {
  it('stores encrypted account details, keeps new accounts pending, and returns only a mask', async () => {
    const created = { id: 'bank-1', accountNumberMasked: '•••• 6789', bankName: 'Example Bank', ifsc: 'ABCD0123456', accountHolder: 'Owner', accountType: 'CURRENT', currency: 'INR', verificationStatus: 'PENDING', active: true, createdAt: new Date() };
    const create = jest.fn().mockResolvedValue(created);
    const prisma: any = { vendorBankAccount: { create }, auditLog: { create: jest.fn().mockResolvedValue({}) } };
    const access: any = { requireOwner: jest.fn().mockResolvedValue('tenant-1') };
    const result = await new VendorOutletsService(prisma, access).createBankAccount(owner, { accountNumber: '123456789', bankName: 'Example Bank', ifsc: 'ABCD0123456', accountHolder: 'Owner', accountType: 'CURRENT' });
    expect(create.mock.calls[0][0].data.accountNumberCiphertext).not.toContain('123456789');
    expect(create.mock.calls[0][0].data.accountNumberMasked).toBe('•••• 6789');
    expect(create.mock.calls[0][0].data.verificationStatus).toBe('PENDING');
    expect(create.mock.calls[0][0].select).not.toHaveProperty('accountNumberCiphertext');
    expect(result).not.toHaveProperty('accountNumberCiphertext');
    expect(JSON.stringify(prisma.auditLog.create.mock.calls[0][0])).not.toContain('123456789');
  });

  it('rejects outlet bank assignment to an unverified or cross-vendor account', async () => {
    const prisma: any = {
      vendorOutlet: { findFirst: jest.fn().mockResolvedValue({ id: 'outlet-1' }) },
      vendorBankAccount: { findFirst: jest.fn().mockResolvedValue(null) },
    };
    const access: any = { requireOwner: jest.fn().mockResolvedValue('tenant-1') };
    await expect(new VendorOutletsService(prisma, access).assignBank(owner, 'outlet-1', { bankAccountId: 'bank-other' })).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.vendorOutlet.update).toBeUndefined();
  });
});
