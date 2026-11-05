import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { api } from '../api';
import { PartnerBulkUploadPage, PartnerDashboard, PartnerPromotionsPage, PartnerReportsPage, PartnerSettingsPage } from './PartnerHubPages';

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe('Partner Hub bulk upload prototype flow', () => {
  it('presents the three upload stages and opens the import template workflow', async () => {
    render(<PartnerBulkUploadPage />);
    expect(screen.getByRole('heading', { name: 'Bulk upload' })).toBeInTheDocument();
    expect(screen.getByText('Step 1')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Download template' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Product template' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Rate update template' })).toBeInTheDocument();
    expect(screen.getByText('Step 2')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Validate sample file' })).toBeInTheDocument();
    expect(screen.getByText('Step 3')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Validate sample file' }));
    expect(await screen.findByRole('dialog')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Product template (Excel)' })).toBeInTheDocument();
    expect(screen.getByLabelText('Completed Excel, CSV or JSON file')).toBeInTheDocument();
  });
});

describe('Partner Hub dashboard', () => {
  it('surfaces expired verified documents as urgent account work', async () => {
    vi.spyOn(api, 'request').mockImplementation(async (path) => {
      if (path === '/dashboard/summary') return {
        bookingsToday: 0, guestsToday: 0, nextSevenDays: 0, vendorNetEarningsMtd: 0, nextPayout: null, pendingBookings: 0,
        cancellationRate: 0, listings: 1, liveListings: 1, draftListings: 0, rejectedListings: 0, expiredDocuments: 1, documentsExpiring: 0,
        responseTimeMinutes: null, readinessScore: 80, vendorActionRequiredBookings: 0, recentBookings: [], upcomingDepartures: [], todayDepartures: [],
      } as never;
      if (path === '/dashboard/bookings-trend') return { days: [] } as never;
      throw new Error(`Unexpected request: ${path}`);
    });

    render(<PartnerDashboard />);

    const expiredTask = await screen.findByRole('link', { name: /1 verified documents expired/ });
    expect(expiredTask).toHaveAttribute('href', '/vendor/onboarding');
  });

  it('shows backend booking and product quality counts instead of a false caught-up state', async () => {
    vi.spyOn(api, 'request').mockImplementation(async (path) => {
      if (path === '/dashboard/summary') return {
        bookingsToday: 0, guestsToday: 0, nextSevenDays: 0, vendorNetEarningsMtd: 0, nextPayout: null, pendingBookings: 3,
        cancellationRate: 0, listings: 1, liveListings: 1, draftListings: 0, rejectedListings: 0, documentsExpiring: 0,
        responseTimeMinutes: null, readinessScore: 100, vendorActionRequiredBookings: 0, manualReviewPendingBookings: 2,
        legacyPendingBookings: 1, qualityIssueCount: 1, reviewsToReply: 0, recentBookings: [], upcomingDepartures: [], todayDepartures: [],
      } as never;
      if (path === '/dashboard/bookings-trend') return { days: [] } as never;
      throw new Error(`Unexpected request: ${path}`);
    });

    render(<PartnerDashboard />);

    expect(await screen.findByRole('link', { name: /2 bookings awaiting platform review/ })).toHaveAttribute('href', '/vendor/bookings');
    expect(screen.getByRole('link', { name: /1 bookings still pending confirmation/ })).toHaveAttribute('href', '/vendor/bookings');
    expect(screen.getByRole('link', { name: /1 product quality items need attention/ })).toHaveAttribute('href', '/vendor/products');
    expect(screen.queryByText('All caught up')).not.toBeInTheDocument();
  });

  it('renders canonical departures with a manifest action and booking trend', async () => {
    vi.spyOn(api, 'request').mockImplementation(async (path) => {
      if (path === '/dashboard/summary') return {
        bookingsToday: 2, guestsToday: 4, nextSevenDays: 3, guestsNextSevenDays: 9, vendorNetEarningsMtd: 1200, vendorNetEarningsMtdChangePercent: 12, nextPayout: null, pendingBookings: 0,
        cancellationRate: 0, listings: 1, liveListings: 1, draftListings: 0, rejectedListings: 0, documentsExpiring: 0,
        responseTimeMinutes: null, readinessScore: 100, vendorActionRequiredBookings: 0, manualReviewPendingBookings: 0,
        legacyPendingBookings: 0, qualityIssueCount: 0, reviewsToReply: 3, averageReviewRatingMtd: 4.6, recentBookings: [], upcomingDepartures: [],
        todayDepartures: [{ id: 'b1', bookingCode: 'VOYA-1', serviceDate: '2026-10-31', time: '09:00', pax: 4, status: 'CONFIRMED', product: 'Tea walk', option: 'Shared', meetingPoint: 'Main gate', manifestUrl: '/api/vendor/manifest/export.csv?serviceDate=2026-10-31' }],
      } as never;
      if (path === '/dashboard/bookings-trend') return { days: [{ date: '2026-10-31', bookings: 1, guests: 4, revenue: 1200 }] } as never;
      throw new Error(`Unexpected request: ${path}`);
    });

    render(<PartnerDashboard greetingName="Savio Fernandes" businessName="Goa Coastal Excursions LLP" />);

    await waitFor(() => expect(screen.getByText('Tea walk')).toBeInTheDocument());
    expect(screen.getByRole('heading', { name: /Savio$/ })).toBeInTheDocument();
    expect(screen.getByText(/Goa Coastal Excursions LLP/)).toBeInTheDocument();
    expect(screen.getByText(/You receive ·/)).toBeInTheDocument();
    expect(screen.getByText('+12% vs same period last month')).toBeInTheDocument();
    expect(screen.getByText('9')).toBeInTheDocument();
    expect(screen.getByText('guests booked')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /3 new reviews to reply to/ })).toHaveAttribute('href', '/vendor/reports');
    expect(screen.getByText('Average rating this month: 4.6')).toBeInTheDocument();
    expect(screen.getByText('Today’s departures')).toBeInTheDocument();
    const manifestDownload = vi.spyOn(api, 'blob').mockResolvedValue(new Blob(['bookingCode\nVOYA-1']));
    vi.stubGlobal('URL', { createObjectURL: vi.fn(() => 'blob:manifest'), revokeObjectURL: vi.fn() });
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    fireEvent.click(screen.getByRole('button', { name: 'Download manifest' }));
    await waitFor(() => expect(manifestDownload).toHaveBeenCalledWith('/vendor/manifest/export.csv?serviceDate=2026-10-31'));
    expect(screen.getByText('Bookings, last 14 days')).toBeInTheDocument();
    expect(screen.getByTitle('31 Oct 2026: 1 bookings')).toBeInTheDocument();
  });
});

describe('Partner Hub promotions prototype parity', () => {
  it('shows existing promotions before the create form and exposes the header action', async () => {
    vi.spyOn(api, 'request').mockImplementation(async (path) => {
      if (path === '/vendor/promotions') return [{ id: 'promo-1', name: 'Low Occupancy Booster', productId: 'p1', productName: 'Sunrise Trek to Top Station', promotionType: 'PERCENTAGE_OFF', discountPercent: 18, startsAt: '2026-11-03T00:00:00.000Z', endsAt: '2026-11-05T00:00:00.000Z', bookings: 0, sales: 0, active: true, impactTrackingAvailable: true }] as never;
      if (path === '/products/listing?limit=100') return { items: [{ id: 'p1', experienceName: 'Sunrise Trek to Top Station', startingPrice: 1200 }] } as never;
      throw new Error(`Unexpected request: ${path}`);
    });

    render(<PartnerPromotionsPage />);

    const table = await screen.findByRole('table');
    const createHeading = screen.getByRole('heading', { name: 'Create a promotion' });
    expect(screen.getByRole('button', { name: '+ New promotion' })).toBeInTheDocument();
    expect(table.compareDocumentPosition(createHeading) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(within(table).getByText('Sunrise Trek to Top Station')).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Bookings' })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Sales' })).toBeInTheDocument();
  });

  it('keeps the prototype field order and sends booking/activity windows to their separate API fields', async () => {
    const request = vi.spyOn(api, 'request').mockImplementation(async (path) => {
      if (path === '/vendor/promotions') return [] as never;
      if (path === '/products/listing?limit=100') return { items: [{ id: 'p1', experienceName: 'Sunrise Trek to Top Station', startingPrice: 1200 }] } as never;
      throw new Error(`Unexpected request: ${path}`);
    });

    render(<PartnerPromotionsPage />);
    const typeGroup = await screen.findByRole('group', { name: 'Promotion type' });
    const name = screen.getByLabelText(/Promotion name/);
    const bookableFrom = screen.getByLabelText(/Bookable from/);
    const activityFrom = screen.getByLabelText('Activity date starts');
    const applyTo = screen.getByText('Apply to');
    expect(typeGroup.compareDocumentPosition(name) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(name.compareDocumentPosition(bookableFrom) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(bookableFrom.compareDocumentPosition(applyTo) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

    fireEvent.change(name, { target: { value: 'Weekday saver' } });
    fireEvent.change(screen.getByLabelText('Discount (%)'), { target: { value: '15' } });
    fireEvent.change(bookableFrom, { target: { value: '2026-11-01' } });
    fireEvent.change(screen.getByLabelText(/Bookable until/), { target: { value: '2026-11-10' } });
    fireEvent.change(activityFrom, { target: { value: '2026-11-03' } });
    fireEvent.change(screen.getByLabelText('Activity date ends'), { target: { value: '2026-11-30' } });
    fireEvent.click(screen.getByLabelText('Sunrise Trek to Top Station'));
    fireEvent.change(screen.getByLabelText('Valid on activity days'), { target: { value: 'CUSTOM' } });
    expect(screen.getByRole('button', { name: 'Create promotion' })).toBeDisabled();
    fireEvent.click(screen.getByLabelText('MON'));
    fireEvent.click(screen.getByRole('button', { name: 'Create promotion' }));

    await waitFor(() => expect(request).toHaveBeenCalledWith('/vendor/promotions', expect.objectContaining({ method: 'POST' })));
    const sent = request.mock.calls.find(([path, options]) => path === '/vendor/promotions' && options?.method === 'POST');
    const payload = JSON.parse(String(sent?.[1]?.body));
    expect(payload.bookingStartsAt).toBe('2026-11-01');
    expect(payload.bookingEndsAt).toBe('2026-11-10');
    expect(payload.startsAt).toBe('2026-11-03');
    expect(payload.endsAt).toBe('2026-11-30');
    expect(payload.validWeekdays).toEqual(['MON']);
  });
});

describe('Partner Hub reports and persistence parity', () => {
  it('queues a report first and downloads only after it is ready', async () => {
    const report = { id: 'report-1', name: 'Products report', type: 'PRODUCTS', format: 'CSV', createdAt: '2026-11-04T10:00:00.000Z', status: 'READY', downloadUrl: '/api/vendor/reports/report-1/download' };
    const request = vi.spyOn(api, 'request').mockImplementation(async (path, options) => {
      if (path === '/vendor/reports' && options?.method === 'POST') return report as never;
      if (path === '/vendor/reports') return [report] as never;
      if (path === '/vendor/report-schedules') return { items: [], deliveryAvailable: false } as never;
      if (path === '/vendor/reviews') return [] as never;
      throw new Error(`Unexpected request: ${path}`);
    });
    const download = vi.spyOn(api, 'blob').mockResolvedValue(new Blob(['csv data'], { type: 'text/csv' }));
    vi.stubGlobal('URL', { createObjectURL: vi.fn(() => 'blob:report'), revokeObjectURL: vi.fn() });
    const anchorClick = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);

    render(<PartnerReportsPage />);
    expect(await screen.findByLabelText('Date range')).toHaveValue('THIS_MONTH');
    expect(screen.queryByLabelText('Report date from')).not.toBeInTheDocument();
    fireEvent.click(await screen.findByRole('button', { name: /Product report/ }));

    await waitFor(() => expect(request).toHaveBeenCalledWith('/vendor/reports', expect.objectContaining({ method: 'POST' })));
    expect(request).toHaveBeenCalledWith('/vendor/reports', expect.objectContaining({ method: 'POST', body: expect.stringMatching(/"from":"\d{4}-\d{2}-01".*"to":"\d{4}-\d{2}-\d{2}"/) }));
    expect(download).not.toHaveBeenCalled();
    fireEvent.click(await screen.findByRole('button', { name: 'Download' }));
    await waitFor(() => expect(download).toHaveBeenCalledWith('/vendor/reports/report-1/download'));
    expect(anchorClick).toHaveBeenCalled();
  });

  it('offers prototype report types and loads persisted review rows for replies', async () => {
    const request = vi.spyOn(api, 'request').mockImplementation(async (path) => {
      if (path === '/vendor/reports') return [] as never;
      if (path === '/vendor/report-schedules') return { items: [], deliveryAvailable: false } as never;
      if (path === '/vendor/reviews') return [{ id: 'review-1', reviewerName: 'Maya', rating: 5, comment: 'Wonderful guide', reviewedAt: '2026-11-03T10:00:00Z', productName: 'Sunrise Trek', source: 'MARKETPLACE', vendorReply: null }] as never;
      if (path === '/vendor/reviews/review-1/reply') return {} as never;
      throw new Error(`Unexpected request: ${path}`);
    });

    render(<PartnerReportsPage />);
    const reportSelect = await screen.findByLabelText('Report');
    expect(within(reportSelect).getByRole('option', { name: 'Commission invoices' })).toBeInTheDocument();
    expect(within(reportSelect).getByRole('option', { name: 'TDS & TCS certificates' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Reviews.*Generate report/ })).toBeEnabled();
    expect(await screen.findByText(/New schedules will be saved paused/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Schedule report' })).toBeEnabled();
    expect(await screen.findByText('Wonderful guide')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Reply' })).toBeDisabled();
    fireEvent.change(screen.getByRole('textbox', { name: 'Reply to Maya' }), { target: { value: 'Thank you for joining us!' } });
    fireEvent.click(screen.getByRole('button', { name: 'Reply' }));
    await waitFor(() => expect(request).toHaveBeenCalledWith('/vendor/reviews/review-1/reply', expect.objectContaining({ method: 'PATCH', body: JSON.stringify({ vendorReply: 'Thank you for joining us!' }) })));
    expect(screen.getByText(/Conversion is bookings divided by views/)).toBeInTheDocument();
  });
});

describe('Partner Hub notification preferences', () => {
  it('shows the one-time join link returned by the invitation API', async () => {
    const inviteToken = 'A'.repeat(43);
    const request = vi.spyOn(api, 'request').mockImplementation(async (path, options) => {
      if (path === '/vendor/team' || path === '/vendor/team/invitations' && options?.method !== 'POST') return { members: [], invitations: [] } as never;
      if (path === '/vendor/team/invitations' && options?.method === 'POST') return { inviteToken } as never;
      if (path === '/vendor/notification-preferences') return { bookingEmail: true, bookingWhatsapp: true, bookingSms: true, cancellationEmail: true, cancellationWhatsapp: true, cancellationSms: true, payoutEmail: true, payoutWhatsapp: true, payoutSms: true, documentExpiryEmail: true, documentExpiryWhatsapp: true, documentExpirySms: true, reviewEmail: true, reviewWhatsapp: true, reviewSms: true, twoStepVerification: true, delivery: {} } as never;
      throw new Error(`Unexpected request: ${path}`);
    });

    render(<PartnerSettingsPage />);
    expect(screen.queryByLabelText('Team member email')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '+ Invite team member' }));
    fireEvent.change(await screen.findByLabelText('Team member email'), { target: { value: 'ops@example.com' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send invitation' }));

    const inviteLink = await screen.findByRole('textbox', { name: 'Team invitation link' });
    expect((inviteLink as HTMLInputElement).value).toContain(`/register?teamInvite=${inviteToken}`);
    expect(screen.queryByLabelText('Team member email')).not.toBeInTheDocument();
    expect(request).toHaveBeenCalledWith('/vendor/team/invitations', expect.objectContaining({ method: 'POST', body: JSON.stringify({ email: 'ops@example.com', role: 'VIEWER' }) }));
  });

  it('lets an owner save delivery preferences while showing disconnected provider status', async () => {
    const request = vi.spyOn(api, 'request').mockImplementation(async (path, options) => {
      if (path === '/vendor/team') return { members: [], invitations: [] } as never;
      if (path === '/vendor/notification-preferences' && options?.method === 'PATCH') return {} as never;
      if (path === '/vendor/notification-preferences') return {
        bookingEmail: true, bookingWhatsapp: true, bookingSms: true, cancellationEmail: true, cancellationWhatsapp: true, cancellationSms: true,
        payoutEmail: true, payoutWhatsapp: true, payoutSms: true, documentExpiryEmail: true, documentExpiryWhatsapp: true, documentExpirySms: true,
        reviewEmail: true, reviewWhatsapp: true, reviewSms: true, twoStepVerification: true,
        delivery: { bookingEmail: false, bookingWhatsapp: false, bookingSms: false, cancellationEmail: false, cancellationWhatsapp: false, cancellationSms: false, payoutEmail: false, payoutWhatsapp: false, payoutSms: false, documentExpiryEmail: false, documentExpiryWhatsapp: false, documentExpirySms: false, reviewEmail: false, reviewWhatsapp: false, reviewSms: false },
      } as never;
      throw new Error(`Unexpected request: ${path}`);
    });

    render(<PartnerSettingsPage />);

    const bookingEmail = await screen.findByRole('checkbox', { name: 'Booking updates via Email' });
    expect(bookingEmail).toBeEnabled();
    expect(screen.getAllByText('Not connected').length).toBeGreaterThan(0);
    fireEvent.click(bookingEmail);

    await waitFor(() => expect(request).toHaveBeenCalledWith('/vendor/notification-preferences', expect.objectContaining({ method: 'PATCH' })));
    const patch = request.mock.calls.find(([path, options]) => path === '/vendor/notification-preferences' && options?.method === 'PATCH');
    expect(JSON.parse(String(patch?.[1]?.body))).toMatchObject({ bookingEmail: false });
  });
});
