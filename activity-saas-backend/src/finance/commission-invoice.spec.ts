import { CommissionInvoiceStatus, SettlementBatchStatus, UserRole } from '@prisma/client';
import { Prisma } from '@prisma/client';
import { FinanceService } from './finance.service';

const maker = { sub: 'admin-maker', email: 'maker@test', role: UserRole.ADMIN, tenantId: null } as any;
const checker = { sub: 'admin-checker', email: 'checker@test', role: UserRole.ADMIN, tenantId: null } as any;

function invoiceService(batch: any, existingInvoice: any = null) {
  const invoice = { id: 'invoice-1', invoiceNumber: 'INV/2627/000184', financialYear: '2627', status: CommissionInvoiceStatus.DRAFT, createdById: maker.sub, vendorTenantId: 'vendor-1', vendorLegalName: 'Vendor Legal Name', totalAmount: '177.1475' };
  const tx: any = {
    $queryRawUnsafe: jest.fn(),
    settlementBatch: { findUnique: jest.fn().mockResolvedValue(batch) },
    commissionInvoice: {
      findUnique: jest.fn().mockResolvedValue(existingInvoice),
      create: jest.fn().mockResolvedValue(invoice),
      update: jest.fn().mockResolvedValue({ ...invoice, status: CommissionInvoiceStatus.ISSUED, issuedById: checker.sub }),
    },
    publicIdentifier: {
      findMany: jest.fn().mockResolvedValue([]),
      upsert: jest.fn().mockImplementation(({ create }: any) => create),
    },
    publicIdentifierSequence: { upsert: jest.fn().mockResolvedValue({ lastValue: 184 }) },
  };
  const prisma: any = { commissionInvoice: { findMany: jest.fn().mockResolvedValue([]) }, $transaction: jest.fn((callback: any) => callback(tx)) };
  const audit: any = { write: jest.fn().mockResolvedValue(undefined) };
  return { service: new FinanceService(prisma, audit, {} as any), tx, audit, invoice, prisma };
}

const reconciledBatch = {
  id: 'batch-1',
  vendorTenantId: 'vendor-1',
  status: SettlementBatchStatus.RECONCILED,
  currency: 'INR',
  periodFrom: new Date('2026-10-01'),
  periodTo: new Date('2026-10-31'),
  vendorTenant: { name: 'Vendor account', vendorProfile: { legalBusinessName: 'Vendor Legal Name', gstin: 'GSTIN-123' } },
  lines: [
    { id: 'line-1', bookingId: 'booking-1', lineType: 'BOOKING', currency: 'INR', components: { supplierCommission: '100.1250', gstOnCommissionAmount: '18.0225' } },
    { id: 'line-2', bookingId: 'booking-2', lineType: 'BOOKING', currency: 'INR', components: { supplierCommission: '50.0000', gstOnCommissionAmount: '9.0000' } },
    { id: 'line-3', bookingId: null, lineType: 'ADJUSTMENT', currency: 'INR', components: { supplierCommission: null, gstOnCommissionAmount: null } },
  ],
};

