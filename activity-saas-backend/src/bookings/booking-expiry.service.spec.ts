import { BookingExpiryService } from './booking-expiry.service';

describe('BookingExpiryService', () => {
  it('runs due expiry with a null system actor', async () => {
    const expireLocked = jest.fn().mockResolvedValue(undefined);
    const prisma: any = { booking: { findMany: jest.fn().mockResolvedValue([{ id: 'b1' }]) }, $transaction: jest.fn(async (callback: any) => callback({ $executeRawUnsafe: jest.fn(), $queryRawUnsafe: jest.fn().mockResolvedValue([{}]), booking: { findUniqueOrThrow: jest.fn().mockResolvedValue({ id: 'b1', status: 'PENDING_VENDOR_CONFIRMATION', confirmationDueAt: new Date(0) }) } })) };
    const result = await new BookingExpiryService(prisma, { expireLocked } as any).expireDue(new Date(1000));
    expect(result.expired).toBe(1); expect(expireLocked).toHaveBeenCalledWith(expect.anything(), expect.anything(), null, 'confirmation SLA expired');
  });
});
