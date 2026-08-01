export interface PaymentProvider {
  capture(paymentReference: string, amountMinor: number, currency: string): Promise<void>;
  fail(paymentReference: string): Promise<void>;
}

/** Deterministic local provider used until a real gateway is configured. */
export class MockPaymentProvider implements PaymentProvider {
  async capture(paymentReference: string, amountMinor: number, currency: string): Promise<void> { void paymentReference; void amountMinor; void currency; return Promise.resolve(); }
  async fail(paymentReference: string): Promise<void> { void paymentReference; return Promise.resolve(); }
}
