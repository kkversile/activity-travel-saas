import { VoucherGenerationService } from './voucher-generation.service';
import { PDFDocument, PDFPage } from 'pdf-lib';

describe('VoucherGenerationService', () => {
  afterEach(() => jest.restoreAllMocks());
  const voucher = () => ({ voucherCode: 'VOY-ABCD-EFGH', bookingCode: 'BOOKING-1', productName: 'Munnar sunset walk', variantName: 'Shared walk', serviceDate: new Date('2026-11-16T00:00:00Z'), localStartTime: '16:00', timezone: 'Asia/Kolkata', pax: 2, travellerSummary: { ADULT: 2 }, evidence: [], howToRedeem: [], voucherVersion: 1, generatedAt: '2026-11-15T00:00:00Z' });
  it('prints complete redemption instructions within the page and keeps an unambiguous service date', async () => {
    const draw = jest.spyOn(PDFPage.prototype, 'drawText');
    const service = new VoucherGenerationService({} as any, {} as any, {} as any, {} as any, {} as any);
    const instructions = 'Meet at the tea estate entrance by 15:45. ' + 'Follow the guide on the maintained paths and bring drinking water. '.repeat(8) + 'Return to the original meeting point at 18:00.';
    const bytes = await (service as any).pdf({ ...voucher(), howToRedeem: [instructions] });
    const text = draw.mock.calls.map(([value]) => value).join(' ');
    expect(text).toContain('Return to the original meeting point at 18:00.');
    expect(text).toContain(instructions.replace(/\s+/g, ' ').trim());
    expect(text).toContain('Service date: 2026-11-16 16:00 Asia/Kolkata');
    expect(text).toContain('Travellers: 2 (2 adult)');
    expect((await PDFDocument.load(bytes)).getPageCount()).toBeGreaterThan(0);
    for (const [value, options] of draw.mock.calls) {
      expect(options!.font!.widthOfTextAtSize(value, options!.size!)).toBeLessThanOrEqual(499);
      expect(options!.y).toBeGreaterThanOrEqual(48);
    }
  });
  it('paginates long instructions and wraps unbroken references without truncation', async () => {
    const draw = jest.spyOn(PDFPage.prototype, 'drawText');
    const service = new VoucherGenerationService({} as any, {} as any, {} as any, {} as any, {} as any);
    const bytes = await (service as any).pdf({ ...voucher(), howToRedeem: ['Traveller instruction sentence. '.repeat(800), 'X'.repeat(350) + ' LAST-INSTRUCTION'] });
    expect((await PDFDocument.load(bytes)).getPageCount()).toBeGreaterThan(1);
    expect(draw.mock.calls.map(([value]) => value).join(' ')).toContain('LAST-INSTRUCTION');
    for (const [value, options] of draw.mock.calls) expect(options!.font!.widthOfTextAtSize(value, options!.size!)).toBeLessThanOrEqual(499);
  });
  it('builds a traveller-safe preview payload with the vendor-prefixed voucher format', () => { const service = new VoucherGenerationService({} as any, {} as any, {} as any, {} as any, {} as any); const payload: any = service.buildPayload({ bookingCode: 'BK-1', vendorTenant: { vendorProfile: { voucherShortCode: 'BMA' } }, serviceDate: new Date(), pax: 1, serviceTimezone: 'UTC', operationalSnapshot: { productSnapshot: { productName: 'Demo' }, variantSnapshot: { name: 'Standard' }, fulfilmentPolicySnapshot: {} }, travellers: [] }, { evidence: [{ kind: 'PNR_REFERENCE', status: 'CURRENT', referenceValue: 'PRIVATE', travellerVisible: false, versionNumber: 1 }, { kind: 'TICKET_FILE', status: 'CURRENT', referenceValue: null, fileAssetId: 'file-1', travellerVisible: true, versionNumber: 1 }] }); expect(payload.voucherVersion).toBe(1); expect(payload.voucherCode).toMatch(/^BMA-[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$/); expect(payload.evidence).toEqual([{ kind: 'TICKET_FILE', referenceValue: null, fileAssetId: 'file-1', versionNumber: 1 }]); expect(JSON.stringify(payload)).not.toContain('PRIVATE'); });
});
