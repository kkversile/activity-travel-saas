import { UserRole } from '@prisma/client';
import { AdminService } from './admin.service';

describe('AdminService commercial guardrails', () => {
  function fixture() {
    let row: any = {
      id: 'default', minimumNetMarginPercent: 4, websiteGatewayFeePercent: 1.8,
      version: 1, pendingConfiguration: null, pendingUpdatedById: null,
    };
    const tx: any = {
      $queryRaw: jest.fn(),
      commercialGuardrailConfiguration: {
        findUniqueOrThrow: jest.fn(async () => row),
        update: jest.fn(async ({ data }: any) => {
          row = { ...row, ...data, version: data.version?.increment ? row.version + data.version.increment : row.version };
          return row;
        }),
      },
    };
    const audit: any = { write: jest.fn().mockResolvedValue(undefined) };
    const prisma: any = {
      commercialGuardrailConfiguration: { findUniqueOrThrow: jest.fn(async () => row) },
      $transaction: jest.fn((callback: any) => callback(tx)),
    };
    return { service: new AdminService(prisma, audit, {} as any), tx, audit, get row() { return row; } };
  }

  it('keeps active values in place while a normal Admin submits a versioned proposal', async () => {
    const f = fixture();
    const result = await f.service.submitCommercialGuardrails(
      { sub: 'admin-1', role: UserRole.ADMIN } as any,
      { minimumNetMarginPercent: 5, websiteGatewayFeePercent: 2, expectedVersion: 1 },
    );
    expect(result.minimumNetMarginPercent).toBe(4);
    expect(f.row).toMatchObject({ minimumNetMarginPercent: 4, websiteGatewayFeePercent: 1.8, pendingConfiguration: { minimumNetMarginPercent: 5, websiteGatewayFeePercent: 2 }, pendingUpdatedById: 'admin-1' });
    expect(f.audit.write).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ action: 'COMMERCIAL_GUARDRAILS_SUBMITTED' }));
  });

  it('requires a different Super Admin to approve and atomically activate the proposal', async () => {
    const f = fixture();
    await f.service.submitCommercialGuardrails({ sub: 'admin-1', role: UserRole.ADMIN } as any, { minimumNetMarginPercent: 5, websiteGatewayFeePercent: 2, expectedVersion: 1 });
    await expect(f.service.approveCommercialGuardrails({ sub: 'admin-1', role: UserRole.SUPER_ADMIN } as any)).rejects.toThrow('different Super Admin');
    const approved = await f.service.approveCommercialGuardrails({ sub: 'super-2', role: UserRole.SUPER_ADMIN } as any);
    expect(approved).toMatchObject({ minimumNetMarginPercent: 5, websiteGatewayFeePercent: 2, version: 2 });
    expect(f.audit.write).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ action: 'COMMERCIAL_GUARDRAILS_APPROVED', beforeState: expect.objectContaining({ minimumNetMarginPercent: 4, pendingConfiguration: { minimumNetMarginPercent: 5, websiteGatewayFeePercent: 2 } }), afterState: expect.objectContaining({ minimumNetMarginPercent: 5, version: 2 }) }));
  });

  it('rejects stale versions and overlapping proposals', async () => {
    const f = fixture();
    await expect(f.service.submitCommercialGuardrails({ sub: 'admin-1', role: UserRole.ADMIN } as any, { minimumNetMarginPercent: 5, websiteGatewayFeePercent: 2, expectedVersion: 2 })).rejects.toThrow('VERSION_MISMATCH');
    await f.service.submitCommercialGuardrails({ sub: 'admin-1', role: UserRole.ADMIN } as any, { minimumNetMarginPercent: 5, websiteGatewayFeePercent: 2, expectedVersion: 1 });
    await expect(f.service.submitCommercialGuardrails({ sub: 'admin-2', role: UserRole.ADMIN } as any, { minimumNetMarginPercent: 6, websiteGatewayFeePercent: 2, expectedVersion: 1 })).rejects.toThrow('CHANGE_PENDING');
  });
});
