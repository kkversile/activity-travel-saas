import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { VendorToolsService } from './vendor-tools.service';

describe('VendorToolsService persistence and ownership', () => {
  it('stores only a hashed team invitation token and returns the one-time join token', async () => {
    const upsert = jest.fn().mockImplementation(({ create }) => Promise.resolve({ id: 'invite-1', ...create }));
    const service = new VendorToolsService({ user: { findFirst: jest.fn().mockResolvedValue(null) }, vendorTeamInvitation: { upsert } } as any);

    const result = await service.inviteTeamMember(owner, { email: 'ops@example.com', role: 'OPERATIONS' });

    expect(result).toMatchObject({ id: 'invite-1', email: 'ops@example.com', role: 'OPERATIONS' });
    expect(result.inviteToken).toMatch(/^[A-Za-z0-9_-]{40,60}$/);
    expect(upsert.mock.calls[0][0].create.tokenHash).toMatch(/^[a-f0-9]{64}$/);
    expect(upsert.mock.calls[0][0].create.tokenHash).not.toBe(result.inviteToken);
  });

  const owner = { tenantId: 'vendor-1', organizationRole: 'OWNER' } as any;

  it('returns promotion impact tied to the promotion ID in booking snapshots', async () => {
    const prisma: any = {
      promotion: { findMany: jest.fn().mockResolvedValue([{ id: 'promotion-1', productId: 'product-1', name: 'Spring offer', promotionType: 'PERCENTAGE_OFF', discountPercent: 10, discountAmount: null, conditionValue: null, startsAt: new Date('2026-11-01'), endsAt: new Date('2026-11-30'), bookingStartsAt: null, bookingEndsAt: null, validWeekdays: [], stackWithPlatform: false, fundingOwner: 'SUPPLIER', maxDiscountedBookings: null, active: true, product: { productCode: 'TA-001', currentRevision: { productName: 'Tea walk' } } }]) },
      $queryRaw: jest.fn().mockResolvedValue([{ bookings: 2n, sales: '1200.00' }]),
    };
    const result = await new VendorToolsService(prisma).listPromotions(owner);
    expect(result[0]).toMatchObject({ id: 'promotion-1', productName: 'Tea walk', bookings: 2, sales: 1200, impactTrackingAvailable: true });
    expect(prisma.$queryRaw).toHaveBeenCalledTimes(1);
  });

  it('persists booking windows, activity weekdays, stacking and booking cap for each selected product', async () => {
    const create = jest.fn().mockImplementation(({ data }) => Promise.resolve({ id: `promo-${data.productId}` }));
    const prisma: any = {
      product: { findMany: jest.fn().mockResolvedValue([{ id: 'product-1' }, { id: 'product-2' }]) },
      promotion: { findFirst: jest.fn().mockResolvedValue(null), create },
      $transaction: jest.fn().mockImplementation((queries) => Promise.all(queries)),
    };
    const result = await new VendorToolsService(prisma).createPromotion(owner, {
      name: 'Weekday saver', productIds: ['product-1', 'product-2'], promotionType: 'PERCENTAGE_OFF', discountPercent: 15,
      startsAt: '2026-11-03', endsAt: '2026-11-30', bookingStartsAt: '2026-11-01', bookingEndsAt: '2026-11-10',
      validWeekdays: ['MON', 'TUE', 'WED', 'THU', 'FRI'], maxDiscountedBookings: 40, stackWithPlatform: true,
    });
    expect(result.ids).toEqual(['promo-product-1', 'promo-product-2']);
    expect(create).toHaveBeenCalledTimes(2);
    expect(create.mock.calls[0][0].data).toMatchObject({
      productId: 'product-1', name: 'Weekday saver', bookingStartsAt: new Date('2026-11-01'), bookingEndsAt: new Date('2026-11-10T23:59:59.999Z'),
      validWeekdays: ['MON', 'TUE', 'WED', 'THU', 'FRI'], maxDiscountedBookings: 40, stackWithPlatform: true,
    });
    expect(create.mock.calls[0][0].data.startsAt).toEqual(new Date('2026-11-03'));
    expect(create.mock.calls[0][0].data.endsAt).toEqual(new Date('2026-11-30T23:59:59.999Z'));
  });

  it('stores a promotion draft inactive and without conflicting with live promotions', async () => {
    const create = jest.fn().mockImplementation(({ data }) => Promise.resolve({ id: `promo-${data.productId}` }));
    const prisma: any = {
      product: { findMany: jest.fn().mockResolvedValue([{ id: 'product-1' }]) },
      promotion: { findFirst: jest.fn(), create },
      $transaction: jest.fn().mockImplementation((queries) => Promise.all(queries)),
    };
    const result = await new VendorToolsService(prisma).createPromotion(owner, {
      name: 'Draft weekday saver', productIds: ['product-1'], promotionType: 'PERCENTAGE_OFF', discountPercent: 15,
      startsAt: '2026-11-03', endsAt: '2026-11-30', draft: true,
    });
    expect(result.ids).toEqual(['promo-product-1']);
    expect(prisma.promotion.findFirst).not.toHaveBeenCalled();
    expect(create.mock.calls[0][0].data).toMatchObject({ draft: true, active: false, name: 'Draft weekday saver' });
  });

  it('persists an incomplete promotion draft without inventing dates or discount values', async () => {
    const create = jest.fn().mockImplementation(({ data }) => Promise.resolve({ id: `promo-${data.productId}` }));
    const prisma: any = {
      product: { findMany: jest.fn().mockResolvedValue([{ id: 'product-1' }]) },
      promotion: { create },
      $transaction: jest.fn().mockImplementation((queries) => Promise.all(queries)),
    };
    await new VendorToolsService(prisma).createPromotion(owner, { productIds: ['product-1'], draft: true });
    expect(create.mock.calls[0][0].data).toMatchObject({ name: 'Untitled promotion', draft: true, active: false, discountPercent: 0, startsAt: null, endsAt: null });
  });

  it('updates a tenant-owned draft and activates it when published', async () => {
    const existing = { id: 'draft-1', productId: 'product-1', draft: true };
    const update = jest.fn().mockResolvedValue({ id: 'draft-1', active: true, draft: false });
    const prisma: any = {
      promotion: { findFirst: jest.fn().mockResolvedValueOnce(existing).mockResolvedValueOnce(null), update },
    };
    await new VendorToolsService(prisma).updatePromotion(owner, 'draft-1', {
      name: 'Ready weekday saver', promotionType: 'PERCENTAGE_OFF', discountPercent: 15,
      startsAt: '2026-11-03', endsAt: '2026-11-30', bookingStartsAt: '', bookingEndsAt: '', validWeekdays: ['MON'],
      stackWithPlatform: false, maxDiscountedBookings: '', draft: false,
    });
    expect(update).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'draft-1' }, data: expect.objectContaining({ name: 'Ready weekday saver', active: true, draft: false }) }));
  });

  it('persists only valid scheduled report time and recipient fields', async () => {
    const create = jest.fn().mockResolvedValue({ id: 'schedule-1' });
    const service = new VendorToolsService({ reportSchedule: { create } } as any);
    const previous = { enabled: process.env.VENDOR_REPORT_SCHEDULER_ENABLED, host: process.env.SMTP_HOST, user: process.env.SMTP_USER, password: process.env.SMTP_PASSWORD };
    process.env.VENDOR_REPORT_SCHEDULER_ENABLED = 'false'; delete process.env.SMTP_HOST; delete process.env.SMTP_USER; delete process.env.SMTP_PASSWORD;
    try {
      await expect(service.createReportSchedule(owner, { reportName: 'Weekly bookings', reportType: 'BOOKINGS', frequency: 'WEEKLY', recipient: 'ops@example.com', runTime: '09:15' })).resolves.toEqual({ id: 'schedule-1' });
      expect(create).toHaveBeenCalledWith({ data: expect.objectContaining({ tenantId: 'vendor-1', reportName: 'Weekly bookings', reportType: 'BOOKINGS', frequency: 'WEEKLY', recipient: 'ops@example.com', runTime: '09:15', status: 'PAUSED' }) });
      await expect(service.createReportSchedule(owner, { reportName: 'Bad time', reportType: 'BOOKINGS', frequency: 'DAILY', recipient: 'ops@example.com', runTime: '9am' })).rejects.toBeInstanceOf(BadRequestException);
      const update = jest.fn();
      const unavailable = new VendorToolsService({ reportSchedule: { findFirst: jest.fn().mockResolvedValue({ id: 'schedule-1' }), update } } as any);
      await expect(unavailable.updateReportSchedule(owner, 'schedule-1', { status: 'ACTIVE' })).rejects.toThrow('delivery is unavailable');
      expect(update).not.toHaveBeenCalled();
    } finally {
      if (previous.enabled === undefined) delete process.env.VENDOR_REPORT_SCHEDULER_ENABLED; else process.env.VENDOR_REPORT_SCHEDULER_ENABLED = previous.enabled;
      if (previous.host === undefined) delete process.env.SMTP_HOST; else process.env.SMTP_HOST = previous.host;
      if (previous.user === undefined) delete process.env.SMTP_USER; else process.env.SMTP_USER = previous.user;
      if (previous.password === undefined) delete process.env.SMTP_PASSWORD; else process.env.SMTP_PASSWORD = previous.password;
    }
  });

  it('activates a scheduled report only when scheduler and SMTP are configured', async () => {
    const create = jest.fn().mockResolvedValue({ id: 'schedule-2' });
    const service = new VendorToolsService({ reportSchedule: { create } } as any);
    const previous = { enabled: process.env.VENDOR_REPORT_SCHEDULER_ENABLED, host: process.env.SMTP_HOST, user: process.env.SMTP_USER, password: process.env.SMTP_PASSWORD };
    process.env.VENDOR_REPORT_SCHEDULER_ENABLED = 'true'; process.env.SMTP_HOST = 'smtp.test'; process.env.SMTP_USER = 'sender@example.test'; process.env.SMTP_PASSWORD = 'configured';
    try {
      await service.createReportSchedule(owner, { reportName: 'Weekly bookings', reportType: 'BOOKINGS', frequency: 'WEEKLY', recipient: 'ops@example.com', runTime: '09:15' });
      expect(create).toHaveBeenCalledWith({ data: expect.objectContaining({ status: 'ACTIVE' }) });
    } finally {
      if (previous.enabled === undefined) delete process.env.VENDOR_REPORT_SCHEDULER_ENABLED; else process.env.VENDOR_REPORT_SCHEDULER_ENABLED = previous.enabled;
      if (previous.host === undefined) delete process.env.SMTP_HOST; else process.env.SMTP_HOST = previous.host;
      if (previous.user === undefined) delete process.env.SMTP_USER; else process.env.SMTP_USER = previous.user;
      if (previous.password === undefined) delete process.env.SMTP_PASSWORD; else process.env.SMTP_PASSWORD = previous.password;
    }
  });

  it('rejects account-wide preference changes by a non-owner', async () => {
    const service = new VendorToolsService({} as any);
    await expect(service.updateNotificationPreferences({ tenantId: 'vendor-1', organizationRole: 'OPERATIONS' } as any, { bookingEmail: false })).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('reports which notification channels can currently deliver', async () => {
    const previous = { host: process.env.SMTP_HOST, user: process.env.SMTP_USER, password: process.env.SMTP_PASSWORD };
    delete process.env.SMTP_HOST; delete process.env.SMTP_USER; delete process.env.SMTP_PASSWORD;
    const service = new VendorToolsService({ globalSetting: { findFirst: jest.fn().mockResolvedValue(null) } } as any);
    try {
      const disconnected = await service.getNotificationPreferences(owner);
      expect(disconnected.delivery).toMatchObject({ bookingEmail: false, cancellationEmail: false, payoutEmail: false });
      process.env.SMTP_HOST = 'smtp.test'; process.env.SMTP_USER = 'sender@example.test'; process.env.SMTP_PASSWORD = 'configured';
      const connected = await service.getNotificationPreferences(owner);
      expect(connected.delivery).toMatchObject({ bookingEmail: true, cancellationEmail: true, payoutEmail: true, bookingSms: false, bookingWhatsapp: false });
    } finally {
      if (previous.host === undefined) delete process.env.SMTP_HOST; else process.env.SMTP_HOST = previous.host;
      if (previous.user === undefined) delete process.env.SMTP_USER; else process.env.SMTP_USER = previous.user;
      if (previous.password === undefined) delete process.env.SMTP_PASSWORD; else process.env.SMTP_PASSWORD = previous.password;
    }
  });

  it('keeps scheduled delivery dormant unless explicitly enabled', async () => {
    const previous = process.env.VENDOR_REPORT_SCHEDULER_ENABLED;
    delete process.env.VENDOR_REPORT_SCHEDULER_ENABLED;
    const service = new VendorToolsService({} as any);
    try { await expect(service.dispatchScheduledReports()).resolves.toBeUndefined(); }
    finally { if (previous === undefined) delete process.env.VENDOR_REPORT_SCHEDULER_ENABLED; else process.env.VENDOR_REPORT_SCHEDULER_ENABLED = previous; }
  });

  it('includes the full final calendar day in report date filters', async () => {
    const findMany = jest.fn().mockResolvedValue([]);
    const service = new VendorToolsService({ booking: { findMany }, globalSetting: { findFirst: jest.fn().mockResolvedValue(null), create: jest.fn() } } as any);
    await service.createReport(owner, { type: 'BOOKINGS', from: '2026-11-01', to: '2026-11-30' });
    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ serviceDate: { gte: new Date('2026-11-01'), lte: new Date('2026-11-30T23:59:59.999Z') } }) }));
  });

  it('persists an asynchronous report export as a tenant-scoped job', async () => {
    const create = jest.fn().mockResolvedValue({ id: 'export-1', tenantId: 'vendor-1', name: 'Products report', type: 'PRODUCTS', format: 'CSV', status: 'PENDING', createdAt: new Date('2026-11-05T10:00:00Z') });
    const updateMany = jest.fn().mockResolvedValue({ count: 0 });
    const service = new VendorToolsService({ vendorReportExport: { create, updateMany } } as any);

    const result = await service.enqueueReport(owner, { type: 'PRODUCTS', from: '2026-11-01', to: '2026-11-05', format: 'CSV' });

    expect(create).toHaveBeenCalledWith({ data: expect.objectContaining({ tenantId: 'vendor-1', type: 'PRODUCTS', format: 'CSV', status: 'PENDING', fromDate: new Date('2026-11-01'), toDate: new Date('2026-11-05T23:59:59.999Z') }) });
    expect(result).toMatchObject({ id: 'export-1', status: 'PENDING', downloadUrl: '/api/vendor/reports/export-1/download' });
  });

  it('exports persisted commission invoice records rather than settlement summaries', async () => {
    const invoice = { invoiceNumber: 'INV/2627/001', financialYear: '2627', settlementBatch: { batchCode: 'SET-01' }, periodFrom: new Date('2026-11-01'), periodTo: new Date('2026-11-07'), currency: 'INR', commissionSubtotal: '100', gstOnCommissionAmount: '18', totalAmount: '118', status: 'ISSUED', issuedAt: new Date('2026-11-08T10:00:00Z') };
    const findMany = jest.fn().mockResolvedValue([invoice]);
    const service = new VendorToolsService({ commissionInvoice: { findMany }, globalSetting: { findFirst: jest.fn().mockResolvedValue(null), create: jest.fn() } } as any);
    const report = await service.createReport(owner, { type: 'COMMISSION_INVOICES' });
    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { vendorTenantId: 'vendor-1' }, include: { settlementBatch: { select: { batchCode: true } } } }));
    expect(report.rows[1]).toEqual(['INV/2627/001', '2627', 'SET-01', '2026-11-01', '2026-11-07', 'INR', '100', '18', '118', 'ISSUED', '2026-11-08T10:00:00.000Z']);
  });

  it('exports tenant-scoped persisted review records and vendor replies', async () => {
    const review = { reviewedAt: new Date('2026-11-03T10:00:00Z'), rating: 5, reviewerName: 'Guest', title: 'Excellent', comment: 'Great trek', vendorReply: 'Thank you', repliedAt: new Date('2026-11-04T10:00:00Z'), source: 'MARKETPLACE', product: { productCode: 'TA-1', currentRevision: { productName: 'Sunrise Trek' } } };
    const findMany = jest.fn().mockResolvedValue([review]);
    const setting = { create: jest.fn(), findFirst: jest.fn().mockResolvedValue(null) };
    const service = new VendorToolsService({ vendorReview: { findMany }, globalSetting: setting } as any);

    const report = await service.createReport(owner, { type: 'REVIEWS', from: '2026-11-01', to: '2026-11-30' });

    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { tenantId: 'vendor-1', status: 'PUBLISHED', reviewedAt: { gte: new Date('2026-11-01'), lte: new Date('2026-11-30T23:59:59.999Z') } },
      take: 1000,
    }));
    expect(report.rows[0]).toEqual(['Review date', 'Product', 'Rating', 'Reviewer', 'Title', 'Review', 'Vendor reply', 'Reply date', 'Source']);
    expect(report.rows[1]).toEqual(['2026-11-03', 'Sunrise Trek', '5', 'Guest', 'Excellent', 'Great trek', 'Thank you', '2026-11-04', 'MARKETPLACE']);
  });

  it('exports recorded TDS and GST TCS components for settlement lines', async () => {
    const findMany = jest.fn().mockResolvedValue([{ batchCode: 'SET-02', currency: 'INR', status: 'RECONCILED', createdAt: new Date('2026-11-08T10:00:00Z'), lines: [{ currency: 'INR', booking: { bookingCode: 'BK-1' }, components: { gstOnCommissionAmount: '18', tds194OAmount: '10', gstTcsAmount: '2' } }] }]);
    const service = new VendorToolsService({ settlementBatch: { findMany }, globalSetting: { findFirst: jest.fn().mockResolvedValue(null), create: jest.fn() } } as any);
    const report = await service.createReport(owner, { type: 'TDS_TCS_CERTIFICATES' });
    expect(report.rows[1]).toEqual(['SET-02', 'BK-1', 'INR', '18', '10', '2', 'RECONCILED', '2026-11-08T10:00:00.000Z']);
  });

  it('reports product views alongside bookings and computes conversion from the period totals', async () => {
    const productViewGroupBy = jest.fn().mockResolvedValue([{ productId: 'product-1', _count: { _all: 2 } }]);
    const productFindMany = jest.fn().mockResolvedValue([{ id: 'product-1', productCode: 'TA-1', currentRevision: { productName: 'Tea walk' } }]);
    const bookingFindMany = jest.fn().mockResolvedValue([{ product: { productCode: 'TA-1', currentRevision: { productName: 'Tea walk' } }, pax: 3, amount: '1200.00' }]);
    const service = new VendorToolsService({ productViewEvent: { groupBy: productViewGroupBy }, product: { findMany: productFindMany }, booking: { findMany: bookingFindMany }, globalSetting: { findFirst: jest.fn().mockResolvedValue(null), create: jest.fn() } } as any);
    const report = await service.createReport(owner, { type: 'PRODUCT_PERFORMANCE', from: '2026-11-01', to: '2026-11-30' });
    expect(productViewGroupBy).toHaveBeenCalledWith(expect.objectContaining({ by: ['productId'], where: { vendorTenantId: 'vendor-1', viewedAt: { gte: new Date('2026-11-01'), lte: new Date('2026-11-30T23:59:59.999Z') } } }));
    expect(productFindMany).toHaveBeenCalledWith(expect.objectContaining({ where: { tenantId: 'vendor-1', id: { in: ['product-1'] } } }));
    expect(report.rows[1]).toEqual(['TA-1', 'Tea walk', '2', '1', '3', '50.00%', '1200.00']);
  });

  it('downloads XLSX reports as a real Open XML workbook with the matching extension and content type', async () => {
    let stored: any;
    const globalSetting = {
      findFirst: jest.fn().mockImplementation(async () => stored ? { id: 'setting-1', value: stored } : null),
      create: jest.fn().mockImplementation(async ({ data }) => { stored = data.value; return { id: 'setting-1' }; }),
    };
    const vendorReportExport = {
      findFirst: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockImplementation(async ({ data }) => { stored = { ...data, id: 'export-1', createdAt: new Date(), rows: data.rows }; return stored; }),
    };
    const service = new VendorToolsService({ booking: { findMany: jest.fn().mockResolvedValue([]) }, globalSetting, vendorReportExport } as any);
    const report = await service.createReport(owner, { type: 'BOOKINGS', format: 'XLSX' });
    const download = await service.downloadReport(owner, report.id);
    expect(download.filename).toMatch(/\.xlsx$/);
    expect(download.contentType).toBe('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    expect(Buffer.isBuffer(download.body)).toBe(true);
    expect((download.body as Buffer).subarray(0, 2).toString()).toBe('PK');
  });

  it('exports traveller and cancellation details from tenant-owned booking records', async () => {
    const findMany = jest.fn().mockResolvedValue([{ bookingCode: 'BK-2', serviceDate: new Date('2026-11-12'), amount: '250', pax: 2, status: 'CANCELLED', product: { productCode: 'TA-2', currentRevision: { productName: 'Coastal walk' } }, travellers: [{ sequence: 1, fullName: 'A Guest', phone: '+911234', quantity: 2 }], operationalSnapshot: { pickupSnapshot: { supplied: { location: 'Market gate' } } }, cancellation: { reason: 'Illness', reasonCategory: 'CUSTOMER', refundEntitlement: '200', refund: { amount: '200', status: 'CONFIRMED' } } }]);
    const service = new VendorToolsService({ booking: { findMany }, globalSetting: { findFirst: jest.fn().mockResolvedValue(null), create: jest.fn() } } as any);
    const manifest = await service.createReport(owner, { type: 'GUEST_MANIFEST' });
    expect(manifest.rows[1]).toEqual(['BK-2', '2026-11-12', 'Coastal walk', 'A Guest', '+911234', '2', 'location: Market gate', 'CANCELLED']);
    const cancellations = await service.createReport(owner, { type: 'CANCELLATIONS' });
    expect(cancellations.rows[1]).toEqual(['BK-2', '2026-11-12', 'Coastal walk', 'Illness', 'CUSTOMER', '200', 'CONFIRMED', '200', '250', 'CANCELLED']);
  });
});