describe('commission invoice register', () => {
  it('creates a unique FY invoice from immutable reconciled batch snapshots', async () => {
    const { service, tx, audit } = invoiceService(reconciledBatch);

    await expect(service.createCommissionInvoice(maker, 'batch-1')).resolves.toMatchObject({ invoiceNumber: 'INV/2627/000184', publicCode: 'INV/2627/000184', vendorLegalName: 'Vendor Legal Name' });
    expect(tx.publicIdentifierSequence.upsert).toHaveBeenCalledWith(expect.objectContaining({ where: { entityType_prefix: { entityType: 'COMMISSION_INVOICE', prefix: expect.stringMatching(/^INV\/\d{4}\/$/) } } }));
    expect(tx.commissionInvoice.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ vendorGstin: 'GSTIN-123', sourceLineSnapshot: expect.arrayContaining([expect.objectContaining({ settlementLineId: 'line-1', supplierCommission: '100.1250', gstOnCommissionAmount: '18.0225' })]) }) }));
    const createData = tx.commissionInvoice.create.mock.calls[0][0].data;
    expect(new Prisma.Decimal(createData.commissionSubtotal).toFixed(4)).toBe('150.1250');
    expect(new Prisma.Decimal(createData.gstOnCommissionAmount).toFixed(4)).toBe('27.0225');
    expect(new Prisma.Decimal(createData.totalAmount).toFixed(4)).toBe('177.1475');
    expect(tx.publicIdentifier.upsert).toHaveBeenCalledWith(expect.objectContaining({ create: expect.objectContaining({ entityType: 'COMMISSION_INVOICE', entityId: 'invoice-1', publicCode: 'INV/2627/000184' }) }));
    expect(audit.write).toHaveBeenCalledWith(tx, expect.objectContaining({ action: 'COMMISSION_INVOICE_DRAFT_CREATED', entityType: 'CommissionInvoice', entityId: 'invoice-1' }));
  });

  it('returns the existing invoice on repeated draft requests for the same batch', async () => {
    const existing = { id: 'invoice-1', invoiceNumber: 'INV/2627/000184', status: CommissionInvoiceStatus.DRAFT };
    const { service, tx } = invoiceService(reconciledBatch, existing);

    await expect(service.createCommissionInvoice(maker, 'batch-1')).resolves.toMatchObject({ id: 'invoice-1', publicCode: 'INV/2627/000184' });
    expect(tx.commissionInvoice.create).not.toHaveBeenCalled();
  });

  it('starts the invoice series on the Indian financial-year boundary', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2027-03-31T19:00:00.000Z'));
    try {
      const { service, tx } = invoiceService(reconciledBatch);
      await service.createCommissionInvoice(maker, 'batch-1');
      expect(tx.publicIdentifierSequence.upsert).toHaveBeenCalledWith(expect.objectContaining({ where: { entityType_prefix: { entityType: 'COMMISSION_INVOICE', prefix: 'INV/2728/' } } }));
    } finally {
      jest.useRealTimers();
    }
  });

  it('rejects unreconciled batches and missing recorded commission/GST values', async () => {
    const unreconciled = invoiceService({ ...reconciledBatch, status: SettlementBatchStatus.READY_FOR_PAYOUT });
    await expect(unreconciled.service.createCommissionInvoice(maker, 'batch-1')).rejects.toThrow('COMMISSION_INVOICE_REQUIRES_RECONCILED_BATCH');

    const missingSnapshot = invoiceService({ ...reconciledBatch, lines: [{ ...reconciledBatch.lines[0], components: { supplierCommission: '10', gstOnCommissionAmount: null } }] });
    await expect(missingSnapshot.service.createCommissionInvoice(maker, 'batch-1')).rejects.toThrow('COMMISSION_INVOICE_REQUIRES_RECORDED_COMMISSION_AND_GST');
  });

  it('requires a different Admin to issue a draft and records the issue event', async () => {
    const draft = { id: 'invoice-1', invoiceNumber: 'INV/2627/000184', financialYear: '2627', status: CommissionInvoiceStatus.DRAFT, createdById: maker.sub, vendorTenantId: 'vendor-1', totalAmount: '177.1475' };
    const { service, tx, audit } = invoiceService(reconciledBatch, draft);
    await expect(service.issueCommissionInvoice(maker, 'invoice-1')).rejects.toThrow('A different Admin must issue this commission invoice');
    await expect(service.issueCommissionInvoice(checker, 'invoice-1')).resolves.toMatchObject({ invoiceNumber: 'INV/2627/000184', status: CommissionInvoiceStatus.ISSUED, issuedById: checker.sub });
    expect(tx.commissionInvoice.update).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'invoice-1' }, data: expect.objectContaining({ status: CommissionInvoiceStatus.ISSUED, issuedById: checker.sub }) }));
    expect(audit.write).toHaveBeenCalledWith(tx, expect.objectContaining({ action: 'COMMISSION_INVOICE_ISSUED', entityType: 'CommissionInvoice' }));
  });
});
