import { OutboxService, OUTBOX_DELIVERY_LEASE_MS } from './outbox.service';

describe('Outbox delivery leases', () => {
  it('leases only explicitly selected delivery types while preserving claim atomicity', async () => {
    const old = { id: 'booking', eventType: 'BOOKING_CONFIRMED', availableAt: new Date(0), attemptCount: 0 };
    const review = { ...old, id: 'review', eventType: 'PRODUCT_REVIEW_EMAIL_REQUESTED' };
    const tx: any = { outboxEvent: { findMany: jest.fn().mockResolvedValue([old, review, { ...review, id: 'waiting-review' }]), updateMany: jest.fn().mockResolvedValue({ count: 1 }) } };
    const service = new OutboxService({ $transaction: (work: any) => work(tx) } as any);
    const started = Date.now(); const claimed = await service.claimPending(25, [old.eventType, review.eventType], [review.eventType]);
    expect(claimed.map((event) => event.id)).toEqual(['review', 'booking']);
    expect(claimed[1].availableAt).toEqual(new Date(0));
    expect(claimed[0].availableAt.getTime()).toBeGreaterThanOrEqual(started + OUTBOX_DELIVERY_LEASE_MS);
    expect(tx.outboxEvent.updateMany).toHaveBeenCalledTimes(2);
    expect(tx.outboxEvent.updateMany.mock.calls[1][0]).toMatchObject({ where: { id: 'review', status: 'PENDING' }, data: { status: 'PROCESSING', attemptCount: { increment: 1 }, availableAt: expect.any(Date) } });
    tx.outboxEvent.updateMany.mockResolvedValue({ count: 0 }); expect(await service.claimPending(25, [review.eventType], [review.eventType])).toEqual([]);
  });
  it('requeues only expired processing leases for explicit event types', async () => {
    const updateMany=jest.fn().mockResolvedValue({ count: 1 }); const service=new OutboxService({ outboxEvent: { updateMany } } as any);
    await service.requeueExpiredProcessing(['PRODUCT_REVIEW_EMAIL_REQUESTED']);
    expect(updateMany).toHaveBeenCalledWith({ where: { status: 'PROCESSING', eventType: { in: ['PRODUCT_REVIEW_EMAIL_REQUESTED'] }, availableAt: { lte: expect.any(Date) }, attemptCount: { gte: 5 } }, data: { status: 'FAILED', lastError: 'Delivery lease expired after five attempts' } });
    expect(updateMany).toHaveBeenCalledWith({ where: { status: 'PROCESSING', eventType: { in: ['PRODUCT_REVIEW_EMAIL_REQUESTED'] }, availableAt: { lte: expect.any(Date) }, attemptCount: { lt: 5 } }, data: { status: 'PENDING' } });
    expect(() => service.requeueExpiredProcessing([])).toThrow('Explicit leased event types');
  });
});
