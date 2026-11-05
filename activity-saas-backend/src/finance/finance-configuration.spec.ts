import { PaymentCollectionMode, UserRole } from '@prisma/client';
import { FinanceService } from './finance.service';

describe('FinanceService configuration persistence', () => {
  function make() {
    const current = {
      id: 'default',
      paymentCollectionMode: PaymentCollectionMode.UNCONFIGURED,
      baseCurrency: 'INR',
      gstOnCommissionPercent: '18.0000',
      tds194OPercent: null,
      gstTcsPercent: null,
      version: 4,
    };
    const tx: any = {
      $queryRawUnsafe: jest.fn().mockResolvedValue([{ id: 'default' }]),
      financeConfiguration: {
        findUnique: jest.fn().mockResolvedValue(current),
        update: jest.fn().mockImplementation(({ data }: any) => Promise.resolve({ ...current, ...data, version: 5 })),
      },
    };
    const prisma: any = { $transaction: jest.fn((callback: any) => callback(tx)) };
    const audit: any = { write: jest.fn().mockResolvedValue(undefined) };
    return { service: new FinanceService(prisma, audit, {} as any), tx, audit };
  }

  it('saves tax configuration with optimistic versioning and an audit event', async () => {
    const f = make();
    const result = await f.service.updateConfiguration(
      { sub: 'super-admin-1', role: UserRole.SUPER_ADMIN } as any,
      {
        paymentCollectionMode: PaymentCollectionMode.VOYA_COLLECTS,
        baseCurrency: 'INR',
        gstOnCommissionPercent: '18',
        tds194OPercent: '0.1',
        gstTcsPercent: '0.5',
        expectedVersion: 4,
      } as any,
    );
    expect(f.tx.financeConfiguration.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'default' },
      data: expect.objectContaining({
        gstOnCommissionPercent: expect.anything(),
        tds194OPercent: expect.anything(),
        gstTcsPercent: expect.anything(),
        version: { increment: 1 },
      }),
    }));
    expect(result.version).toBe(5);
    expect(f.audit.write).toHaveBeenCalledWith(f.tx, expect.objectContaining({
      action: 'FINANCE_CONFIGURATION_UPDATED',
    }));
  });

  it('allows clearing an optional rate without overwriting omitted settings', async () => {
    const f = make();
    await f.service.updateConfiguration(
      { sub: 'super-admin-1', role: UserRole.SUPER_ADMIN } as any,
      {
        paymentCollectionMode: PaymentCollectionMode.UNCONFIGURED,
        gstOnCommissionPercent: null,
        expectedVersion: 4,
      } as any,
    );
    const data = f.tx.financeConfiguration.update.mock.calls[0][0].data;
    expect(data.gstOnCommissionPercent).toBeNull();
    expect(data.tds194OPercent).toBeNull();
    expect(data.gstTcsPercent).toBeNull();
  });
});
