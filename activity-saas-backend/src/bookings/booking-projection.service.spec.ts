import { BookingProjectionService } from './booking-projection.service';

describe('BookingProjectionService', () => {
  it('projects an operational snapshot and timeline for agents', () => {
    const result = new BookingProjectionService().forAgent({ id: 'b1', bookingCode: 'VY-1', recordType: 'CANONICAL', status: 'CONFIRMED', bookingMode: 'INSTANT', serviceDate: new Date(), serviceTimezone: 'UTC', customerName: 'Customer', amount: 100, currency: 'INR', travellers: [], events: [], operationalSnapshot: { productSnapshot: { productName: 'Activity' } }, economicsSnapshot: null });
    expect(result).toEqual(expect.objectContaining({ id: 'b1', bookingCode: 'VY-1', snapshot: { productSnapshot: { productName: 'Activity' } }, timeline: [], economics: null }));
  });
});
