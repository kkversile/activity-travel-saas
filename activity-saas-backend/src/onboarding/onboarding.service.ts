import { BadRequestException, ConflictException, ForbiddenException, HttpException, HttpStatus, Injectable, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { DocumentReviewStatus, Prisma, TenantKind, UserRole, VendorBankVerificationStatus, VendorDocumentType, VendorGstStatus, VendorOnboardingStatus, VendorVerificationStatus } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { AuthUser } from '../common/auth.types';
import { encryptSecret, hashOtp, maskAccountNumber } from '../common/secret-crypto';
import { requireTenant } from '../common/tenant';
import { OutboxService } from '../outbox/outbox.service';
import { PrismaService } from '../prisma/prisma.service';
import { ReviewOnboardingDto, UpdateOnboardingDto } from './onboarding.dto';
import { OnboardingEmailService } from './onboarding-email.service';
import { OnboardingEmailKind } from './onboarding-email-template';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { randomInt } from 'node:crypto';
import { PublicEntity, publicIdentifierMap } from '../common/public-identifiers';
import { VENDOR_VERIFICATION_SETTINGS_KEY, defaultVendorVerificationSettings, normalizeVendorVerificationSettings } from '../common/mobile-verification-settings';
import { assertVendorOnboardingDocumentsApproved, vendorOnboardingApprovalBlockers } from '../admin/vendor-onboarding-approval';

const DRAFT_STATUSES: VendorOnboardingStatus[] = [VendorOnboardingStatus.DRAFT, VendorOnboardingStatus.CHANGES_REQUESTED];
const REVIEWABLE_STATUSES: VendorOnboardingStatus[] = [VendorOnboardingStatus.SUBMITTED, VendorOnboardingStatus.UNDER_REVIEW, VendorOnboardingStatus.CHANGES_REQUESTED, VendorOnboardingStatus.REJECTED];
const NEGATIVE_REVIEW_STATUSES: VendorOnboardingStatus[] = [VendorOnboardingStatus.REJECTED, VendorOnboardingStatus.CHANGES_REQUESTED];
const REVIEW_DECISIONS: VendorOnboardingStatus[] = [VendorOnboardingStatus.UNDER_REVIEW, VendorOnboardingStatus.APPROVED, VendorOnboardingStatus.REJECTED, VendorOnboardingStatus.CHANGES_REQUESTED];
const AGREEMENT_VERSION = 'VOYA-DRAFT-PARTNER-AGREEMENT-v1';
const DEFAULT_COMMERCIAL_TERMS = {
  agreementName: 'Activity Vendor Agreement',
  commercialModel: 'Commission on sell price',
  commission: '18%',
  settlementCycle: 'Weekly T+7 after activity date',
  contractTerm: "12 months auto-renews · 90 days' notice",
  accountManager: 'Jatin M.',
} as const;
const publicApplicationSelect = {
  id: true, status: true, currentStep: true, firstName: true, lastName: true, contactNumber: true, phoneVerifiedAt: true,
  businessDisplayName: true, legalBusinessName: true, panNumber: true, gstStatus: true, gstin: true, gstDeclarationAccepted: true,
  addressLine: true, city: true, state: true, pinCode: true, latitude: true, longitude: true, accountHolderName: true, bankName: true,
  bankAccountMasked: true, ifscCode: true, accountType: true, bankOwnershipConfirmed: true, bankVerificationStatus: true,
  agreementVersion: true, agreementAcceptedAt: true, agreementSentAt: true, agreementOpenedAt: true, agreementCountersignedAt: true, authorizedBusinessName: true, authorizedRepresentative: true, signatureData: true, supplementalData: true, startedAt: true,
  submittedAt: true, reviewedAt: true, reviewReason: true, createdAt: true, updatedAt: true,
} satisfies Prisma.VendorOnboardingApplicationSelect;

function clean(value: unknown) { return typeof value === 'string' ? value.trim() : value; }
function normalizePan(value?: string | null) { return value ? value.trim().toUpperCase() : value; }
function normalizeGstin(value?: string | null) { return value ? value.trim().toUpperCase() : value; }
function normalizeCommercialTerms(value: unknown): Record<string, unknown> {
  const source = value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
  const settlementCycle = typeof source.settlementCycle === 'string'
    ? source.settlementCycle.replace(/^Weekly\s*[·•]\s*/, 'Weekly ')
    : '';
  const contractTerm = typeof source.contractTerm === 'string'
    ? (() => {
        const normalized = source.contractTerm!.replace('12 months · auto-renews', '12 months auto-renews');
        return normalized === '12 months auto-renews'
          ? normalized + " · 90 days' notice"
          : normalized;
      })()
    : '';
  const supplierType = String(source.supplierType || '').trim().toUpperCase();
  const agreementName = supplierType === 'AGGREGATOR / DMC' || supplierType === 'AGGREGATOR_DMC'
    ? 'Booking Facilitation Agreement'
    : supplierType === 'GOVERNMENT BODY' || supplierType === 'GOVERNMENT_BODY'
      ? 'Activity Vendor Agreement (Govt annexure)'
      : DEFAULT_COMMERCIAL_TERMS.agreementName;
  return {
    ...source,
    agreementName,
    commercialModel: typeof source.commercialModel === 'string' && source.commercialModel.trim() ? source.commercialModel : DEFAULT_COMMERCIAL_TERMS.commercialModel,
    commission: typeof source.commission === 'string' && source.commission.trim() && source.commission !== 'To be confirmed' ? source.commission : DEFAULT_COMMERCIAL_TERMS.commission,
    settlementCycle: settlementCycle || DEFAULT_COMMERCIAL_TERMS.settlementCycle,
    contractTerm: contractTerm || DEFAULT_COMMERCIAL_TERMS.contractTerm,
    accountManager: typeof source.accountManager === 'string' && source.accountManager.trim() && source.accountManager !== 'Not assigned yet' ? source.accountManager : DEFAULT_COMMERCIAL_TERMS.accountManager,
  };
}

@Injectable()
export class OnboardingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly outbox: OutboxService,
    private readonly onboardingEmail: OnboardingEmailService,
  ) {}

  private async vendorVerificationSettings() {
    const setting = await this.prisma.globalSetting.findFirst({ where: { tenantId: null, key: VENDOR_VERIFICATION_SETTINGS_KEY }, select: { value: true } });
    return normalizeVendorVerificationSettings(setting?.value || defaultVendorVerificationSettings);
  }

  private async requireMobileVerificationEnabled() {
    if (!(await this.vendorVerificationSettings()).mobileVerificationEnabled) throw new ForbiddenException('Mobile verification is disabled by platform settings.');
  }

  private async ensureApplication(tenantId: string) {
    const profile = await this.prisma.vendorProfile.findUnique({ where: { tenantId }, select: { displayName: true, legalBusinessName: true, operatingCity: true, operatingRegion: true, gstin: true } });
    if (!profile) throw new NotFoundException('Vendor profile not found');
    return this.prisma.vendorOnboardingApplication.upsert({
      where: { tenantId },
      update: {},
      create: { tenantId, legalBusinessName: profile.legalBusinessName, businessDisplayName: profile.displayName || profile.legalBusinessName, city: profile.operatingCity, state: profile.operatingRegion, gstin: profile.gstin, gstStatus: profile.gstin ? VendorGstStatus.REGISTERED : null },
    });
  }

  private async documents(tenantId: string) {
    const rows = await this.prisma.vendorDocument.findMany({ where: { tenantId }, orderBy: { type: 'asc' }, include: { versions: { orderBy: { versionNumber: 'desc' }, take: 1, select: { id: true, versionNumber: true, status: true, expiresAt: true, rejectionReason: true, submittedAt: true, reviewedAt: true, fileAsset: { select: { id: true, originalName: true, mimeType: true, sizeBytes: true, visibility: true, purpose: true } } } } } });
    const codes = await publicIdentifierMap(this.prisma, PublicEntity.VENDOR_DOCUMENT, rows.map((row) => row.id));
    return rows.map((row) => ({ id: row.id, publicCode: codes.get(row.id) || null, type: row.type, currentStatus: row.currentStatus, latestVersion: row.versions[0] ?? null }));
  }

  async get(user: AuthUser) {
    const tenantId = requireTenant(user);
    await this.ensureApplication(tenantId);
    const application = await this.prisma.vendorOnboardingApplication.findUniqueOrThrow({ where: { tenantId }, select: publicApplicationSelect });
    const supplementalData = normalizeCommercialTerms(application.supplementalData);
    if (JSON.stringify(supplementalData) !== JSON.stringify(application.supplementalData || {})) {
      await this.prisma.vendorOnboardingApplication.update({ where: { id: application.id }, data: { supplementalData: supplementalData as Prisma.InputJsonValue } });
    }
    const verificationSettings = await this.vendorVerificationSettings();
    return { ...application, contactEmail: user.email, ...verificationSettings, supplementalData, hasSignature: Boolean(await this.prisma.vendorOnboardingApplication.findUnique({ where: { id: application.id }, select: { signatureData: true } }).then((row) => row?.signatureData)), agreementVersion: application.agreementVersion || AGREEMENT_VERSION, documents: await this.documents(tenantId) };
  }

  async lookupIfsc(user: AuthUser, code: string) {
    requireTenant(user);
    const normalized = String(code || '').trim().toUpperCase();
    if (!/^[A-Z]{4}0[A-Z0-9]{6}$/.test(normalized)) throw new BadRequestException('IFSC code format is invalid');
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 4_000);
    try {
      const response = await fetch(`https://ifsc.razorpay.com/${encodeURIComponent(normalized)}`, { headers: { accept: 'application/json' }, signal: controller.signal });
      if (response.status === 404) throw new NotFoundException('IFSC code was not found');
      if (!response.ok) throw new ServiceUnavailableException('IFSC lookup is unavailable.');
      const payload = await response.json() as { BANK?: string; BRANCH?: string; CITY?: string; DISTRICT?: string; STATE?: string; IFSC?: string };
      if (!payload.BANK) throw new NotFoundException('IFSC code was not found');
      return { code: payload.IFSC || normalized, bankName: payload.BANK, branch: payload.BRANCH || '', city: payload.CITY || payload.DISTRICT || '', state: payload.STATE || '' };
    } catch (error) {
      if (error instanceof NotFoundException || error instanceof ServiceUnavailableException || error instanceof BadRequestException) throw error;
      throw new ServiceUnavailableException('IFSC lookup is unavailable.');
    } finally {
      clearTimeout(timeout);
    }
  }

  private assertVendor(user: AuthUser) {
    if (user.role !== UserRole.VENDOR) throw new ForbiddenException('Vendor access is required');
  }

  private async editable(user: AuthUser) {
    this.assertVendor(user);
    const tenantId = requireTenant(user);
    const app = await this.prisma.vendorOnboardingApplication.findUnique({ where: { tenantId } });
    if (!app) return this.ensureApplication(tenantId);
    if (!DRAFT_STATUSES.includes(app.status)) throw new ConflictException(`Onboarding is ${app.status.toLowerCase().replaceAll('_', ' ')} and cannot be edited`);
    return app;
  }

  async save(user: AuthUser, dto: UpdateOnboardingDto) {
    const app = await this.editable(user);
    const tenantId = requireTenant(user);
    if (dto.contactNumber && dto.contactNumber.trim() !== app.contactNumber) { dto.contactNumber = dto.contactNumber.trim(); }
    if (dto.panNumber) dto.panNumber = normalizePan(dto.panNumber) || undefined;
    if (dto.gstin) dto.gstin = normalizeGstin(dto.gstin) || undefined;
    if (dto.panNumber && !/^[A-Z]{5}[0-9]{4}[A-Z]$/.test(dto.panNumber)) throw new BadRequestException('PAN must match the standard 10-character format');
    if (dto.gstin && !/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/.test(dto.gstin)) throw new BadRequestException('GSTIN format is invalid');
    if (dto.pinCode && !/^\d{6}$/.test(dto.pinCode.trim())) throw new BadRequestException('PIN code must contain 6 digits');
    if (dto.ifscCode && !/^[A-Z]{4}0[A-Z0-9]{6}$/.test(dto.ifscCode.trim().toUpperCase())) throw new BadRequestException('IFSC code format is invalid');
    if (dto.bankAccountNumber && !/^\d{9,18}$/.test(dto.bankAccountNumber.replace(/\s+/g, ''))) throw new BadRequestException('Bank account number must contain 9 to 18 digits');
    if (dto.signatureData && (!dto.signatureData.startsWith('data:image/png;base64,') || dto.signatureData.length > 2_000_000)) throw new BadRequestException('Signature image is invalid');
    const data: Prisma.VendorOnboardingApplicationUpdateInput = {};
    const simpleFields = ['firstName', 'lastName', 'contactNumber', 'businessDisplayName', 'legalBusinessName', 'gstin', 'gstDeclarationAccepted', 'addressLine', 'city', 'state', 'pinCode', 'accountHolderName', 'bankName', 'ifscCode', 'accountType', 'bankOwnershipConfirmed', 'authorizedBusinessName', 'authorizedRepresentative', 'signatureData'] as const;
    for (const field of simpleFields) if (dto[field] !== undefined) (data as any)[field] = typeof dto[field] === 'string' ? clean(dto[field]) : dto[field];
    if (dto.panNumber !== undefined) data.panNumber = dto.panNumber;
    if (dto.gstStatus !== undefined) data.gstStatus = dto.gstStatus;
    if (dto.latitude !== undefined) data.latitude = dto.latitude === '' ? null : new Prisma.Decimal(dto.latitude);
    if (dto.longitude !== undefined) data.longitude = dto.longitude === '' ? null : new Prisma.Decimal(dto.longitude);
    if (dto.bankAccountNumber !== undefined) { const account = dto.bankAccountNumber.replace(/\s+/g, ''); data.bankAccountCiphertext = encryptSecret(account); data.bankAccountMasked = maskAccountNumber(account); data.bankVerificationStatus = VendorBankVerificationStatus.PENDING; }
    if (dto.agreementAccepted === true) { data.agreementVersion = dto.agreementVersion || AGREEMENT_VERSION; data.agreementAcceptedAt = new Date(); }
    if (dto.agreementAccepted === false) { data.agreementAcceptedAt = null; }
    const normalizedSupplemental = dto.supplementalData !== undefined ? normalizeCommercialTerms(dto.supplementalData) : undefined;
    if (normalizedSupplemental !== undefined) data.supplementalData = normalizedSupplemental as Prisma.InputJsonValue;
    if (dto.started) data.startedAt = app.startedAt || new Date();
    if (dto.currentStep !== undefined) data.currentStep = Math.max(1, Math.min(8, Number(dto.currentStep)));
    if (dto.currentStep !== undefined && Number(dto.currentStep) >= 7 && !app.agreementSentAt) data.agreementSentAt = new Date();
    const updated = await this.prisma.$transaction(async (tx) => {
      const result = await tx.vendorOnboardingApplication.update({ where: { id: app.id }, data, select: publicApplicationSelect });
      if (normalizedSupplemental) {
        const licenceRows = Array.isArray((normalizedSupplemental as any).licences) ? (normalizedSupplemental as any).licences : [];
        const expiryByType = new Map<string, Date | null>();
        for (const row of licenceRows) {
          if (typeof row?.documentType !== 'string') continue;
          if (!Object.values(VendorDocumentType).includes(row.documentType as VendorDocumentType)) throw new BadRequestException(`Unknown document type ${row.documentType}`);
          const value = typeof row.validTill === 'string' ? row.validTill.trim() : '';
          if (!value) { expiryByType.set(row.documentType, null); continue; }
          if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new BadRequestException(`Expiry for ${row.documentType} must use YYYY-MM-DD`);
          const [year, month, day] = value.split('-').map(Number);
          const expiry = new Date(Date.UTC(year, month - 1, day, 23, 59, 59, 999));
          if (expiry.getUTCFullYear() !== year || expiry.getUTCMonth() !== month - 1 || expiry.getUTCDate() !== day) throw new BadRequestException(`Expiry for ${row.documentType} is not a valid date`);
          expiryByType.set(row.documentType, expiry);
        }
        for (const [type, expiresAt] of expiryByType) {
          const document = await tx.vendorDocument.findUnique({ where: { tenantId_type: { tenantId, type: type as any } }, select: { id: true, versions: { orderBy: { versionNumber: 'desc' }, take: 1, select: { id: true } } } });
          const latestVersion = document?.versions[0];
          if (latestVersion) await tx.vendorDocumentVersion.update({ where: { id: latestVersion.id }, data: { expiresAt } });
        }
      }
      const profileData: Prisma.VendorProfileUpdateInput = {};
      if (dto.businessDisplayName !== undefined) profileData.displayName = clean(dto.businessDisplayName) as string;
      if (dto.legalBusinessName !== undefined) profileData.legalBusinessName = clean(dto.legalBusinessName) as string;
      if (dto.city !== undefined) profileData.operatingCity = clean(dto.city) as string;
      if (dto.state !== undefined) profileData.operatingRegion = clean(dto.state) as string;
      if (dto.gstin !== undefined) profileData.gstin = dto.gstin || null;
      if (dto.accountHolderName !== undefined) profileData.payoutAccountHolder = clean(dto.accountHolderName) as string;
      if (dto.bankName !== undefined) profileData.payoutBankName = clean(dto.bankName) as string;
      if (dto.ifscCode !== undefined) profileData.payoutIfsc = clean(dto.ifscCode)?.toString().toUpperCase();
      if (dto.accountType !== undefined) profileData.payoutAccountType = clean(dto.accountType) as string;
      if (dto.bankAccountNumber !== undefined) profileData.payoutAccountMasked = data.bankAccountMasked as string;
      if (Object.keys(profileData).length) await tx.vendorProfile.update({ where: { tenantId }, data: profileData });
      if (dto.firstName !== undefined || dto.lastName !== undefined) {
        const firstName = clean(dto.firstName ?? app.firstName) as string;
        const lastName = clean(dto.lastName ?? app.lastName) as string;
        if (firstName && lastName) await tx.user.update({ where: { id: user.sub }, data: { fullName: `${firstName} ${lastName}` } });
      }
      return result;
    });
    const savedSignature = await this.prisma.vendorOnboardingApplication.findUnique({ where: { id: app.id }, select: { signatureData: true } });
    return { ...updated, hasSignature: Boolean(savedSignature?.signatureData), agreementVersion: updated.agreementVersion || AGREEMENT_VERSION, documents: await this.documents(tenantId) };
  }

  async markAgreementOpened(user: AuthUser) {
    const app = await this.editable(user);
    const now = new Date();
    const updated = await this.prisma.vendorOnboardingApplication.update({
      where: { id: app.id },
      data: {
        agreementSentAt: app.agreementSentAt || now,
        agreementOpenedAt: app.agreementOpenedAt || now,
        currentStep: Math.max(app.currentStep, 7),
      },
      select: publicApplicationSelect,
    });
    return { ...updated, hasSignature: Boolean(updated.signatureData), agreementVersion: updated.agreementVersion || AGREEMENT_VERSION, documents: await this.documents(requireTenant(user)) };
  }

  async agreementPdf(user: AuthUser) {
    const tenantId = requireTenant(user);
    await this.ensureApplication(tenantId);
    const application = await this.prisma.vendorOnboardingApplication.findUniqueOrThrow({ where: { tenantId }, select: publicApplicationSelect });
    const supplemental = normalizeCommercialTerms(application.supplementalData);
    const document = await PDFDocument.create();
    const regular = await document.embedFont(StandardFonts.Helvetica);
    const bold = await document.embedFont(StandardFonts.HelveticaBold);
    const page = document.addPage([595, 842]);
    const ink = rgb(0.08, 0.11, 0.17);
    const muted = rgb(0.38, 0.43, 0.51);
    let y = 792;
    const draw = (text: string, size = 10, font = regular, color = ink, gap = 16) => {
      page.drawText(text.slice(0, 105), { x: 44, y, size, font, color });
      y -= gap;
    };
    const wrap = (text: string, size = 10, font = regular, color = ink) => {
      const words = text.split(/\s+/);
      let line = '';
      for (const word of words) {
        const next = line ? line + ' ' + word : word;
        if (font.widthOfTextAtSize(next, size) > 500 && line) { draw(line, size, font, color, size + 5); line = word; }
        else line = next;
      }
      if (line) draw(line, size, font, color, size + 5);
    };
    draw('VOYA Partner Agreement', 20, bold, ink, 28);
    draw('Draft · Annexure 1 · Auto-filled from vendor profile and commercial terms', 9, regular, muted, 24);
    draw(application.agreementVersion || AGREEMENT_VERSION, 8, regular, muted, 24);
    draw('Agreement details', 13, bold, ink, 20);
    const fullAddress = [application.addressLine, application.city, application.state, application.pinCode].filter(Boolean).join(', ') || 'Not provided';
    const contact = [application.contactNumber, user.email].filter(Boolean).join(' · ') || 'Not provided';
    const fields: Array<[string, string]> = [
      ['Agreement', String(supplemental.agreementName || DEFAULT_COMMERCIAL_TERMS.agreementName)],
      ['Effective date', 'On signature'],
      ['Business name', application.businessDisplayName || 'Not provided'],
      ['Legal entity', application.legalBusinessName || 'Not provided'],
      ['Address', fullAddress],
      ['Contact person', [application.firstName, application.lastName].filter(Boolean).join(' ') || 'Not provided'],
      ['Phone / email', contact],
      ['Commission (cl. 2.5)', String(supplemental.commission || DEFAULT_COMMERCIAL_TERMS.commission)],
    ];
    for (const [label, value] of fields) { draw(label, 9, regular, muted, 13); draw(value, 11, bold, ink, 20); }
    y -= 8;
    draw('Partner commitments', 13, bold, ink, 20);
    for (const item of [
      'Rate parity: prices here are no higher than on your website or other platforms.',
      'A cancellation policy no stricter than on other channels.',
      'Honour every confirmed booking, and keep insurance valid.',
    ]) { wrap('• ' + item, 10, regular, ink); y -= 3; }
    y -= 10;
    draw('Status', 13, bold, ink, 20);
    draw(application.agreementAcceptedAt ? 'Accepted by authorized representative' : 'Draft — signature and acceptance pending', 10, regular, muted, 18);
    wrap('By partnering with Voya, the supplier agrees to provide accurate activity, availability, pricing and fulfilment information and to honour confirmed customer reservations according to the published terms.', 10);
    y -= 8;
    wrap('This draft wording is not a legally approved digital-signature agreement. The Voya team may review submitted information, request corrections, and suspend access when documents or operating information are incomplete.', 9, regular, muted);
    const bytes = Buffer.from(await document.save());
    return { filename: 'voya-partner-agreement-' + (application.businessDisplayName || 'vendor') + '.pdf', body: bytes };
  }

  async requestOtp(user: AuthUser, contactNumber: string) {
    await this.requireMobileVerificationEnabled();
    const app = await this.editable(user);
    const normalized = contactNumber.trim();
    if (!/^\+?[1-9]\d{9,14}$/.test(normalized)) throw new BadRequestException('Enter a valid mobile number with country code');
    if (app.otpRequestedAt && Date.now() - app.otpRequestedAt.getTime() < 30_000) throw new HttpException('Please wait before requesting another OTP', HttpStatus.TOO_MANY_REQUESTS);
    if (process.env.NODE_ENV === 'production') {
      throw new ServiceUnavailableException('Mobile verification delivery is not configured. Contact support to complete vendor registration.');
    }
    // Local development only: persist a random code and return it to the demo UI.
    const otp = process.env.ONBOARDING_PHONE_OTP || String(randomInt(100_000, 1_000_000));
    const updated = await this.prisma.vendorOnboardingApplication.update({ where: { id: app.id }, data: { contactNumber: normalized, phoneVerifiedAt: null, otpHash: hashOtp(otp), otpExpiresAt: new Date(Date.now() + 10 * 60_000), otpRequestedAt: new Date(), otpAttempts: 0 }, select: { otpExpiresAt: true } });
    return { expiresAt: updated.otpExpiresAt, cooldownSeconds: 30, demoOtp: otp };
  }

  async verifyOtp(user: AuthUser, otp: string) {
    await this.requireMobileVerificationEnabled();
    const app = await this.editable(user);
    if (!app.otpHash || !app.otpExpiresAt || app.otpExpiresAt < new Date()) throw new BadRequestException('OTP has expired; request a new one');
    if (app.otpAttempts >= 5) throw new HttpException('OTP attempt limit reached; request a new one', HttpStatus.TOO_MANY_REQUESTS);
    if (hashOtp(otp.trim()) !== app.otpHash) { await this.prisma.vendorOnboardingApplication.update({ where: { id: app.id }, data: { otpAttempts: { increment: 1 } } }); throw new BadRequestException('The OTP is incorrect'); }
    await this.prisma.vendorOnboardingApplication.update({ where: { id: app.id }, data: { phoneVerifiedAt: new Date(), otpHash: null, otpExpiresAt: null, otpAttempts: 0 } });
    return { verified: true };
  }

  private async completeApplication(tenantId: string) {
    const app = await this.prisma.vendorOnboardingApplication.findUnique({ where: { tenantId }, include: { tenant: { include: { vendorDocuments: { include: { versions: { orderBy: { versionNumber: 'desc' }, take: 1 } } } } } } });
    if (!app) throw new NotFoundException('Onboarding application not found');
    const latest = new Map(app.tenant.vendorDocuments.map((doc) => [doc.type, doc.versions[0]]));
    const mobileVerificationEnabled = (await this.vendorVerificationSettings()).mobileVerificationEnabled;
    if (!app.firstName || !app.lastName || !app.contactNumber || (mobileVerificationEnabled && !app.phoneVerifiedAt)) throw new BadRequestException(mobileVerificationEnabled ? 'Complete and verify the profile contact details' : 'Complete the profile contact details');
    if (!app.businessDisplayName || !app.legalBusinessName || !app.panNumber || !latest.get('PAN')) throw new BadRequestException('Complete business identity and upload the PAN document');
    if (!app.gstStatus || (app.gstStatus === VendorGstStatus.REGISTERED && (!app.gstin || !app.gstDeclarationAccepted || !latest.get('GSTIN')))) throw new BadRequestException('Complete the GST details and declaration');
    const supplemental = app.supplementalData && typeof app.supplementalData === 'object' && !Array.isArray(app.supplementalData)
      ? app.supplementalData as Record<string, unknown>
      : {};
    if (supplemental.entityType === 'LLP' && (!latest.get('LLP_AGREEMENT') || !latest.get('LLPIN_CERTIFICATE') || !latest.get('AUTHORIZATION_LETTER'))) {
      throw new BadRequestException('LLP onboarding requires the LLP agreement, LLPIN certificate and authorisation letter');
    }
    if (!app.addressLine || !app.city || !app.state || !/^\d{6}$/.test(app.pinCode || '')) throw new BadRequestException('Complete the business address');
    if (!app.accountHolderName || !app.bankName || !app.bankAccountCiphertext || !app.ifscCode || !app.accountType || !app.bankOwnershipConfirmed || !latest.get('BANK_PROOF')) throw new BadRequestException('Complete bank details, ownership confirmation, and bank proof');
    if (!app.agreementAcceptedAt || !app.signatureData || !app.authorizedRepresentative) throw new BadRequestException('Accept the draft agreement and add an authorized signature');
    return app;
  }

  async submit(user: AuthUser) {
    const tenantId = requireTenant(user);
    const app = await this.completeApplication(tenantId);
    if (!DRAFT_STATUSES.includes(app.status)) throw new ConflictException('This onboarding application has already been submitted');
    const result = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.vendorOnboardingApplication.updateMany({ where: { id: app.id, status: { in: DRAFT_STATUSES } }, data: { status: VendorOnboardingStatus.SUBMITTED, currentStep: 8, submittedAt: new Date(), submittedById: user.sub } });
      if (updated.count !== 1) throw new ConflictException('The onboarding application changed in another session; reload and retry');
      const current = await tx.vendorOnboardingApplication.findUniqueOrThrow({ where: { id: app.id }, select: publicApplicationSelect });
      await tx.vendorProfile.update({ where: { tenantId }, data: { displayName: current.businessDisplayName, legalBusinessName: current.legalBusinessName!, operatingCity: current.city!, operatingRegion: current.state!, gstin: current.gstin, verificationStatus: VendorVerificationStatus.PENDING, payoutAccountMasked: current.bankAccountMasked, payoutAccountHolder: current.accountHolderName, payoutBankName: current.bankName, payoutIfsc: current.ifscCode, payoutAccountType: current.accountType } });
      await this.audit.write(tx, { actor: user, tenantId, action: 'VENDOR_ONBOARDING_SUBMITTED', entityType: 'VendorOnboardingApplication', entityId: app.id, afterState: { status: VendorOnboardingStatus.SUBMITTED, currentStep: 8 } });
      await this.outbox.enqueue(tx, { tenantId, eventType: 'VENDOR_ONBOARDING_SUBMITTED', aggregateType: 'VendorOnboardingApplication', aggregateId: app.id, payload: { status: VendorOnboardingStatus.SUBMITTED } });
      return current;
    });
    await this.onboardingEmail.notifySubmitted(tenantId, result.businessDisplayName || result.legalBusinessName);
    return { ...result, hasSignature: true, agreementVersion: result.agreementVersion || AGREEMENT_VERSION, documents: await this.documents(tenantId) };
  }

  async adminGet(tenantId: string) {
    const vendor = await this.prisma.tenant.findFirst({ where: { id: tenantId, kind: TenantKind.VENDOR }, select: { id: true, name: true, vendorProfile: true, vendorOnboarding: { select: { ...publicApplicationSelect, signatureData: true } } } });
    if (!vendor) throw new NotFoundException('Vendor not found');
    const blockers = vendor.vendorOnboarding ? await this.prisma.$transaction((tx) => vendorOnboardingApprovalBlockers(tx, tenantId)) : [];
    return { ...vendor, vendorOnboarding: vendor.vendorOnboarding ? { ...vendor.vendorOnboarding, hasSignature: Boolean(vendor.vendorOnboarding.signatureData), documents: await this.documents(tenantId), approvalBlockers: blockers } : null };
  }

  async review(actor: AuthUser, tenantId: string, dto: ReviewOnboardingDto) {
    const app = await this.prisma.vendorOnboardingApplication.findUnique({ where: { tenantId } });
    if (!app) throw new NotFoundException('Onboarding application not found');
    if (!REVIEWABLE_STATUSES.includes(app.status)) throw new ConflictException(`Onboarding is ${app.status.toLowerCase().replaceAll('_', ' ')}`);
    if (NEGATIVE_REVIEW_STATUSES.includes(dto.status) && !dto.reason?.trim()) throw new BadRequestException('A reason is required for this decision');
    if (!REVIEW_DECISIONS.includes(dto.status)) throw new BadRequestException('Unsupported onboarding review decision');
    const result = await this.prisma.$transaction(async (tx) => {
      if (dto.status === VendorOnboardingStatus.APPROVED) await assertVendorOnboardingDocumentsApproved(tx, tenantId);
      const updated = await tx.vendorOnboardingApplication.update({ where: { id: app.id }, data: { status: dto.status, reviewedAt: new Date(), reviewedById: actor.sub, reviewReason: dto.reason?.trim() || null }, select: publicApplicationSelect });
      if (dto.status === VendorOnboardingStatus.APPROVED) await tx.vendorProfile.update({ where: { tenantId }, data: { verificationStatus: VendorVerificationStatus.VERIFIED } });
      if (NEGATIVE_REVIEW_STATUSES.includes(dto.status)) await tx.vendorProfile.update({ where: { tenantId }, data: { verificationStatus: VendorVerificationStatus.PENDING } });
      await this.audit.write(tx, { actor, tenantId, action: `VENDOR_ONBOARDING_${dto.status}`, entityType: 'VendorOnboardingApplication', entityId: app.id, reason: dto.reason, beforeState: { status: app.status }, afterState: { status: dto.status } });
      await this.outbox.enqueue(tx, { tenantId, eventType: `VENDOR_ONBOARDING_${dto.status}`, aggregateType: 'VendorOnboardingApplication', aggregateId: app.id, payload: { status: dto.status, reason: dto.reason?.trim() || null } });
      return updated;
    });
    const emailKind = (
      dto.status === VendorOnboardingStatus.UNDER_REVIEW ? 'UNDER_REVIEW' :
      dto.status === VendorOnboardingStatus.CHANGES_REQUESTED ? 'CHANGES_REQUESTED' :
      dto.status === VendorOnboardingStatus.REJECTED ? 'REJECTED' :
      dto.status === VendorOnboardingStatus.APPROVED ? 'APPROVED' : 'DRAFT'
    ) as OnboardingEmailKind;
    await this.onboardingEmail.notifyReview(tenantId, emailKind, dto.status, dto.reason);
    return { ...result, hasSignature: true, agreementVersion: result.agreementVersion || AGREEMENT_VERSION, documents: await this.documents(tenantId) };
  }

  async reopen(actor: AuthUser, tenantId: string) {
    if (actor.role !== UserRole.SUPER_ADMIN) throw new ForbiddenException('Only a Super Admin can return onboarding to draft');
    const app = await this.prisma.vendorOnboardingApplication.findUnique({ where: { tenantId } });
    if (!app) throw new NotFoundException('Onboarding application not found');
    if (!REVIEWABLE_STATUSES.includes(app.status)) throw new ConflictException(`Onboarding is ${app.status.toLowerCase().replaceAll('_', ' ')} and cannot be returned to draft`);
    const result = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.vendorOnboardingApplication.update({
        where: { id: app.id },
        data: { status: VendorOnboardingStatus.DRAFT, submittedAt: null, submittedById: null, reviewedAt: null, reviewedById: null, reviewReason: null },
        select: publicApplicationSelect,
      });
      await this.audit.write(tx, { actor, tenantId, action: 'VENDOR_ONBOARDING_REOPENED', entityType: 'VendorOnboardingApplication', entityId: app.id, reason: 'Returned to draft for vendor corrections', beforeState: { status: app.status }, afterState: { status: VendorOnboardingStatus.DRAFT, currentStep: updated.currentStep } });
      await this.outbox.enqueue(tx, { tenantId, eventType: 'VENDOR_ONBOARDING_REOPENED', aggregateType: 'VendorOnboardingApplication', aggregateId: app.id, payload: { status: VendorOnboardingStatus.DRAFT, currentStep: updated.currentStep } });
      return updated;
    });
    await this.onboardingEmail.notifyReview(tenantId, 'DRAFT', VendorOnboardingStatus.DRAFT, 'Your onboarding was returned to draft for corrections.');
    return { ...result, hasSignature: true, agreementVersion: result.agreementVersion || AGREEMENT_VERSION, documents: await this.documents(tenantId) };
  }
}
