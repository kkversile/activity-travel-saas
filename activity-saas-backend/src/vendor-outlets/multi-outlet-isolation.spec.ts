import { NotFoundException } from '@nestjs/common';
import { VendorOutletAccessService } from './vendor-outlet-access.service';
import { ResourcesService } from '../resources/resources.service';
import { CommercialService } from '../commercial/commercial.service';
import { FilesService } from '../files/files.service';
import { VendorReviewsService } from '../vendor-reviews/vendor-reviews.service';
import { FinanceService } from '../finance/finance.service';
import { vendorPayoutPublicCode } from '../common/public-identifiers';
import { RequestContextService } from '../common/request-context.service';
import { FulfilmentService } from '../fulfilment/fulfilment.service';

const employee: any = { sub: 'a', tenantId: 'vendor', role: 'VENDOR', organizationRole: 'CATALOGUE' };
const access = () => new VendorOutletAccessService({ userOutletAccess: { findMany: jest.fn().mockResolvedValue([{ outletId: 'A' }]) } } as any);

describe('outlet isolation across exposed secondary paths', () => {
  it('rejects an authorized object when it differs from the explicitly selected outlet', async () => {
    const context = new RequestContextService();
    const selected = '11111111-1111-4111-a111-111111111111';
    const other = '22222222-2222-4222-a222-222222222222';
    const service = new VendorOutletAccessService({ userOutletAccess: { findMany: jest.fn().mockResolvedValue([{ outletId: selected }, { outletId: other }]) } } as any, context);
    await expect(context.run('correlation', () => service.resolve(employee, other), selected)).rejects.toBeInstanceOf(NotFoundException);
    await expect(context.run('correlation', () => service.resolve(employee, selected), selected)).resolves.toMatchObject({ outletIds: [selected] });
  });
  it('rejects guessed resource scope before executing its list query', async () => {
    const prisma: any = { resource: { findMany: jest.fn() } };
    const service = new ResourcesService(prisma, {} as any, {} as any, access());
    await expect(service.list(employee, 'B')).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.resource.findMany).not.toHaveBeenCalled();
  });

  it('filters resource reads using the single authorized assignment', async () => {
    const findMany = jest.fn().mockResolvedValue([]);
    await new ResourcesService({ resource: { findMany } } as any, {} as any, {} as any, access()).list(employee);
    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { tenantId: 'vendor', outletId: { in: ['A'] } } }));
  });

  it.each(['getRatePlanCommercial', 'createVersion', 'updateVersion', 'activateVersion'])('rejects B through the commercial %s endpoint', async (method) => {
    const prisma: any = {
      ratePlan: { findFirst: jest.fn().mockResolvedValue({ variant: { product: { outletId: 'B' } } }) },
      ratePlanCommercialVersion: { findFirst: jest.fn().mockResolvedValue({ ratePlanId: 'rate-b' }) },
      $transaction: jest.fn(),
    };
    const service = new CommercialService(prisma, {} as any, {} as any, {} as any, access());
    await expect((service as any)[method](employee, 'guessed-b', {})).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it.each(['BOOKING_VOUCHER', 'FULFILMENT_DOCUMENT', 'OTHER'])('prevents storage access for B private %s', async (purpose) => {
    const booking = { vendorTenantId: 'vendor', outletId: 'B' };
    const prisma: any = {
      fileAsset: { findUnique: jest.fn().mockResolvedValue({ id: 'file-b', visibility: 'PRIVATE', purpose, entityType: purpose === 'BOOKING_VOUCHER' ? 'VoucherVersion' : purpose === 'OTHER' ? 'ProductRateProof' : 'FulfilmentEvidence', entityId: 'b', storageKey: 'private/b' }) },
      voucherVersion: { findUnique: jest.fn().mockResolvedValue({ booking }) },
      fulfilmentEvidence: { findUnique: jest.fn().mockResolvedValue({ fulfilment: { booking } }) },
      productRevision: { findFirst: jest.fn().mockResolvedValue({ product: { outletId: 'B' } }) },
    };
    const storage: any = { read: jest.fn() };
    await expect(new FilesService(prisma, storage, access()).content(employee, 'file-b')).rejects.toBeInstanceOf(NotFoundException);
    expect(storage.read).not.toHaveBeenCalled();
  });

  it('rejects replying to a review owned by B', async () => {
    const update = jest.fn();
    const tx = { vendorReview: { findFirst: jest.fn().mockResolvedValue({ product: { outletId: 'B' } }), update } };
    const prisma: any = { $transaction: (fn: any) => fn(tx) };
    await expect(new VendorReviewsService(prisma, {} as any, access()).reply(employee, 'b', 'Reply')).rejects.toBeInstanceOf(NotFoundException);
    expect(update).not.toHaveBeenCalled();
  });

  it('rejects B evidence writes before acquiring locks or replacing evidence', async () => {
    const lock = jest.fn();
    const tx = { $queryRaw: lock, bookingFulfilment: { findUnique: jest.fn().mockResolvedValue({ id: 'fulfilment-b', booking: { vendorTenantId: 'vendor', outletId: 'B', status: 'CONFIRMED' } }) } };
    const prisma: any = { $transaction: (work: any) => work(tx) };
    const service = new FulfilmentService(prisma, {} as any, {} as any, {} as any, {} as any, {} as any, access());
    await expect(service.addReference(employee, 'booking-b', 'PNR_REFERENCE', { referenceValue: 'UNAUTHORIZED' })).rejects.toBeInstanceOf(NotFoundException);
    expect(lock).not.toHaveBeenCalled();
  });

  it('allows existing obligations at an inactive assigned outlet while blocking new sales', async () => {
    const findMany = jest.fn(({ where }) => Promise.resolve(where.outlet?.status ? [] : [{ outletId: 'A' }]));
    const service = new VendorOutletAccessService({ userOutletAccess: { findMany } } as any);
    await expect(service.resolve(employee, 'A', { mutation: true })).rejects.toThrow();
    await expect(service.resolve(employee, 'A', { mutation: true, existingObligation: true })).resolves.toMatchObject({ outletIds: ['A'] });
  });

  it('validates the snapshotted bank, even if the outlet now selects another bank', async () => {
    const service: any = new FinanceService({} as any, {} as any, {} as any);
    const tx: any = { $queryRawUnsafe: jest.fn(), vendorBankAccount: { findFirst: jest.fn().mockResolvedValue(null) } };
    await expect(service.payoutReleaseAmounts(tx, { outletId: 'A', bankAccountId: 'original', beneficiarySnapshot: { bankAccountId: 'original' }, tenantId: 'vendor', currency: 'INR' })).rejects.toThrow('PAYOUT_BLOCKED_BANK_ACCOUNT_NOT_VERIFIED');
    expect(tx.vendorBankAccount.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ id: 'original', tenantId: 'vendor', verificationStatus: 'VERIFIED', active: true, currency: 'INR' }) }));
  });

  it('keeps distinct outlet payout public codes distinct beyond eight characters', () => {
    const now = new Date('2026-11-17');
    expect(vendorPayoutPublicCode('SUP-1234', now, 'NORTH-EAST')).not.toEqual(vendorPayoutPublicCode('SUP-1234', now, 'NORTHEAST'));
    expect(vendorPayoutPublicCode('SUP-1234', now, 'LONGOUTLET-A')).not.toEqual(vendorPayoutPublicCode('SUP-1234', now, 'LONGOUTLET-B'));
  });
});
