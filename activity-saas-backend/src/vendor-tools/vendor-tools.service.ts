import { BadRequestException, ForbiddenException, Injectable, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { createHash, randomBytes, randomUUID } from 'crypto';
import { Cron, CronExpression } from '@nestjs/schedule';
import nodemailer from 'nodemailer';
import ExcelJS from 'exceljs';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { PrismaService } from '../prisma/prisma.service';
import { AuthUser } from '../common/auth.types';
import { requireTenant } from '../common/tenant';

type ReportFormat = 'CSV' | 'XLSX' | 'PDF';
type ReportSnapshot = { id: string; name: string; type: string; format: ReportFormat; createdAt: string; status: 'READY'; rows: string[][] };
type ReportExportRequest = { type: string; from?: string; to?: string; format?: string };
type LocationCandidate = { id: string; name: string; address: string; lat: number; lon: number; provider: string; providerPlaceId?: string; sourceUrl?: string };
const REPORT_TYPES = ['BOOKINGS', 'GUEST_MANIFEST', 'PAYOUTS', 'COMMISSION_INVOICES', 'TDS_TCS_CERTIFICATES', 'PRODUCTS', 'PRODUCT_PERFORMANCE', 'REVIEWS', 'CANCELLATIONS'] as const;
const VENDOR_NOTIFICATION_PREFERENCE_KEYS = ['bookingEmail', 'bookingWhatsapp', 'bookingSms', 'cancellationEmail', 'cancellationWhatsapp', 'cancellationSms', 'payoutEmail', 'payoutWhatsapp', 'payoutSms', 'documentExpiryEmail', 'documentExpiryWhatsapp', 'documentExpirySms', 'reviewEmail', 'reviewWhatsapp', 'reviewSms', 'twoStepVerification'] as const;

const DEFAULT_TAXONOMY = [
  ['DAY_TOURS_SIGHTSEEING', 'Day tours & sightseeing', ['CITY_TOURS', 'SIGHTSEEING']],
  ['THEME_WATER_PARKS', 'Theme & water parks', ['WATER_PARK', 'THEME_PARK']],
  ['AMUSEMENT_PARKS', 'Amusement parks', ['AMUSEMENT_PARK', 'FAMILY_ENTERTAINMENT']],
  ['MONUMENTS_MUSEUMS', 'Monuments & museums', ['MONUMENT', 'MUSEUM']],
  ['ADVENTURE_WATER_SPORTS', 'Adventure & water sports', ['ADVENTURE', 'WATER_SPORTS']],
  ['CRUISES_FERRIES', 'Cruises & ferries', ['CRUISE', 'FERRY']],
  ['CAMPING_TREKS', 'Camping & treks', ['CAMPING', 'TREKKING']],
] as const;

@Injectable()
export class VendorToolsService {
  constructor(private readonly prisma: PrismaService) {}

  private requireVendorOwner(user: AuthUser) {
    const tenantId = requireTenant(user);
    if (user.organizationRole !== 'OWNER') throw new ForbiddenException('Only workspace owners can change team membership or account-wide notification settings.');
    return tenantId;
  }

  private reportDeliveryAvailable() {
    return String(process.env.VENDOR_REPORT_SCHEDULER_ENABLED || '').toLowerCase() === 'true'
      && Boolean(process.env.SMTP_HOST?.trim() && process.env.SMTP_USER?.trim() && process.env.SMTP_PASSWORD);
  }

  async listActivityCategories() {
    const count = await this.prisma.activityCategory.count();
    if (!count) {
      for (const [code, name, subcategories] of DEFAULT_TAXONOMY) {
        await this.prisma.activityCategory.create({ data: { code, name, displayOrder: DEFAULT_TAXONOMY.findIndex((item) => item[0] === code), subcategories: { create: subcategories.map((subCode, index) => ({ code: subCode, name: subCode.replaceAll('_', ' ').toLowerCase().replace(/(^| )\w/g, (letter) => letter.toUpperCase()), displayOrder: index })) } } });
      }
    }
    return this.prisma.activityCategory.findMany({ where: { active: true }, orderBy: { displayOrder: 'asc' }, include: { subcategories: { where: { active: true }, orderBy: { displayOrder: 'asc' } } } });
  }

  async searchLocations(user: AuthUser, query: string): Promise<LocationCandidate[]> {
    requireTenant(user);
    const q = String(query || '').trim();
    if (q.length < 3) throw new BadRequestException('Enter at least three characters to search for a location.');
    const key = process.env.GOOGLE_PLACES_API_KEY || process.env.GOOGLE_MAPS_API_KEY;
    if (key) {
      const response = await fetch(`https://maps.googleapis.com/maps/api/place/textsearch/json?query=${encodeURIComponent(q)}&key=${encodeURIComponent(key)}`);
      if (!response.ok) throw new ServiceUnavailableException('Google location search is unavailable.');
      const payload = await response.json() as { results?: Array<{ place_id: string; name: string; formatted_address: string; geometry?: { location?: { lat: number; lng: number } } }>; status?: string };
      if (payload.status && !['OK', 'ZERO_RESULTS'].includes(payload.status)) throw new ServiceUnavailableException(`Google location search failed: ${payload.status}.`);
      return (payload.results || []).flatMap((item) => item.geometry?.location ? [{ id: item.place_id, name: item.name, address: item.formatted_address, lat: item.geometry.location.lat, lon: item.geometry.location.lng, provider: 'GOOGLE_PLACES', providerPlaceId: item.place_id, sourceUrl: `https://www.google.com/maps/search/?api=1&query=Google&query_place_id=${encodeURIComponent(item.place_id)}` }] : []);
    }
    const response = await fetch(`https://nominatim.openstreetmap.org/search?format=jsonv2&addressdetails=1&limit=5&q=${encodeURIComponent(q)}`, { headers: { 'User-Agent': 'VOYA-Vendor-Portal/1.0 location search' } });
    if (!response.ok) throw new ServiceUnavailableException('Location search is unavailable. Configure GOOGLE_PLACES_API_KEY for production.');
    const payload = await response.json() as Array<{ place_id: number; display_name: string; lat: string; lon: string }>;
    return payload.flatMap((item) => { const lat = Number(item.lat); const lon = Number(item.lon); return Number.isFinite(lat) && Number.isFinite(lon) ? [{ id: String(item.place_id), name: item.display_name.split(',')[0], address: item.display_name, lat, lon, provider: 'OPENSTREETMAP_NOMINATIM', sourceUrl: `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lon}#map=18/${lat}/${lon}` }] : []; });
  }

  async saveLocation(user: AuthUser, input: Record<string, unknown>) {
    const tenantId = requireTenant(user); const revisionId = String(input.productRevisionId || '');
    const revision = await this.prisma.productRevision.findFirst({ where: { id: revisionId, product: { tenantId } }, select: { id: true } });
    if (!revision) throw new NotFoundException('Product revision not found in this vendor workspace.');
    const lat = input.lat == null || input.lat === '' ? null : Number(input.lat); const lon = input.lon == null || input.lon === '' ? null : Number(input.lon);
    if ((lat !== null && !Number.isFinite(lat)) || (lon !== null && !Number.isFinite(lon))) throw new BadRequestException('Latitude and longitude must be valid numbers.');
    return this.prisma.productLocationVerification.upsert({ where: { productRevisionId: revisionId }, update: { address: String(input.address || '') || null, lat, lon, meetingPoint: String(input.meetingPoint || '') || null, provider: String(input.provider || '') || null, providerPlaceId: String(input.providerPlaceId || '') || null, sourceUrl: String(input.sourceUrl || '') || null, verifiedAt: input.verifiedAt ? new Date(String(input.verifiedAt)) : new Date() }, create: { productRevisionId: revisionId, address: String(input.address || '') || null, lat, lon, meetingPoint: String(input.meetingPoint || '') || null, provider: String(input.provider || '') || null, providerPlaceId: String(input.providerPlaceId || '') || null, sourceUrl: String(input.sourceUrl || '') || null, verifiedAt: input.verifiedAt ? new Date(String(input.verifiedAt)) : new Date() } });
  }

  async listItinerary(user: AuthUser, revisionId: string) {
    const tenantId = requireTenant(user);
    const revision = await this.prisma.productRevision.findFirst({ where: { id: revisionId, product: { tenantId } }, select: { id: true } });
    if (!revision) throw new NotFoundException('Product revision not found in this vendor workspace.');
    return this.prisma.itineraryStop.findMany({ where: { productRevisionId: revisionId }, orderBy: { sequence: 'asc' } });
  }

  async replaceItinerary(user: AuthUser, revisionId: string, input: Record<string, unknown>) {
    const tenantId = requireTenant(user);
    const revision = await this.prisma.productRevision.findFirst({ where: { id: revisionId, product: { tenantId } }, select: { id: true } });
    if (!revision) throw new NotFoundException('Product revision not found in this vendor workspace.');
    const rawStops = Array.isArray(input.stops) ? input.stops : [];
    const stops = rawStops.map((raw, index) => {
      const item = raw as Record<string, unknown>;
      const stopName = String(item.stopName || '').trim();
      if (!stopName) throw new BadRequestException(`Itinerary stop ${index + 1} needs a name.`);
      const positiveInt = (value: unknown) => value == null || value === '' ? null : Math.max(0, Math.round(Number(value)));
      const rawStopType = String(item.stopType || 'guided').trim(); const normalizedStopType = ['MEETING_POINT', 'ACTIVITY', 'MEAL', 'TRANSFER', 'ATTRACTION', 'FREE_TIME'].includes(rawStopType.toUpperCase()) ? rawStopType.toUpperCase() : rawStopType.toLowerCase();
      return { productRevisionId: revisionId, sequence: index + 1, stopName, stopType: normalizedStopType, stayDurationMinutes: positiveInt(item.stayDurationMinutes), travelTimeToNextMinutes: positiveInt(item.travelTimeToNextMinutes), ticketPolicy: String(item.ticketPolicy || '').trim() || null, replacementStop: String(item.replacementStop || '').trim() || null };
    });
    if (stops.some((stop) => (stop.stayDurationMinutes !== null && !Number.isFinite(stop.stayDurationMinutes)) || (stop.travelTimeToNextMinutes !== null && !Number.isFinite(stop.travelTimeToNextMinutes)))) throw new BadRequestException('Itinerary durations must be valid numbers.');
    await this.prisma.$transaction([this.prisma.itineraryStop.deleteMany({ where: { productRevisionId: revisionId } }), ...(stops.length ? [this.prisma.itineraryStop.createMany({ data: stops })] : [])]);
    return this.listItinerary(user, revisionId);
  }

  async listTeam(user: AuthUser) {
    const tenantId = requireTenant(user);
    const [members, invitations] = await Promise.all([this.prisma.user.findMany({ where: { tenantId, role: 'VENDOR' }, select: { id: true, email: true, fullName: true, organizationRole: true, active: true, lastLoginAt: true, createdAt: true } }), this.prisma.vendorTeamInvitation.findMany({ where: { tenantId }, orderBy: { createdAt: 'desc' } })]);
    return { members, invitations };
  }

  async updateTeamMember(user: AuthUser, id: string, input: Record<string, unknown>) {
    const tenantId = this.requireVendorOwner(user);
    const updates: { active?: boolean; organizationRole?: any } = {};
    if (typeof input.active === 'boolean') updates.active = input.active;
    if (input.organizationRole !== undefined) {
      const role = String(input.organizationRole).toUpperCase();
      if (!['OWNER', 'CATALOGUE', 'OPERATIONS', 'FINANCE', 'VIEWER'].includes(role)) throw new BadRequestException('Invalid workspace role.');
      if (id === user.sub) throw new BadRequestException('You cannot change your own workspace role.');
      updates.organizationRole = role;
    }
    if (updates.active === undefined && updates.organizationRole === undefined) throw new BadRequestException('Provide active or organizationRole.');
    if (id === user.sub && updates.active === false) throw new BadRequestException('You cannot deactivate your own account.');
    const member = await this.prisma.user.findFirst({ where: { id, tenantId, role: 'VENDOR' }, select: { id: true } });
    if (!member) throw new NotFoundException('Team member not found in this vendor workspace.');
    return this.prisma.user.update({ where: { id }, data: updates, select: { id: true, email: true, fullName: true, organizationRole: true, active: true, lastLoginAt: true, createdAt: true } });
  }

  async inviteTeamMember(user: AuthUser, input: Record<string, unknown>) {
    const tenantId = this.requireVendorOwner(user); const email = String(input.email || '').trim().toLowerCase(); const role = String(input.role || 'VIEWER').toUpperCase();
    if (!/^\S+@\S+\.\S+$/.test(email) || !['OWNER', 'CATALOGUE', 'OPERATIONS', 'FINANCE', 'VIEWER'].includes(role)) throw new BadRequestException('Provide a valid email and organization role.');
    const existing = await this.prisma.user.findFirst({ where: { tenantId, email }, select: { id: true } });
    if (existing) throw new BadRequestException('That email already belongs to this workspace.');
    const inviteToken = randomBytes(32).toString('base64url');
    const tokenHash = createHash('sha256').update(inviteToken).digest('hex');
    const invitation = await this.prisma.vendorTeamInvitation.upsert({ where: { tenantId_email: { tenantId, email } }, update: { role: role as any, status: 'INVITED', tokenHash, acceptedAt: null, expiresAt: new Date(Date.now() + 7 * 86400000) }, create: { tenantId, email, role: role as any, tokenHash, expiresAt: new Date(Date.now() + 7 * 86400000) } });
    return { ...invitation, inviteToken };
  }

  async updateTeamInvitation(user: AuthUser, id: string, input: Record<string, unknown>) {
    const tenantId = this.requireVendorOwner(user); const invitation = await this.prisma.vendorTeamInvitation.findFirst({ where: { id, tenantId } });
    if (!invitation) throw new NotFoundException('Invitation not found.');
    const status = String(input.status || '').toUpperCase(); if (!['INVITED', 'ACTIVE', 'DISABLED', 'EXPIRED'].includes(status)) throw new BadRequestException('Invalid invitation status.');
    return this.prisma.vendorTeamInvitation.update({ where: { id }, data: { status } });
  }

  async getNotificationPreferences(user: AuthUser) {
    const tenantId = requireTenant(user);
    const setting = await this.prisma.globalSetting.findFirst({ where: { tenantId, key: 'vendor_notification_preferences' }, select: { value: true } });
    const value = setting?.value && typeof setting.value === 'object' ? setting.value as Record<string, unknown> : {};
    const smtpConfigured = Boolean(process.env.SMTP_HOST?.trim() && process.env.SMTP_USER?.trim() && process.env.SMTP_PASSWORD);
    return {
      ...Object.fromEntries(VENDOR_NOTIFICATION_PREFERENCE_KEYS.map((key) => [key, value[key] !== false])),
      delivery: Object.fromEntries(VENDOR_NOTIFICATION_PREFERENCE_KEYS.filter((key) => key !== 'twoStepVerification').map((key) => [key, smtpConfigured && (key === 'bookingEmail' || key === 'cancellationEmail' || key === 'payoutEmail')])),
    };
  }

  async updateNotificationPreferences(user: AuthUser, input: Record<string, unknown>) {
    const tenantId = this.requireVendorOwner(user);
    const existing = await this.prisma.globalSetting.findFirst({ where: { tenantId, key: 'vendor_notification_preferences' }, select: { id: true, value: true } });
    const previous = existing?.value && typeof existing.value === 'object' ? existing.value as Record<string, unknown> : {};
    const value = Object.fromEntries(VENDOR_NOTIFICATION_PREFERENCE_KEYS.map((key) => [key, typeof input[key] === 'boolean' ? input[key] : previous[key] !== false]));
    if (existing) await this.prisma.globalSetting.update({ where: { id: existing.id }, data: { value } });
    else await this.prisma.globalSetting.create({ data: { tenantId, key: 'vendor_notification_preferences', value } });
    return value;
  }

  async listReportSchedules(user: AuthUser) {
    const items = await this.prisma.reportSchedule.findMany({ where: { tenantId: requireTenant(user) }, orderBy: { createdAt: 'desc' } });
    return { items, deliveryAvailable: this.reportDeliveryAvailable() };
  }

  async listReports(user: AuthUser) {
    const tenantId = requireTenant(user);
    const rows = await this.prisma.vendorReportExport.findMany({ where: { tenantId }, orderBy: { createdAt: 'desc' }, take: 20 });
    if (rows.length) return rows.map(({ rows: _data, ...report }) => ({ ...report, downloadUrl: `/api/vendor/reports/${report.id}/download` }));
    // Read pre-migration exports until tenants have generated their first normalized export.
    return (await this.readReports(tenantId)).map(({ rows: _data, ...report }) => ({ ...report, downloadUrl: `/api/vendor/reports/${report.id}/download` }));
  }

  async enqueueReport(user: AuthUser, input: ReportExportRequest) {
    const tenantId = requireTenant(user);
    const normalized = String(input.type || '').toUpperCase();
    if (!REPORT_TYPES.includes(normalized as typeof REPORT_TYPES[number])) throw new BadRequestException('Unsupported report type.');
    const format = String(input.format || 'CSV').toUpperCase();
    if (!['CSV', 'XLSX', 'PDF'].includes(format)) throw new BadRequestException('Unsupported report format.');
    const fromDate = input.from ? new Date(input.from) : null;
    const toDate = input.to ? new Date(input.to) : null;
    if (toDate && /^\d{4}-\d{2}-\d{2}$/.test(String(input.to))) toDate.setUTCHours(23, 59, 59, 999);
    if ((fromDate && Number.isNaN(fromDate.getTime())) || (toDate && Number.isNaN(toDate.getTime())) || (fromDate && toDate && toDate < fromDate)) throw new BadRequestException('Report date range is invalid.');
    const name = normalized === 'COMMISSION_INVOICES' ? 'Commission and settlement report' : `${normalized[0] + normalized.slice(1).toLowerCase()} report`;
    const report = await this.prisma.vendorReportExport.create({ data: { tenantId, name, type: normalized, format, fromDate, toDate, status: 'PENDING' } });
    void this.processReportExport(report.id, tenantId).catch(() => undefined);
    const { rows: _rows, error: _error, ...publicReport } = report;
    return { ...publicReport, downloadUrl: `/api/vendor/reports/${report.id}/download` };
  }

  @Cron('*/10 * * * * *')
  async resumePendingReportExports() {
    const pending = await this.prisma.vendorReportExport.findMany({ where: { status: 'PENDING' }, select: { id: true, tenantId: true }, orderBy: { createdAt: 'asc' }, take: 10 });
    for (const report of pending) await this.processReportExport(report.id, report.tenantId);
  }

  private async processReportExport(id: string, tenantId: string) {
    const claim = await this.prisma.vendorReportExport.updateMany({ where: { id, tenantId, status: 'PENDING' }, data: { status: 'PROCESSING', startedAt: new Date(), error: null } });
    if (!claim.count) return;
    try {
      const queued = await this.prisma.vendorReportExport.findFirst({ where: { id, tenantId }, select: { type: true, format: true, fromDate: true, toDate: true } });
      if (!queued) return;
      const workerUser = { tenantId, sub: 'report-export-worker', role: 'VENDOR' } as AuthUser;
      const snapshot = await this.createReport(workerUser, { type: queued.type, format: queued.format, from: queued.fromDate?.toISOString(), to: queued.toDate?.toISOString() });
      await this.prisma.vendorReportExport.update({ where: { id }, data: { status: 'READY', rows: snapshot.rows, completedAt: new Date() } });
    } catch {
      await this.prisma.vendorReportExport.update({ where: { id }, data: { status: 'FAILED', error: 'Report generation failed. Please retry.', completedAt: new Date() } });
    }
  }

  async createReportSchedule(user: AuthUser, input: Record<string, unknown>) {
    const tenantId = requireTenant(user); const reportName = String(input.reportName || '').trim(); const reportType = String(input.reportType || '').toUpperCase(); const frequency = String(input.frequency || '').toUpperCase(); const recipient = String(input.recipient || '').trim(); const runTime = String(input.runTime || '').trim();
    if (!reportName || !REPORT_TYPES.includes(reportType as typeof REPORT_TYPES[number]) || !['DAILY', 'WEEKLY', 'MONTHLY'].includes(frequency) || !/^\S+@\S+\.\S+$/.test(recipient) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(runTime)) throw new BadRequestException('Provide a valid report name, type, frequency, email recipient and 24-hour run time.');
    return this.prisma.reportSchedule.create({ data: { tenantId, reportName, reportType, frequency, recipient, runTime, status: this.reportDeliveryAvailable() ? 'ACTIVE' : 'PAUSED' } });
  }

  @Cron(CronExpression.EVERY_MINUTE)
  async dispatchScheduledReports() {
    if (!this.reportDeliveryAvailable()) return;
    const smtpHost = process.env.SMTP_HOST?.trim(); const smtpUser = process.env.SMTP_USER?.trim(); const smtpPassword = process.env.SMTP_PASSWORD;
    const now = new Date();
    const parts = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit', weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(now);
    const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === type)?.value || '';
    const localDate = `${part('year')}-${part('month')}-${part('day')}`; const localTime = `${part('hour')}:${part('minute')}`; const weekday = part('weekday'); const dayOfMonth = Number(part('day'));
    const schedules = await this.prisma.reportSchedule.findMany({ where: { status: 'ACTIVE', runTime: localTime }, orderBy: { createdAt: 'asc' } });
    const transporter = nodemailer.createTransport({ host: smtpHost, port: Number(process.env.SMTP_PORT || 587), secure: String(process.env.SMTP_SECURE || '').toLowerCase() === 'true' || Number(process.env.SMTP_PORT || 587) === 465, auth: { user: smtpUser, pass: smtpPassword } });
    for (const schedule of schedules) {
      if ((schedule.frequency === 'WEEKLY' && weekday !== 'Mon') || (schedule.frequency === 'MONTHLY' && dayOfMonth !== 1)) continue;
      if (schedule.lastRunAt) {
        const lastRunParts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(schedule.lastRunAt);
        const lastRunDate = `${lastRunParts.find((item) => item.type === 'year')?.value}-${lastRunParts.find((item) => item.type === 'month')?.value}-${lastRunParts.find((item) => item.type === 'day')?.value}`;
        if (lastRunDate === localDate) continue;
      }
      try {
        const from = new Date(now); from.setUTCDate(from.getUTCDate() - (schedule.frequency === 'DAILY' ? 1 : schedule.frequency === 'WEEKLY' ? 7 : 30));
        const workerUser = { tenantId: schedule.tenantId, sub: 'scheduled-report-worker', role: 'VENDOR' } as AuthUser;
        const report = await this.createReport(workerUser, { type: schedule.reportType, from: from.toISOString(), to: now.toISOString(), format: 'CSV' });
        await this.prisma.vendorReportExport.upsert({
          where: { id: report.id },
          create: { id: report.id, tenantId: schedule.tenantId, name: report.name, type: report.type, format: report.format, fromDate: from, toDate: now, status: 'READY', rows: report.rows, startedAt: now, completedAt: now },
          update: { status: 'READY', rows: report.rows, error: null, completedAt: now },
        });
        const attachment = await this.downloadReport(workerUser, report.id);
        await transporter.sendMail({ from: { name: process.env.SMTP_FROM_NAME?.trim() || 'Voya', address: process.env.SMTP_FROM_EMAIL?.trim() || smtpUser }, to: schedule.recipient, subject: `${schedule.reportName} · ${localDate}`, text: `Your scheduled ${schedule.frequency.toLowerCase()} report is attached.`, attachments: [{ filename: attachment.filename, content: attachment.body, contentType: attachment.contentType }] });
        await this.prisma.reportSchedule.update({ where: { id: schedule.id }, data: { lastRunAt: now } });
      } catch (error) {
        console.error('Scheduled vendor report delivery failed', { scheduleId: schedule.id, message: error instanceof Error ? error.message : String(error) });
      }
    }
  }

  async updateReportSchedule(user: AuthUser, id: string, input: Record<string, unknown>) {
    const tenantId = requireTenant(user); const schedule = await this.prisma.reportSchedule.findFirst({ where: { id, tenantId }, select: { id: true } }); if (!schedule) throw new NotFoundException('Report schedule not found.');
    const status = String(input.status || '').toUpperCase(); if (!['ACTIVE', 'PAUSED'].includes(status)) throw new BadRequestException('Invalid report schedule status.');
    if (status === 'ACTIVE' && !this.reportDeliveryAvailable()) throw new ServiceUnavailableException('Scheduled report delivery is unavailable until the scheduler and email delivery are configured.');
    return this.prisma.reportSchedule.update({ where: { id }, data: { status } });
  }

  async listPromotions(user: AuthUser) {
    const tenantId = requireTenant(user);
    const rows = await this.prisma.promotion.findMany({ where: { product: { tenantId } }, include: { product: { include: { currentRevision: { select: { productName: true } } } } }, orderBy: [{ active: 'desc' }, { startsAt: 'desc' }] });
    return Promise.all(rows.map(async (row) => {
      const impact = await this.prisma.$queryRaw<Array<{ bookings: bigint | number; sales: string | number | null }>>`SELECT COUNT(*)::bigint AS "bookings", COALESCE(SUM(s."finalAmount"), 0)::text AS "sales" FROM "BookingEconomicsSnapshot" s JOIN "Booking" b ON b."id" = s."bookingId" WHERE s."promotionContext"->>'vendorPromotionId' = ${row.id} AND b."productId" = ${row.productId}`;
      return { id: row.id, name: row.name, productId: row.productId, productName: row.product.currentRevision?.productName || row.product.productCode, promotionType: row.promotionType, discountPercent: Number(row.discountPercent), discountAmount: row.discountAmount == null ? null : Number(row.discountAmount), conditionValue: row.conditionValue, startsAt: row.startsAt, endsAt: row.endsAt, bookingStartsAt: row.bookingStartsAt, bookingEndsAt: row.bookingEndsAt, validWeekdays: row.validWeekdays, stackWithPlatform: row.stackWithPlatform, fundingOwner: row.fundingOwner, maxDiscountedBookings: row.maxDiscountedBookings, bookings: Number(impact[0]?.bookings || 0), sales: Number(impact[0]?.sales || 0), impactTrackingAvailable: true, active: row.active, draft: row.draft };
    }));
  }

  async createPromotion(user: AuthUser, input: Record<string, unknown>) {
    const tenantId = requireTenant(user);
    const productIds = Array.isArray(input.productIds) ? [...new Set(input.productIds.map(String).filter(Boolean))] : input.productId ? [String(input.productId)] : [];
    const draft = Boolean(input.draft);
    const name = String(input.name || '').trim() || (draft ? 'Untitled promotion' : '');
    const promotionType = String(input.promotionType || 'PERCENTAGE_OFF').toUpperCase();
    const discountPercent = Number(input.discountPercent || 0);
    const discountAmount = input.discountAmount == null || input.discountAmount === '' ? null : Number(input.discountAmount);
    const conditionValue = input.conditionValue == null || input.conditionValue === '' ? null : Number(input.conditionValue);
    const startsAtInput = String(input.startsAt || '');
    const endsAtInput = String(input.endsAt || '');
    const startsAt = startsAtInput ? new Date(startsAtInput) : null;
    const endsAt = endsAtInput ? new Date(endsAtInput) : null;
    if (endsAt && /^\d{4}-\d{2}-\d{2}$/.test(endsAtInput)) endsAt.setUTCHours(23, 59, 59, 999);
    const bookingStartsAtInput = String(input.bookingStartsAt || '');
    const bookingEndsAtInput = String(input.bookingEndsAt || '');
    const bookingStartsAt = bookingStartsAtInput ? new Date(bookingStartsAtInput) : null;
    const bookingEndsAt = bookingEndsAtInput ? new Date(bookingEndsAtInput) : null;
    if (bookingEndsAt && /^\d{4}-\d{2}-\d{2}$/.test(bookingEndsAtInput)) bookingEndsAt.setUTCHours(23, 59, 59, 999);
    const validWeekdays = Array.isArray(input.validWeekdays) ? input.validWeekdays.map(String) : [];
    const requiresCondition = ['EARLY_BIRD', 'LAST_MINUTE', 'GROUP_DISCOUNT'].includes(promotionType);
    const maxDiscountedBookings = input.maxDiscountedBookings == null || input.maxDiscountedBookings === '' ? null : Number(input.maxDiscountedBookings);
    const supportedType = ['PERCENTAGE_OFF', 'FLAT_OFF', 'EARLY_BIRD', 'LAST_MINUTE', 'GROUP_DISCOUNT'].includes(promotionType);
    const invalidDiscount = promotionType === 'FLAT_OFF'
      ? (draft ? (discountAmount != null && (!Number.isFinite(discountAmount) || discountAmount < 0)) : (!Number.isFinite(discountAmount) || (discountAmount as number) <= 0))
      : (draft ? (!Number.isFinite(discountPercent) || discountPercent < 0 || discountPercent > 100) : (!Number.isFinite(discountPercent) || discountPercent <= 0 || discountPercent > 100));
    const datesInvalid = (startsAt && Number.isNaN(startsAt.getTime())) || (endsAt && Number.isNaN(endsAt.getTime())) || (startsAt && endsAt && endsAt <= startsAt);
    const conditionInvalid = requiresCondition && (draft ? conditionValue != null && (!Number.isInteger(conditionValue) || conditionValue < 1) : (!Number.isInteger(conditionValue) || (conditionValue as number) < 1));
    if (!productIds.length || !supportedType || invalidDiscount || datesInvalid || (!draft && (!name || !startsAt || !endsAt)) || conditionInvalid || (maxDiscountedBookings != null && (!Number.isInteger(maxDiscountedBookings) || maxDiscountedBookings < 1)) || (bookingStartsAt && Number.isNaN(bookingStartsAt.getTime())) || (bookingEndsAt && Number.isNaN(bookingEndsAt.getTime())) || (bookingStartsAt && bookingEndsAt && bookingEndsAt <= bookingStartsAt) || validWeekdays.some((day) => !['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'].includes(day))) throw new BadRequestException('Choose a product and provide valid promotion details. Published promotions require a discount and activity date range.');
    const products = await this.prisma.product.findMany({ where: { id: { in: productIds }, tenantId }, select: { id: true } });
    if (products.length !== productIds.length) throw new NotFoundException('One or more products were not found in this vendor workspace.');
    const overlap = draft || !startsAt || !endsAt ? null : await this.prisma.promotion.findFirst({ where: { productId: { in: productIds }, active: true, draft: false, startsAt: { lt: endsAt }, endsAt: { gt: startsAt } }, select: { id: true } });
    if (overlap) throw new BadRequestException('An active promotion already overlaps this product and activity window.');
    const rows = await this.prisma.$transaction(productIds.map((productId) => this.prisma.promotion.create({ data: { productId, name, promotionType, discountPercent: promotionType === 'FLAT_OFF' ? 0 : discountPercent, discountAmount, conditionValue, startsAt, endsAt, bookingStartsAt, bookingEndsAt, validWeekdays, stackWithPlatform: Boolean(input.stackWithPlatform), fundingOwner: 'SUPPLIER', maxDiscountedBookings, draft, active: !draft } })));
    return { ids: rows.map((row) => row.id) };
  }

  async updatePromotion(user: AuthUser, id: string, input: Record<string, unknown>) {
    const tenantId = requireTenant(user);
    const existing = await this.prisma.promotion.findFirst({ where: { id, product: { tenantId } }, select: { id: true, productId: true, draft: true, startsAt: true, endsAt: true } });
    if (!existing) throw new NotFoundException('Promotion not found.');
    if (typeof input.active === 'boolean') {
      if (input.active && existing.draft) throw new BadRequestException('Edit and complete the promotion draft before publishing it.');
      if (input.active && existing.startsAt && existing.endsAt) {
        const overlap = await this.prisma.promotion.findFirst({ where: { id: { not: id }, productId: existing.productId, active: true, draft: false, startsAt: { lt: existing.endsAt }, endsAt: { gt: existing.startsAt } }, select: { id: true } });
        if (overlap) throw new BadRequestException('An active promotion already overlaps this product and activity window.');
      }
      return this.prisma.promotion.update({ where: { id }, data: { active: input.active }, select: { id: true, active: true, draft: true } });
    }
    if (!existing.draft) throw new BadRequestException('Only draft promotions can be edited.');
    const active = input.draft === false;
    const name = String(input.name || '').trim() || (active ? '' : 'Untitled promotion');
    const promotionType = String(input.promotionType || '').toUpperCase();
    const discountPercent = Number(input.discountPercent || 0);
    const discountAmount = input.discountAmount == null || input.discountAmount === '' ? null : Number(input.discountAmount);
    const conditionValue = input.conditionValue == null || input.conditionValue === '' ? null : Number(input.conditionValue);
    const startsAtInput = String(input.startsAt || '');
    const endsAtInput = String(input.endsAt || '');
    const startsAt = startsAtInput ? new Date(startsAtInput) : null;
    const endsAt = endsAtInput ? new Date(endsAtInput) : null;
    if (endsAt && /^\d{4}-\d{2}-\d{2}$/.test(endsAtInput)) endsAt.setUTCHours(23, 59, 59, 999);
    const bookingStartsAt = input.bookingStartsAt ? new Date(String(input.bookingStartsAt)) : null;
    const bookingEndsAt = input.bookingEndsAt ? new Date(String(input.bookingEndsAt)) : null;
    if (bookingEndsAt && /^\d{4}-\d{2}-\d{2}$/.test(String(input.bookingEndsAt))) bookingEndsAt.setUTCHours(23, 59, 59, 999);
    const validWeekdays = Array.isArray(input.validWeekdays) ? input.validWeekdays.map(String) : [];
    const conditionRequired = ['EARLY_BIRD', 'LAST_MINUTE', 'GROUP_DISCOUNT'].includes(promotionType);
    const maxDiscountedBookings = input.maxDiscountedBookings == null || input.maxDiscountedBookings === '' ? null : Number(input.maxDiscountedBookings);
    const invalidDiscount = promotionType === 'FLAT_OFF'
      ? (active ? (!Number.isFinite(discountAmount) || (discountAmount as number) <= 0) : discountAmount != null && (!Number.isFinite(discountAmount) || discountAmount < 0))
      : (active ? (!Number.isFinite(discountPercent) || discountPercent <= 0 || discountPercent > 100) : (!Number.isFinite(discountPercent) || discountPercent < 0 || discountPercent > 100));
    const datesInvalid = (startsAt && Number.isNaN(startsAt.getTime())) || (endsAt && Number.isNaN(endsAt.getTime())) || (startsAt && endsAt && endsAt <= startsAt);
    const conditionInvalid = conditionRequired && (active ? (!Number.isInteger(conditionValue) || (conditionValue as number) < 1) : conditionValue != null && (!Number.isInteger(conditionValue) || conditionValue < 1));
    if (!name || !['PERCENTAGE_OFF', 'FLAT_OFF', 'EARLY_BIRD', 'LAST_MINUTE', 'GROUP_DISCOUNT'].includes(promotionType) || invalidDiscount || datesInvalid || (active && (!startsAt || !endsAt)) || conditionInvalid || (maxDiscountedBookings != null && (!Number.isInteger(maxDiscountedBookings) || maxDiscountedBookings < 1)) || (bookingStartsAt && Number.isNaN(bookingStartsAt.getTime())) || (bookingEndsAt && Number.isNaN(bookingEndsAt.getTime())) || (bookingStartsAt && bookingEndsAt && bookingEndsAt <= bookingStartsAt) || validWeekdays.some((day) => !['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'].includes(day))) throw new BadRequestException('Choose a product and provide valid promotion details. Published promotions require a discount and activity date range.');
    if (active && startsAt && endsAt) {
      const overlap = await this.prisma.promotion.findFirst({ where: { id: { not: id }, productId: existing.productId, active: true, draft: false, startsAt: { lt: endsAt }, endsAt: { gt: startsAt } }, select: { id: true } });
      if (overlap) throw new BadRequestException('An active promotion already overlaps this product and activity window.');
    }
    return this.prisma.promotion.update({ where: { id }, data: { name, promotionType, discountPercent: promotionType === 'FLAT_OFF' ? 0 : discountPercent, discountAmount, conditionValue, startsAt, endsAt, bookingStartsAt, bookingEndsAt, validWeekdays, stackWithPlatform: Boolean(input.stackWithPlatform), maxDiscountedBookings, draft: !active, active } });
  }

  private async readReports(tenantId: string): Promise<ReportSnapshot[]> {
    const setting = await this.prisma.globalSetting.findFirst({ where: { tenantId, key: 'vendor_reports' }, select: { value: true } });
    const value = setting?.value;
    return value && typeof value === 'object' && Array.isArray((value as { reports?: unknown }).reports) ? (value as { reports: ReportSnapshot[] }).reports : [];
  }

  private async writeReports(tenantId: string, reports: ReportSnapshot[]) {
    const existing = await this.prisma.globalSetting.findFirst({ where: { tenantId, key: 'vendor_reports' }, select: { id: true } });
    if (existing) return this.prisma.globalSetting.update({ where: { id: existing.id }, data: { value: { reports } } });
    return this.prisma.globalSetting.create({ data: { tenantId, key: 'vendor_reports', value: { reports } } });
  }

  async createReport(user: AuthUser, input: { type: string; from?: string; to?: string; format?: string }) {
    const tenantId = requireTenant(user); const normalized = String(input.type || '').toUpperCase();
    if (!REPORT_TYPES.includes(normalized as typeof REPORT_TYPES[number])) throw new BadRequestException('Unsupported report type.');
    const format = String(input.format || 'CSV').toUpperCase();
    if (!['CSV', 'XLSX', 'PDF'].includes(format)) throw new BadRequestException('Unsupported report format.');
    const from = input.from ? new Date(input.from) : null; const to = input.to ? new Date(input.to) : null;
    // Date inputs from the reports form are calendar dates. Include the full final day.
    if (to && /^\d{4}-\d{2}-\d{2}$/.test(String(input.to))) to.setUTCHours(23, 59, 59, 999);
    if ((from && Number.isNaN(from.getTime())) || (to && Number.isNaN(to.getTime())) || (from && to && to < from)) throw new BadRequestException('Report date range is invalid.');
    const serviceDate = from || to ? { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } : undefined;
    const rows: string[][] = [];
    if (normalized === 'BOOKINGS') {
      const bookings = await this.prisma.booking.findMany({ where: { vendorTenantId: tenantId, ...(serviceDate ? { serviceDate } : {}) }, orderBy: { serviceDate: 'desc' }, take: 500, include: { product: { select: { productCode: true, currentRevision: { select: { productName: true } } } } } });
      rows.push(['Booking', 'Product', 'Service date', 'Status', 'Pax', 'Amount']);
      for (const booking of bookings) rows.push([booking.bookingCode, booking.product.currentRevision?.productName || booking.product.productCode, booking.serviceDate.toISOString().slice(0, 10), booking.status, String(booking.pax), String(booking.amount)]);
    } else if (normalized === 'PRODUCTS') {
      const products = await this.prisma.product.findMany({ where: { tenantId }, orderBy: { updatedAt: 'desc' }, include: { currentRevision: { select: { productName: true, cityName: true } } } });
      rows.push(['Product code', 'Name', 'Destination', 'Status', 'Updated']);
      for (const product of products) rows.push([product.productCode, product.currentRevision?.productName || '', product.currentRevision?.cityName || '', product.status, product.updatedAt.toISOString()]);
    } else if (normalized === 'PAYOUTS') {
      const payoutProductInclude = { select: { productCode: true, currentRevision: { select: { productName: true } } } };
      const batches = await this.prisma.settlementBatch.findMany({
        where: { vendorTenantId: tenantId, ...(from || to ? { createdAt: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } } : {}) },
        orderBy: { createdAt: 'desc' }, take: 500,
        include: { lines: { include: { booking: { include: { product: payoutProductInclude } } } } },
      });
      rows.push(['Payout batch', 'Activity period', 'Booking', 'Product', 'Currency', 'Gross booking value', 'Adjustments', 'Net payout', 'Status']);
      for (const batch of batches) for (const line of batch.lines) rows.push([batch.batchCode, `${batch.periodFrom?.toISOString().slice(0, 10) || ''} – ${batch.periodTo?.toISOString().slice(0, 10) || ''}`, line.booking?.bookingCode || line.lineType, line.booking?.product.currentRevision?.productName || line.booking?.product.productCode || line.lineType, line.currency, String(line.grossBookingValue), String(line.adjustmentAmount), String(line.netVendorPayable), batch.status]);
    } else if (normalized === 'COMMISSION_INVOICES') {
      const invoices = await this.prisma.commissionInvoice.findMany({ where: { vendorTenantId: tenantId, ...(from || to ? { createdAt: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } } : {}) }, orderBy: { createdAt: 'desc' }, take: 500, include: { settlementBatch: { select: { batchCode: true } } } });
      rows.push(['Invoice number', 'Financial year', 'Settlement batch', 'Period from', 'Period to', 'Currency', 'Commission subtotal', 'GST on commission', 'Invoice total', 'Status', 'Issued at']);
      for (const invoice of invoices) rows.push([invoice.invoiceNumber, invoice.financialYear, invoice.settlementBatch.batchCode, invoice.periodFrom?.toISOString().slice(0, 10) || '', invoice.periodTo?.toISOString().slice(0, 10) || '', invoice.currency, String(invoice.commissionSubtotal), String(invoice.gstOnCommissionAmount), String(invoice.totalAmount), invoice.status, invoice.issuedAt?.toISOString() || '']);
    } else if (normalized === 'TDS_TCS_CERTIFICATES') {
      const batches = await this.prisma.settlementBatch.findMany({ where: { vendorTenantId: tenantId, ...(from || to ? { createdAt: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } } : {}) }, orderBy: { createdAt: 'desc' }, take: 500, include: { lines: { select: { currency: true, components: true, booking: { select: { bookingCode: true } } } } } });
      rows.push(['Settlement batch', 'Booking', 'Currency', 'GST on commission', 'TDS 194-O', 'GST TCS', 'Status', 'Created']);
      for (const batch of batches) for (const line of batch.lines) {
        const components = line.components && typeof line.components === 'object' ? line.components as Record<string, unknown> : {};
        rows.push([batch.batchCode, line.booking?.bookingCode || 'Adjustment', line.currency, String(components.gstOnCommissionAmount ?? 0), String(components.tds194OAmount ?? 0), String(components.gstTcsAmount ?? 0), batch.status, batch.createdAt.toISOString()]);
      }
    } else if (normalized === 'PRODUCT_PERFORMANCE') {
      const viewCounts = await this.prisma.productViewEvent.groupBy({
        by: ['productId'],
        where: { vendorTenantId: tenantId, ...(from || to ? { viewedAt: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } } : {}) },
        _count: { _all: true },
      });
      const viewedProducts = viewCounts.length ? await this.prisma.product.findMany({ where: { tenantId, id: { in: viewCounts.map((view) => view.productId) } }, select: { id: true, productCode: true, currentRevision: { select: { productName: true } } } }) : [];
      const bookings = await this.prisma.booking.findMany({ where: { vendorTenantId: tenantId, ...(serviceDate ? { serviceDate } : {}) }, include: { product: { select: { productCode: true, currentRevision: { select: { productName: true } } } } } });
      const grouped = new Map<string, { name: string; views: number; bookings: number; guests: number; revenue: number }>();
      const viewedProductById = new Map(viewedProducts.map((product) => [product.id, product]));
      for (const view of viewCounts) {
        const product = viewedProductById.get(view.productId); if (!product) continue; const key = product.productCode;
        const current = grouped.get(key) || { name: product.currentRevision?.productName || key, views: 0, bookings: 0, guests: 0, revenue: 0 };
        current.views += view._count._all; grouped.set(key, current);
      }
      for (const booking of bookings) {
        const key = booking.product.productCode; const current = grouped.get(key) || { name: booking.product.currentRevision?.productName || key, views: 0, bookings: 0, guests: 0, revenue: 0 };
        current.bookings += 1; current.guests += booking.pax; current.revenue += Number(booking.amount); grouped.set(key, current);
      }
      rows.push(['Product code', 'Product', 'Views', 'Bookings', 'Guests', 'Conversion (bookings / views)', 'Revenue']);
      for (const [code, item] of grouped) rows.push([code, item.name, String(item.views), String(item.bookings), String(item.guests), item.views ? `${((item.bookings / item.views) * 100).toFixed(2)}%` : '—', item.revenue.toFixed(2)]);
    } else if (normalized === 'REVIEWS') {
      const reviews = await this.prisma.vendorReview.findMany({
        where: { tenantId, status: 'PUBLISHED', ...(from || to ? { reviewedAt: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } } : {}) },
        orderBy: { reviewedAt: 'desc' }, take: 1000,
        include: { product: { select: { productCode: true, currentRevision: { select: { productName: true } } } } },
      });
      rows.push(['Review date', 'Product', 'Rating', 'Reviewer', 'Title', 'Review', 'Vendor reply', 'Reply date', 'Source']);
      for (const review of reviews) rows.push([
        review.reviewedAt.toISOString().slice(0, 10),
        review.product.currentRevision?.productName || review.product.productCode,
        String(review.rating), review.reviewerName || '', review.title || '', review.comment || '', review.vendorReply || '',
        review.repliedAt?.toISOString().slice(0, 10) || '', review.source,
      ]);
    } else {
      const bookings = await this.prisma.booking.findMany({ where: { vendorTenantId: tenantId, ...(serviceDate ? { serviceDate } : {}), ...(normalized === 'CANCELLATIONS' ? { status: 'CANCELLED' } : {}) }, orderBy: { serviceDate: 'desc' }, take: 500, include: { product: { select: { productCode: true, currentRevision: { select: { productName: true } } } }, travellers: { orderBy: { sequence: 'asc' } }, operationalSnapshot: true, cancellation: { include: { refund: true } } } });
      if (normalized === 'GUEST_MANIFEST') {
        rows.push(['Booking', 'Service date', 'Product', 'Guest name', 'Contact number', 'Guest count', 'Pickup details', 'Status']);
        for (const booking of bookings) {
          const product = booking.product.currentRevision?.productName || booking.product.productCode;
          const suppliedPickup = (booking.operationalSnapshot?.pickupSnapshot as any)?.supplied;
          const pickup = typeof suppliedPickup === 'string' ? suppliedPickup : suppliedPickup ? Object.entries(suppliedPickup).map(([key, value]) => `${key}: ${String(value)}`).join('; ') : '';
          const guests = booking.travellers.length ? booking.travellers : [{ fullName: booking.customerName, phone: null, quantity: booking.pax }];
          for (const guest of guests) rows.push([booking.bookingCode, booking.serviceDate.toISOString().slice(0, 10), product, guest.fullName || '', guest.phone || '', String(guest.quantity), pickup, booking.status]);
        }
      } else {
        rows.push(['Booking', 'Service date', 'Product', 'Cancellation reason', 'Reason category', 'Refund amount', 'Refund status', 'Refund entitlement', 'Booking amount', 'Status']);
        for (const booking of bookings) rows.push([booking.bookingCode, booking.serviceDate.toISOString().slice(0, 10), booking.product.currentRevision?.productName || booking.product.productCode, booking.cancellation?.reason || '', booking.cancellation?.reasonCategory || '', booking.cancellation?.refund ? String(booking.cancellation.refund.amount) : '', booking.cancellation?.refund?.status || '', String(booking.cancellation?.refundEntitlement ?? ''), String(booking.amount), booking.status]);
      }
    }
    const reportName = normalized === 'COMMISSION_INVOICES' ? 'Commission and settlement report' : `${normalized[0] + normalized.slice(1).toLowerCase()} report`;
    const report: ReportSnapshot = { id: randomUUID(), name: reportName, type: normalized, format: format as ReportFormat, createdAt: new Date().toISOString(), status: 'READY', rows };
    const reports = [report, ...(await this.readReports(tenantId)).filter((item) => item.id !== report.id)].slice(0, 20); await this.writeReports(tenantId, reports); return { ...report, downloadUrl: `/api/vendor/reports/${report.id}/download` };
  }

  async downloadReport(user: AuthUser, id: string) {
    const tenantId = requireTenant(user);
    const saved = await this.prisma.vendorReportExport.findFirst({ where: { id, tenantId } });
    const legacy = saved ? null : (await this.readReports(tenantId)).find((item) => item.id === id);
    if (!saved && !legacy) throw new NotFoundException('Report not found.');
    if (saved && saved.status !== 'READY') throw new BadRequestException(saved.status === 'FAILED' ? 'This report could not be generated.' : 'This report is not ready to download yet.');
    const report = saved ? { ...saved, rows: Array.isArray(saved.rows) ? saved.rows as string[][] : [], createdAt: saved.createdAt.toISOString(), format: saved.format as ReportFormat } : legacy!;
    const csv = report.rows.map((row) => row.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(',')).join('\r\n');
    if (report.format === 'PDF') {
      const document = await PDFDocument.create(); const font = await document.embedFont(StandardFonts.Helvetica); let page = document.addPage([842, 595]); let y = 560;
      const draw = (value: string, bold = false) => { if (y < 40) { page = document.addPage([842, 595]); y = 560; } page.drawText(value.slice(0, 150), { x: 24, y, size: bold ? 10 : 8, font, color: rgb(0.08, 0.12, 0.2) }); y -= bold ? 18 : 13; };
      draw(`${report.name} (${report.type})`, true); draw(`Created: ${report.createdAt}`, false); draw('');
      for (const [index, row] of report.rows.entries()) draw(row.join(' | '), index === 0);
      return { filename: `${report.type.toLowerCase()}-${report.id}.pdf`, contentType: 'application/pdf', body: Buffer.from(await document.save()) };
    }
    if (report.format === 'XLSX') {
      const workbook = new ExcelJS.Workbook();
      workbook.creator = 'VOYA Partner Hub'; workbook.created = new Date(report.createdAt);
      const worksheet = workbook.addWorksheet('Report', { views: [{ state: 'frozen', ySplit: 1 }] });
      worksheet.addRows(report.rows);
      const header = worksheet.getRow(1); header.font = { bold: true }; header.eachCell((cell) => { cell.alignment = { vertical: 'middle' }; });
      worksheet.columns.forEach((column, index) => { column.width = Math.min(42, Math.max(14, ...report.rows.map((row) => String(row[index] ?? '').length + 2))); });
      return { filename: `${report.type.toLowerCase()}-${report.id}.xlsx`, contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', body: Buffer.from(await workbook.xlsx.writeBuffer()) };
    }
    return { filename: `${report.type.toLowerCase()}-${report.id}.csv`, contentType: 'text/csv; charset=utf-8', body: csv };
  }
}
