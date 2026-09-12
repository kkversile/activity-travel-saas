import { BookingFulfilmentStatus, BookingStatus, VoucherGenerationStatus } from '@prisma/client';
import { VoucherGenerationService } from './voucher-generation.service';

describe('Voucher generation concurrency behavior', () => {
  function serviceWith(tx: any) { return new VoucherGenerationService({ $transaction: jest.fn((callback: any) => callback(tx)) } as any, {} as any, { write: jest.fn() } as any, { enqueue: jest.fn() } as any, {} as any); }
  it('rejects an old token after a lease reclaim', async () => {
    const tx: any = { $queryRaw: jest.fn(), bookingFulfilment: { findUnique: jest.fn().mockResolvedValue({ id: 'f1', status: BookingFulfilmentStatus.READY_FOR_VOUCHER, generationStatus: VoucherGenerationStatus.PROCESSING, generationToken: 'token-B', version: 3, booking: { status: BookingStatus.CONFIRMED } }) } };
    const result = await (serviceWith(tx) as any).finalize('f1', 'token-A', 2, {}, { storageKey: 'old.pdf', sizeBytes: 1 });
    expect(result).toEqual({ stale: true, status: 'STALE_GENERATION' });
  });
  it('cannot mark a newer generation failed with an old token', async () => {
    const updateMany = jest.fn().mockResolvedValue({ count: 0 }); const audit = { write: jest.fn() }; const outbox = { enqueue: jest.fn() }; const tx: any = { bookingFulfilment: { updateMany }, $queryRaw: jest.fn() };
    const service = new VoucherGenerationService({ $transaction: jest.fn((callback: any) => callback(tx)) } as any, {} as any, audit as any, outbox as any, {} as any);
    await (service as any).markFailed('f1', 'token-A', 2, 'old failure');
    expect(updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ generationToken: 'token-A', version: 2 }) })); expect(audit.write).not.toHaveBeenCalled(); expect(outbox.enqueue).not.toHaveBeenCalled();
  });
});
