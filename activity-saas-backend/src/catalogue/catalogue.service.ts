import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  Optional,
} from "@nestjs/common";
import { randomUUID } from "crypto";
import { fingerprint } from "../bookings/booking-fingerprint";
import {
  BookingMode,
  BookingQuestionType,
  BookingStatus,
  CapacityUnit,
  OperatingModel,
  Prisma,
  ProductRevisionStatus,
  ProductStatus,
  PricingUnit,
  ScheduleStatus,
  SessionStatus,
  SupplierCommercialModel,
  TenantKind,
  TravellerType,
  UserRole,
  VariantStatus,
} from "@prisma/client";
import { AuditService } from "../audit/audit.service";
import { AuthUser } from "../common/auth.types";
import { requireTenant } from "../common/tenant";
import { PublicEntity, allocatePublicCode, ensurePublicIdentifier, publicIdentifier, stateCode } from "../common/public-identifiers";
import { OutboxService } from "../outbox/outbox.service";
import { PrismaService } from "../prisma/prisma.service";
import { FilePurpose, FileVisibility } from "@prisma/client";
import { StorageService } from "../storage/storage.service";
import { validateFulfilmentPolicy } from "../fulfilment/fulfilment.types";
import {
  ActivityPricesAvailabilityDto,
  ArchiveVariantDto,
  CreateProductDraftDto,
  CreateProductDto,
  CreateProductRevisionDto,
  ImportProductJsonDto,
  VendorBulkRateUpdateDto,
  VendorBulkRateUpdateRowDto,
  ProductListingQueryDto,
  ProductMediaDto,
  ProductMediaUploadDto,
  ProductQueryDto,
  ProductRevisionDto,
  RejectProductRevisionDto,
  UpdateProductCurrencyDto,
  UpdateProductMediaRankDto,
  UpdateProductRevisionDto,
  UpdateVariantDto,
  VariantDto,
} from "./catalogue.dto";
import { ProductReadinessService } from "./product-readiness.service";
import { requiredVendorDocumentsForProduct } from "../vendor/vendor-document-requirements";
import { CommercialService } from "../commercial/commercial.service";
import { ChannelDistributionReadinessService } from "../distribution/channel-distribution-readiness.service";
import { RatePlansService } from "../rate-plans/rate-plans.service";
import { SchedulesService } from "../schedules/schedules.service";
import { SessionMaterializerService } from "../schedules/session-materializer.service";
import { CatalogueEmailService } from "./catalogue-email.service";
import {
  sameActivityRange,
  splitActivityPriceHistory,
  type ActivityPriceHistoryRange,
} from "./activity-pricing-history";

export function sourcePayloadForRole(
  role: UserRole,
  sourcePayload?: Record<string, unknown> | null,
): Record<string, unknown> | undefined {
  if (!sourcePayload) return undefined;
  const safe = { ...sourcePayload };
  if (role === UserRole.VENDOR) {
    delete safe.admin;
    delete safe.adminEdit;
  }
  return safe;
}

function changedJsonPaths(before: unknown, after: unknown, path = ""): string[] {
  if (JSON.stringify(before ?? null) === JSON.stringify(after ?? null)) return [];
  const isRecord = (value: unknown): value is Record<string, unknown> =>
    Boolean(value) && typeof value === "object" && !Array.isArray(value);
  if (!isRecord(before) || !isRecord(after)) return path ? [path] : [];
  const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
  return [...keys].flatMap((key) => {
    if (!path && key === "adminEdit") return [];
    const childPath = path ? `${path}.${key}` : key;
    return changedJsonPaths(before[key], after[key], childPath);
  });
}

function sourcePayloadForReader(role: UserRole, sourcePayload?: unknown) {
  if (!sourcePayload || typeof sourcePayload !== "object" || Array.isArray(sourcePayload)) return sourcePayload;
  const safe = { ...(sourcePayload as Record<string, unknown>) };
  if (role === UserRole.VENDOR) {
    delete safe.admin;
    const edit = safe.adminEdit && typeof safe.adminEdit === "object" && !Array.isArray(safe.adminEdit)
      ? safe.adminEdit as Record<string, unknown>
      : null;
    if (edit) safe.adminEdit = {
      editedByAdmin: Boolean(edit.editedByAdmin),
      lastEditedByName: typeof edit.lastEditedByName === "string" ? edit.lastEditedByName : null,
      lastEditedAt: typeof edit.lastEditedAt === "string" ? edit.lastEditedAt : null,
    };
  }
  return safe;
}

const revisionInclude = {
  media: { where: { archivedAt: null }, orderBy: { rank: "asc" as const } },
  bookingQuestions: {
    where: { archivedAt: null },
    orderBy: [{ rank: "asc" as const }, { code: "asc" as const }],
  },
  fulfilmentPolicy: true,
  product: {
    select: {
      id: true,
      tenantId: true,
      productCode: true,
      status: true,
      currentRevisionId: true,
    },
  },
};
const variantInclude = {
  ticketTypes: { orderBy: { rank: "asc" as const } },
  unitRows: { orderBy: { rank: "asc" as const } },
  ratePlans: {
    include: {
      travellerRules: true,
      cancellationRules: { orderBy: { minDaysBefore: "desc" as const } },
    },
    orderBy: { createdAt: "asc" as const },
  },
};
const reviewVariantInclude = {
  ...variantInclude,
  schedules: {
    where: { archivedAt: null },
    orderBy: { effectiveFrom: "asc" as const },
    include: {
      slotTemplates: {
        where: { archivedAt: null },
        orderBy: { rank: "asc" as const },
      },
    },
  },
};
const revisionCloneInclude = {
  media: { where: { archivedAt: null } },
  bookingQuestions: { where: { archivedAt: null } },
  fulfilmentPolicy: true,
  variants: {
    where: { status: { not: VariantStatus.ARCHIVED }, archivedAt: null },
    include: {
      ticketTypes: { orderBy: { rank: "asc" as const } },
      unitRows: { orderBy: { rank: "asc" as const } },
      ratePlans: {
        include: {
          travellerRules: true,
          cancellationRules: true,
          commercialVersions: { include: { travellerPrices: true } },
        },
      },
      schedules: {
        include: {
          slotTemplates: { where: { archivedAt: null } },
          ratePlanMappings: { where: { active: true } },
        },
      },
    },
  },
};

type ImageDimensions = { width: number; height: number };
const readImageDimensions = (
  buffer: Buffer,
  mimeType: string,
): ImageDimensions | null => {
  if (mimeType === "image/png" && buffer.length >= 24) {
    return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
  }
  if (mimeType === "image/jpeg" && buffer.length > 4) {
    let offset = 2;
    while (offset + 9 < buffer.length) {
      if (buffer[offset] !== 0xff) {
        offset += 1;
        continue;
      }
      while (buffer[offset] === 0xff) offset += 1;
      const marker = buffer[offset++];
      if (marker === 0xd8 || marker === 0xd9) continue;
      if (offset + 2 > buffer.length) break;
      const length = buffer.readUInt16BE(offset);
      if (length < 2 || offset + length > buffer.length) break;
      const isFrame =
        (marker >= 0xc0 && marker <= 0xc3) ||
        (marker >= 0xc5 && marker <= 0xc7) ||
        (marker >= 0xc9 && marker <= 0xcb) ||
        (marker >= 0xcd && marker <= 0xcf);
      if (isFrame && offset + 7 < buffer.length)
        return {
          width: buffer.readUInt16BE(offset + 5),
          height: buffer.readUInt16BE(offset + 3),
        };
      offset += length;
    }
  }
  if (
    mimeType === "image/webp" &&
    buffer.length >= 30 &&
    buffer.subarray(0, 4).toString() === "RIFF"
  ) {
    const chunk = buffer.subarray(12, 16).toString();
    if (chunk === "VP8X" && buffer.length >= 30) {
      const width = 1 + buffer[24] + (buffer[25] << 8) + (buffer[26] << 16);
      const height = 1 + buffer[27] + (buffer[28] << 8) + (buffer[29] << 16);
      return { width, height };
    }
    if (chunk === "VP8L" && buffer.length >= 25) {
      const width = 1 + buffer[21] + ((buffer[22] & 0x3f) << 8);
      const height =
        1 +
        ((buffer[22] >> 6) & 0x03) +
        (buffer[23] << 2) +
        ((buffer[24] & 0xf0) << 6);
      return { width, height };
    }
  }
  return null;
};
const startOfToday = () => {
  const value = new Date();
  value.setHours(0, 0, 0, 0);
  return value;
};
type ImportJsonRow = Record<string, unknown>;
type ImportIdentity = {
  sourceImportKey: string;
  importFingerprint: string;
  importIdempotencyKey?: string;
};
const importText = (row: ImportJsonRow, key: string) => {
  const value = row[key];
  return value == null ? "" : String(value).trim();
};
const importList = (row: ImportJsonRow, key: string) => {
  const value = row[key];
  if (Array.isArray(value))
    return value.map((item) => String(item).trim()).filter(Boolean);
  return importText(row, key)
    .split("|")
    .map((item) => item.trim())
    .filter(Boolean);
};
const importBool = (row: ImportJsonRow, key: string, fallback = false) => {
  const value = row[key];
  if (typeof value === "boolean") return value;
  const normalized = importText(row, key).toLowerCase();
  return normalized ? ["true", "yes", "1", "y"].includes(normalized) : fallback;
};
const importNumber = (row: ImportJsonRow, key: string, fallback = 0) => {
  const value = Number(row[key]);
  return Number.isFinite(value) ? value : fallback;
};
const sourceNumber = (row: ImportJsonRow, key: string) =>
  importText(row, key) ? importNumber(row, key) : undefined;
const importDate = (row: ImportJsonRow, key: string) => {
  const value = importText(row, key);
  if (!value || Number.isNaN(new Date(value).valueOf()))
    throw new BadRequestException(`Invalid ${key} date in JSON import`);
  return value;
};
const importContentFingerprint = (basic: ImportJsonRow) =>
  fingerprint({
    productName: importText(basic, "product_name").toLowerCase(),
    type: importText(basic, "type").toUpperCase(),
    city: importText(basic, "city").toLowerCase(),
    state: importText(basic, "state").toLowerCase(),
    country: importText(basic, "country").toLowerCase(),
  });
const normalizedDays = (values?: string[]) =>
  (values || []).map((day) => day.trim().toUpperCase()).filter(Boolean);
const normalizedSlotCodes = (values?: string[]) =>
  (values || []).map((slot) => slot.trim()).filter(Boolean);
const dateOnly = (value: string) =>
  new Date(`${value.slice(0, 10)}T00:00:00.000Z`);
const dateRangeDays = (from: Date, to: Date, days?: string[]) => {
  const selected = new Set(normalizedDays(days));
  let count = 0;
  for (
    let cursor = new Date(from);
    cursor < to;
    cursor.setUTCDate(cursor.getUTCDate() + 1)
  ) {
    const code = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"][
      cursor.getUTCDay()
    ];
    if (!selected.size || selected.has(code)) count += 1;
  }
  return count;
};
const dateRangesOverlap = (
  leftFrom: Date,
  leftTo: Date,
  rightFrom: Date,
  rightTo: Date,
) => leftFrom < rightTo && rightFrom < leftTo;
const isProtectedLegacyRatePlan = (plan: any) => {
  const payload = (plan?.sourcePayload || {}) as Record<string, unknown>;
  return Boolean(
    payload.specialContract ||
    payload.agentSpecific ||
    payload.promotional ||
    payload.protectedFromActivityEditor ||
    (plan?.channelMappings || []).some(
      (mapping: any) => mapping.status === "ACTIVE" || mapping.enabled === true,
    ),
  );
};
export const buildActivityEditorSourcePayload = (
  latestSourcePayload: Record<string, any>,
  visitorPricingEnabled: boolean | undefined,
  option: any,
  bookingRulesSnapshot?: any,
) => {
  const sourcePayload = { ...latestSourcePayload };
  if (visitorPricingEnabled === false) {
    delete sourcePayload.visitorPrices;
    delete sourcePayload.visitorEligibilityBasis;
    delete sourcePayload.visitorVerificationMode;
  } else if (option.visitorPrices?.length) {
    sourcePayload.visitorPrices = option.visitorPrices;
    sourcePayload.visitorEligibilityBasis =
      option.visitorEligibilityBasis || "RESIDENCY";
    sourcePayload.visitorVerificationMode =
      option.visitorVerificationMode || "NONE";
  }
  return {
    ...sourcePayload,
    createdFromActivityEditor: true,
    pricingTimezone: option.timezone || sourcePayload.pricingTimezone || "UTC",
    pricingDays: normalizedDays(option.pricingDays),
    pricingSlotCodes: normalizedSlotCodes(option.pricingSlotCodes),
    ...(option.maxPassengersPerResource
      ? { maxPassengersPerResource: option.maxPassengersPerResource }
      : {}),
    ...(option.mrpMode ? { mrpMode: option.mrpMode } : {}),
    ...(option.mrpAmount !== undefined ? { mrpAmount: option.mrpAmount } : {}),
    ...(option.mrpProof !== undefined ? { mrpProof: option.mrpProof } : {}),
    ...(option.ratePeriods ? { ratePeriods: option.ratePeriods } : {}),
    ...(option.availabilityBookingType
      ? { availabilityBookingType: option.availabilityBookingType }
      : {}),
    ...(option.openDatedValidityDays
      ? { openDatedValidityDays: option.openDatedValidityDays }
      : {}),
    ...(option.availabilityBlackouts
      ? { availabilityBlackouts: option.availabilityBlackouts }
      : {}),
    ...(option.availabilityStates
      ? { availabilityStates: option.availabilityStates }
      : {}),
    ...(bookingRulesSnapshot ? { bookingRules: bookingRulesSnapshot } : {}),
  };
};

@Injectable()
export class CatalogueService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly outbox: OutboxService,
    private readonly storage: StorageService,
    @Optional() private readonly readinessService?: ProductReadinessService,
    @Optional() private readonly commercial?: CommercialService,
    @Optional()
    private readonly distributionReadiness?: ChannelDistributionReadinessService,
    @Optional() private readonly ratePlans?: RatePlansService,
    @Optional() private readonly schedules?: SchedulesService,
    @Optional() private readonly materializer?: SessionMaterializerService,
    @Optional() private readonly catalogueEmail?: CatalogueEmailService,
  ) {}

  /** Validate the prototype's image quality contract before an asset reaches storage. */
  validateMediaFile(file: any, kind: string) {
    if (!file?.buffer?.length)
      throw new ConflictException("An image file is required");
    if (file.size < 1 * 1024 * 1024)
      throw new ConflictException("Product images must be at least 1 MB");
    if (file.size > 10 * 1024 * 1024)
      throw new ConflictException("Product images must be 10 MB or smaller");
    if (kind !== "IMAGE")
      throw new ConflictException(
        "Only image uploads are supported; add video as an external URL",
      );
    const mimeType =
      file.buffer[0] === 0xff &&
      file.buffer[1] === 0xd8 &&
      file.buffer[2] === 0xff
        ? "image/jpeg"
        : file.buffer
              .subarray(0, 8)
              .equals(
                Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
              )
          ? "image/png"
          : file.buffer.subarray(0, 4).toString() === "RIFF" &&
              file.buffer.subarray(8, 12).toString() === "WEBP"
            ? "image/webp"
            : null;
    if (!mimeType)
      throw new ConflictException(
        "Unsupported or invalid image signature; JPEG, PNG, or WebP required",
      );
    const dimensions = readImageDimensions(file.buffer, mimeType);
    if (!dimensions)
      throw new ConflictException(
        "Unable to verify image dimensions; upload a valid JPEG, PNG, or WebP image",
      );
    if (dimensions.width < 1500 || dimensions.height < 1000)
      throw new ConflictException(
        `Product images must be at least 1500 × 1000 pixels (received ${dimensions.width} × ${dimensions.height})`,
      );
    return {
      mimeType,
      extension:
        mimeType === "image/jpeg"
          ? ".jpg"
          : mimeType === "image/png"
            ? ".png"
            : ".webp",
    };
  }

  private data(
    dto: ProductRevisionDto | UpdateProductRevisionDto,
  ): Prisma.ProductRevisionUncheckedCreateInput {
    const {
      faqs,
      sourcePayload,
      fulfilmentPolicy: _fulfilmentPolicy,
      ...rest
    } = dto as ProductRevisionDto;
    return {
      ...rest,
      ...(faqs !== undefined ? { faqs: faqs as Prisma.InputJsonValue } : {}),
      ...(sourcePayload !== undefined
        ? { sourcePayload: sourcePayload as Prisma.InputJsonValue }
        : {}),
    } as Prisma.ProductRevisionUncheckedCreateInput;
  }

  private policyData(input: any) {
    return {
      mode: input.mode ?? null,
      requiredEvidenceKinds: input.requiredEvidenceKinds ?? [],
      evidenceMatchMode: input.evidenceMatchMode ?? "ALL",
      reviewRequired: input.reviewRequired ?? false,
      emergencyContactName: input.emergencyContactName?.trim() || null,
      emergencyContactPhone: input.emergencyContactPhone?.trim() || null,
      emergencyContactEmail: input.emergencyContactEmail?.trim() || null,
      operationsContactName: input.operationsContactName?.trim() || null,
      operationsContactPhone: input.operationsContactPhone?.trim() || null,
      operationsContactEmail: input.operationsContactEmail?.trim() || null,
      voucherNotes: (input.voucherNotes ?? [])
        .map((item: string) => item.trim())
        .filter(Boolean),
    };
  }

  private async syncTravellerDetailQuestions(
    tx: Prisma.TransactionClient,
    revisionId: string,
    value: string,
  ) {
    const selected = new Set(
      value
        .split(",")
        .map((item) => item.trim().toLowerCase())
        .filter(Boolean),
    );
    const definitions = [
      { label: "Lead name", code: "lead_name", appliesPerTraveller: false },
      { label: "Mobile", code: "mobile", appliesPerTraveller: false },
      {
        label: "Pickup hotel",
        code: "pickup_hotel",
        appliesPerTraveller: false,
      },
      {
        label: "Every traveller's name",
        code: "traveller_name",
        appliesPerTraveller: true,
      },
      { label: "Govt ID", code: "govt_id", appliesPerTraveller: true },
      { label: "Age / DOB", code: "age_dob", appliesPerTraveller: true },
    ];
    for (const [rank, definition] of definitions.entries()) {
      if (selected.has(definition.label.toLowerCase())) {
        await tx.productBookingQuestion.upsert({
          where: {
            productRevisionId_code: {
              productRevisionId: revisionId,
              code: definition.code,
            },
          },
          update: {
            label: definition.label,
            type: BookingQuestionType.TEXT,
            required: true,
            appliesPerTraveller: definition.appliesPerTraveller,
            rank,
            archivedAt: null,
          },
          create: {
            productRevisionId: revisionId,
            code: definition.code,
            label: definition.label,
            type: BookingQuestionType.TEXT,
            required: true,
            appliesPerTraveller: definition.appliesPerTraveller,
            rank,
          },
        });
      } else {
        await tx.productBookingQuestion.updateMany({
          where: {
            productRevisionId: revisionId,
            code: definition.code,
            archivedAt: null,
          },
          data: { archivedAt: new Date() },
        });
      }
    }
  }

  private async product(user: AuthUser, id: string) {
    const found = await this.prisma.product.findFirst({
      where: {
        id,
        ...(user.role === UserRole.VENDOR
          ? { tenantId: requireTenant(user) }
          : { tenant: { kind: TenantKind.VENDOR } }),
        deletedAt: null,
      },
    });
    if (!found) throw new NotFoundException("Product not found");
    return found;
  }

  private async tenantForRevision(user: AuthUser, revisionId: string) {
    if (user.role === UserRole.VENDOR) return requireTenant(user);
    const revision = await this.prisma.productRevision.findFirst({
      where: {
        id: revisionId,
        product: { tenant: { kind: TenantKind.VENDOR } },
      },
      select: { product: { select: { tenantId: true } } },
    });
    if (!revision) throw new NotFoundException("Product revision not found");
    return revision.product.tenantId;
  }

  private async tenantForVariant(user: AuthUser, variantId: string) {
    if (user.role === UserRole.VENDOR) return requireTenant(user);
    const variant = await this.prisma.productVariant.findFirst({
      where: {
        id: variantId,
        product: { tenant: { kind: TenantKind.VENDOR } },
      },
      select: { product: { select: { tenantId: true } } },
    });
    if (!variant) throw new NotFoundException("Product variant not found");
    return variant.product.tenantId;
  }

  private async tenantForQuestion(user: AuthUser, questionId: string) {
    if (user.role === UserRole.VENDOR) return requireTenant(user);
    const question = await this.prisma.productBookingQuestion.findFirst({
      where: {
        id: questionId,
        productRevision: { product: { tenant: { kind: TenantKind.VENDOR } } },
      },
      select: {
        productRevision: {
          select: { product: { select: { tenantId: true } } },
        },
      },
    });
    if (!question) throw new NotFoundException("Booking question not found");
    return question.productRevision.product.tenantId;
  }

  private assertMutableRevision(revision: { status: ProductRevisionStatus }) {
    if (revision.status !== ProductRevisionStatus.DRAFT)
      throw new ConflictException("Only a DRAFT revision can be changed");
  }

  private isAdminActor(user: AuthUser) {
    return user.role === UserRole.ADMIN || user.role === UserRole.SUPER_ADMIN;
  }

  private async tagAdminRevisionEdit(
    tx: Prisma.TransactionClient,
    revisionId: string,
    user: AuthUser,
    changedFields: string[],
  ) {
    if (!this.isAdminActor(user)) return false;
    await tx.$queryRaw(
      Prisma.sql`SELECT "id" FROM "public"."ProductRevision" WHERE "id" = ${revisionId} FOR UPDATE`,
    );
    const revision = await tx.productRevision.findUnique({
      where: { id: revisionId },
      select: {
        id: true,
        productId: true,
        status: true,
        sourcePayload: true,
        product: { select: { tenantId: true } },
      },
    });
    if (!revision) throw new NotFoundException("Product revision not found");
    this.assertMutableRevision(revision);
    const before = (revision.sourcePayload || {}) as Record<string, unknown>;
    const prior = before.adminEdit && typeof before.adminEdit === "object"
      ? before.adminEdit as Record<string, unknown>
      : {};
    const editedAt = new Date().toISOString();
    const adminEdit = {
      ...prior,
      editedByAdmin: true,
      lastEditedById: user.sub,
      lastEditedByName: user.fullName || user.email,
      lastEditedAt: editedAt,
      changedFields: [...new Set([
        ...(Array.isArray(prior.changedFields) ? prior.changedFields.filter((field): field is string => typeof field === "string") : []),
        ...changedFields,
      ])],
    };
    await tx.productRevision.update({
      where: { id: revisionId },
      data: { sourcePayload: { ...before, adminEdit } as Prisma.InputJsonValue },
    });
    await this.audit.write(tx, {
      actor: user,
      tenantId: revision.product.tenantId,
      action: "PRODUCT_ADMIN_EDITED",
      entityType: "ProductRevision",
      entityId: revisionId,
      metadata: { productId: revision.productId, revisionId, changedFields, editedAt },
    });
    await this.outbox.enqueue(tx, {
      tenantId: revision.product.tenantId,
      eventType: "PRODUCT_ADMIN_EDITED",
      aggregateType: "ProductRevision",
      aggregateId: revisionId,
      payload: { productId: revision.productId, revisionId, changedFields, editedAt },
    });
    return true;
  }

  private async notifyAdminRevisionEdited(revisionId: string, user: AuthUser) {
    if (!this.isAdminActor(user)) return;
    await this.notifyCatalogueEmail("admin edit", () =>
      this.catalogueEmail?.notifyAdminEdited(revisionId, user.fullName || user.email),
    );
  }

  async list(user: AuthUser, query: ProductQueryDto) {
    const tenantId = requireTenant(user);
    return this.prisma.product.findMany({
      where: {
        tenantId,
        deletedAt: null,
        ...(query.search
          ? { productCode: { contains: query.search, mode: "insensitive" } }
          : {}),
        ...(query.revisionStatus
          ? { revisions: { some: { status: query.revisionStatus } } }
          : {}),
      },
      include: {
        currentRevision: true,
        revisions: {
          where: {
            status: {
              in: [
                ProductRevisionStatus.DRAFT,
                ProductRevisionStatus.UNDER_REVIEW,
                ProductRevisionStatus.REJECTED,
              ],
            },
          },
          orderBy: { versionNumber: "desc" },
          take: 1,
        },
        _count: { select: { variants: true, bookings: true } },
      },
      orderBy: { updatedAt: "desc" },
    });
  }

  /**
   * Vendor-facing table projection. This intentionally does not expose the raw
   * catalogue graph used by the editor; revision precedence and counters are
   * resolved here so the browser cannot accidentally present a draft as live.
   */
  async listing(user: AuthUser, query: ProductListingQueryDto) {
    const tenantId = requireTenant(user);
    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(query.limit) || 25));
    const search = query.search?.trim();
    const where: any = { tenantId, deletedAt: null };
    if (search) {
      const publicMatches = this.prisma.publicIdentifier
        ? await this.prisma.publicIdentifier.findMany({
            where: {
              entityType: PublicEntity.PRODUCT,
              publicCode: { contains: search, mode: "insensitive" },
            },
            select: { entityId: true },
          })
        : [];
      where.OR = [
        { productCode: { contains: search, mode: "insensitive" } },
        ...(publicMatches.length
          ? [{ id: { in: publicMatches.map((row: any) => row.entityId) } }]
          : []),
        {
          currentRevision: {
            productName: { contains: search, mode: "insensitive" },
          },
        },
        {
          currentRevision: {
            cityName: { contains: search, mode: "insensitive" },
          },
        },
        {
          currentRevision: {
            stateName: { contains: search, mode: "insensitive" },
          },
        },
        {
          currentRevision: {
            subCategory: { contains: search, mode: "insensitive" },
          },
        },
        {
          revisions: {
            some: { productName: { contains: search, mode: "insensitive" } },
          },
        },
        {
          revisions: {
            some: { cityName: { contains: search, mode: "insensitive" } },
          },
        },
        {
          revisions: {
            some: { stateName: { contains: search, mode: "insensitive" } },
          },
        },
        {
          revisions: {
            some: { subCategory: { contains: search, mode: "insensitive" } },
          },
        },
      ];
    }
    if (query.status === "LIVE")
      where.AND = [
        ...(where.AND || []),
        {
          status: ProductStatus.LIVE,
          currentRevision: { status: ProductRevisionStatus.PUBLISHED },
        },
      ];
    if (query.status === "REVIEW")
      where.AND = [
        ...(where.AND || []),
        {
          currentRevision: { status: { not: ProductRevisionStatus.PUBLISHED } },
        },
        { revisions: { some: { status: ProductRevisionStatus.UNDER_REVIEW } } },
      ];
    if (query.status === "DRAFT")
      where.AND = [
        ...(where.AND || []),
        { status: ProductStatus.DRAFT },
        { revisions: { some: { status: ProductRevisionStatus.DRAFT } } },
        { revisions: { none: { status: ProductRevisionStatus.UNDER_REVIEW } } },
        { revisions: { none: { status: ProductRevisionStatus.REJECTED } } },
      ];
    if (query.status === "SUSPENDED")
      where.AND = [...(where.AND || []), { status: ProductStatus.SUSPENDED }];
    if (query.status === "ARCHIVED")
      where.AND = [...(where.AND || []), { status: ProductStatus.ARCHIVED }];

    const revisionSelect = {
      id: true,
      versionNumber: true,
      status: true,
      productName: true,
      type: true,
      subType: true,
      category: true,
      cityName: true,
      stateName: true,
      countryName: true,
      subCategory: true,
      shortDescription: true,
      description: true,
      highlights: true,
      included: true,
      notIncluded: true,
      terms: true,
      importantInfo: true,
      thingsToCarry: true,
      safetyMeasures: true,
      durationValue: true,
      durationUnit: true,
      meetingPoint: true,
      endPoint: true,
      cancellationPreset: true,
      voucherCodeSource: true,
      voucherAcceptedAs: true,
      voucherInstructions: true,
      media: { where: { archivedAt: null }, select: { id: true, kind: true } },
      itineraryStops: { select: { id: true } },
      bookingQuestions: { where: { archivedAt: null }, select: { id: true } },
      fulfilmentPolicy: { select: { mode: true } },
      updatedAt: true,
    };
    const include: any = {
      currentRevision: { select: revisionSelect },
      revisions: {
        where: {
          status: {
            in: [
              ProductRevisionStatus.DRAFT,
              ProductRevisionStatus.UNDER_REVIEW,
              ProductRevisionStatus.REJECTED,
            ],
          },
        },
        orderBy: { versionNumber: "desc" },
        select: revisionSelect,
      },
      variants: {
        where: { status: { not: VariantStatus.ARCHIVED }, archivedAt: null },
        select: {
          id: true,
          status: true,
          revisionId: true,
          ratePlans: {
            where: { status: "ACTIVE" },
            select: {
              id: true,
              status: true,
              validFrom: true,
              validTo: true,
              cutOffMinutes: true,
              adultRequired: true,
              minAdultRequired: true,
              unitType: true,
              travellerRules: true,
              cancellationRules: true,
              commercialVersions: {
                where: { status: { in: ["ACTIVE", "DRAFT"] } },
                orderBy: { versionNumber: "desc" },
                take: 1,
                include: { travellerPrices: true },
              },
              scheduleMappings: {
                where: { active: true },
                select: { scheduleTemplateId: true },
              },
            },
          },
          schedules: {
            where: { status: ScheduleStatus.ACTIVE, archivedAt: null },
            select: {
              id: true,
              effectiveFrom: true,
              effectiveTo: true,
              ratePlanMappings: {
                where: { active: true },
                select: { ratePlanId: true },
              },
              resourceRequirements: {
                where: { active: true, archivedAt: null },
                include: { specificResource: true },
              },
              sessions: {
                where: {
                  serviceDate: { gte: startOfToday() },
                  status: SessionStatus.OPEN,
                  archivedAt: null,
                },
                select: {
                  serviceDate: true,
                  startsAt: true,
                  inventoryState: true,
                  resourceAllocations: {
                    where: { status: "ACTIVE", releasedAt: null },
                    include: { resource: true },
                  },
                },
                orderBy: { serviceDate: "asc" },
                take: 30,
              },
            },
          },
        },
      },
    };
    const [total, products, summaryRows] = await Promise.all([
      this.prisma.product.count({ where }),
      this.prisma.product.findMany({
        where,
        include,
        orderBy: { updatedAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.product.findMany({
        where,
        select: {
          status: true,
          currentRevision: { select: { status: true } },
          revisions: {
            where: {
              status: {
                in: [
                  ProductRevisionStatus.DRAFT,
                  ProductRevisionStatus.UNDER_REVIEW,
                ],
              },
            },
            select: { status: true },
          },
        },
      }),
    ]);
    const summary = summaryRows.reduce(
      (counts, product: any) => {
        if (
          product.status === ProductStatus.LIVE &&
          product.currentRevision?.status === ProductRevisionStatus.PUBLISHED
        )
          counts.live += 1;
        if (
          product.revisions.some(
            (revision: any) =>
              revision.status === ProductRevisionStatus.UNDER_REVIEW,
          )
        )
          counts.review += 1;
        if (
          product.revisions.some(
            (revision: any) => revision.status === ProductRevisionStatus.DRAFT,
          )
        )
          counts.draft += 1;
        return counts;
      },
      { live: 0, review: 0, draft: 0 },
    );
    const productIds = (products as any[]).map((product) => product.id);
    const bookingCounts = productIds.length
      ? await this.prisma.booking.groupBy({
          by: ["productId"],
          where: {
            vendorTenantId: tenantId,
            productId: { in: productIds },
            createdAt: { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) },
            status: { not: BookingStatus.CANCELLED },
          },
          _count: { _all: true },
        })
      : [];
    const bookingCountByProduct = new Map(
      bookingCounts.map((row) => [row.productId, row._count._all]),
    );
    const items = await Promise.all(
      (products as any[]).map((product) =>
        this.toListingItem(user, {
          ...product,
          bookingCount30d: bookingCountByProduct.get(product.id) || 0,
        }),
      ),
    );
    return {
      items,
      summary,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }

  private contentScore(revision: any) {
    if (!revision) return { score: null, status: "NOT_SCORED" as const };
    const hasText = (value: unknown) =>
      typeof value === "string" && value.trim().length > 0;
    const hasList = (value: unknown, minimum = 1) =>
      Array.isArray(value) &&
      value.filter(
        (item) => (item !== null && typeof item === "object") || hasText(item),
      ).length >= minimum;
    const checks = [
      hasText(revision.productName),
      hasText(revision.type),
      hasText(revision.subType),
      hasText(revision.category),
      hasText(revision.cityName) &&
        hasText(revision.stateName) &&
        hasText(revision.countryName),
      hasText(revision.shortDescription),
      hasText(revision.description),
      hasList(revision.highlights, 3),
      hasList(revision.included),
      hasList(revision.notIncluded),
      hasList(revision.itineraryStops),
      hasText(revision.durationValue) && hasText(revision.durationUnit),
      hasText(revision.endPoint || revision.meetingPoint),
      hasList(revision.media),
      hasList(revision.terms),
      hasText(revision.cancellationPreset),
      hasText(revision.voucherCodeSource) &&
        hasText(revision.voucherAcceptedAs) &&
        hasText(revision.voucherInstructions),
      hasText(revision.fulfilmentPolicy?.mode),
      hasList(revision.bookingQuestions),
    ];
    return {
      score: Math.round((checks.filter(Boolean).length / checks.length) * 100),
      status: "SCORED" as const,
    };
  }

  private async toListingItem(user: AuthUser, product: any) {
    const revisions = product.revisions || [];
    const published =
      product.currentRevision?.status === ProductRevisionStatus.PUBLISHED
        ? product.currentRevision
        : null;
    const working =
      revisions.find(
        (revision: any) =>
          revision.status === ProductRevisionStatus.DRAFT ||
          revision.status === ProductRevisionStatus.UNDER_REVIEW,
      ) || null;
    const rejected =
      revisions.find(
        (revision: any) => revision.status === ProductRevisionStatus.REJECTED,
      ) || null;
    const display = published || working || rejected || product.currentRevision;
    const displayStatus =
      product.status === ProductStatus.ARCHIVED
        ? "ARCHIVED"
        : product.status === ProductStatus.SUSPENDED
          ? "SUSPENDED"
          : published
            ? "PUBLISHED"
            : working?.status === ProductRevisionStatus.UNDER_REVIEW
              ? "UNDER_REVIEW"
              : rejected
                ? "NEEDS_CHANGES"
                : "DRAFT";
    const publishedVariants = (product.variants || []).filter(
      (variant: any) =>
        !published ||
        variant.revisionId === published.id ||
        (!variant.revisionId && product.currentRevisionId === published.id),
    );
    const workingVariants = working
      ? (product.variants || []).filter(
          (variant: any) => variant.revisionId === working.id,
        )
      : [];
    const displayVariants =
      working && workingVariants.length ? workingVariants : publishedVariants;
    const readiness = await this.aggregateBookability(
      user,
      { ...product, variants: publishedVariants },
      published,
    );
    const distribution = this.distributionReadiness
      ? await this.distributionReadiness.evaluate(product.id)
      : {
          channelCode: "VOYA_AGENT",
          ready: false,
          status: "PENDING",
          reasonCodes: ["CHANNEL_PRODUCT_NOT_MAPPED"],
        };
    const updatedAt = [
      product.updatedAt,
      published?.updatedAt,
      working?.updatedAt,
      rejected?.updatedAt,
    ]
      .filter(Boolean)
      .map((value: Date) => value.getTime())
      .reduce((max: number, value: number) => Math.max(max, value), 0);
    const actions =
      displayStatus === "UNDER_REVIEW"
        ? ["OPEN", "WITHDRAW"]
        : displayStatus === "PUBLISHED"
          ? ["OPEN", "DEACTIVATE"]
          : displayStatus === "SUSPENDED"
            ? ["OPEN", "REACTIVATE", "ARCHIVE"]
            : displayStatus === "ARCHIVED"
              ? ["OPEN", "REACTIVATE"]
              : ["OPEN", "EDIT", "SUBMIT", "DELETE"];
    return {
      id: product.id,
      productCode:
        (await publicIdentifier(this.prisma, PublicEntity.PRODUCT, product.id)) ||
        product.productCode,
      experienceName: display?.productName || "Untitled product",
      type: display?.type || null,
      subType: display?.subType || null,
      destination:
        [display?.cityName, display?.stateName].filter(Boolean).join(", ") ||
        null,
      optionCount: displayVariants.length,
      productStatus: product.status,
      displayStatus,
      currentRevisionId: product.currentRevisionId || null,
      workingRevisionId: working?.id || null,
      workingRevisionStatus: working?.status || null,
      updatedAt: new Date(updatedAt || Date.now()).toISOString(),
      bookings30d: product.bookingCount30d || 0,
      startingPrice: displayVariants
        .flatMap((variant: any) =>
          (variant.ratePlans || []).flatMap((plan: any) =>
            (plan.commercialVersions?.[0]?.travellerPrices || []).map(
              (price: any) => Number(price.amount),
            ),
          ),
        )
        .filter((amount: number) => Number.isFinite(amount))
        .reduce(
          (minimum: number | null, amount: number) =>
            minimum === null ? amount : Math.min(minimum, amount),
          null,
        ),
      bookability: readiness,
      distribution,
      quality: this.contentScore(display),
      action: displayStatus === "NEEDS_CHANGES" ? "FIX" : "OPEN",
      actions,
    };
  }

  private async aggregateBookability(
    user: AuthUser,
    product: any,
    published: any,
  ) {
    const notEvaluated = (reasonCodes: string[]) => ({
      status: "NOT_EVALUATED",
      reasonCodes,
    });
    if (product.status !== ProductStatus.LIVE || !published)
      return notEvaluated(["PRODUCT_NOT_LIVE"]);
    const now = new Date();
    let commercialBlocked = false;
    for (const variant of product.variants || []) {
      for (const plan of variant.ratePlans || []) {
        if (new Date(plan.validFrom) > now || new Date(plan.validTo) <= now)
          continue;
        if (!plan.cancellationRules?.length) continue;
        const version = plan.commercialVersions?.[0];
        if (!version) continue;
        // Aggregate bookability still uses the canonical commercial gate. The
        // service call is bounded to candidate plans and avoids claiming that
        // an active-but-incomplete draft version can sell.
        if (this.commercial) {
          const commercialReadiness = await this.commercial.readiness(
            user,
            plan.id,
            now,
          );
          if (!commercialReadiness.ready) {
            commercialBlocked = true;
            continue;
          }
        }
        const planSchedules = (variant.schedules || []).filter(
          (schedule: any) =>
            schedule.ratePlanMappings?.some(
              (mapping: any) => mapping.ratePlanId === plan.id,
            ),
        );
        for (const schedule of planSchedules) {
          const effective =
            new Date(schedule.effectiveFrom) <= now &&
            (!schedule.effectiveTo || new Date(schedule.effectiveTo) > now);
          if (!effective) continue;
          for (const session of schedule.sessions || []) {
            const inventory = session.inventoryState;
            const available =
              inventory &&
              inventory.totalCapacity -
                inventory.blockedCapacity -
                inventory.heldCapacity -
                inventory.confirmedCapacity >
                0;
            const cutoffOpen =
              !session.startsAt ||
              new Date(session.startsAt).getTime() >
                now.getTime() + (plan.cutOffMinutes || 0) * 60000;
            const resourcesReady = (schedule.resourceRequirements || [])
              .filter((requirement: any) => requirement.required)
              .every((requirement: any) => {
                if (
                  requirement.specificResource &&
                  (!requirement.specificResource.active ||
                    requirement.specificResource.archivedAt)
                )
                  return false;
                return (session.resourceAllocations || []).some(
                  (allocation: any) =>
                    allocation.resource?.active &&
                    !allocation.resource?.archivedAt &&
                    allocation.resource.type === requirement.resourceType &&
                    allocation.quantity >= requirement.quantity,
                );
              });
            if (available && cutoffOpen && resourcesReady)
              return { status: "BOOKABLE", reasonCodes: [] };
          }
        }
      }
    }
    const hasMappedPlan = (product.variants || []).some((variant: any) =>
      (variant.ratePlans || []).some((plan: any) =>
        (variant.schedules || []).some((schedule: any) =>
          schedule.ratePlanMappings?.some(
            (mapping: any) => mapping.ratePlanId === plan.id,
          ),
        ),
      ),
    );
    const hasFutureSession = (product.variants || []).some((variant: any) =>
      (variant.schedules || []).some(
        (schedule: any) => (schedule.sessions || []).length,
      ),
    );
    return notEvaluated([
      ...(commercialBlocked ? ["COMMERCIAL_NOT_READY"] : []),
      ...(hasMappedPlan ? [] : ["RATE_PLAN_NOT_MAPPED"]),
      ...(hasFutureSession
        ? ["INVENTORY_OR_RESOURCE_NOT_READY"]
        : ["NO_FUTURE_SESSION"]),
    ]);
  }

  async get(user: AuthUser, id: string) {
    const ownedProduct = await this.product(user, id);
    const availabilityReadModel = {
      where: { status: ScheduleStatus.ACTIVE, archivedAt: null },
      select: {
        id: true,
        effectiveFrom: true,
        effectiveTo: true,
        timezone: true,
        operatingDays: true,
        capacityUnit: true,
        defaultCapacity: true,
        slotTemplates: {
          where: { archivedAt: null },
          orderBy: { rank: "asc" as const },
        },
        sessions: {
          where: { serviceDate: { gte: new Date() }, archivedAt: null },
          orderBy: { serviceDate: "asc" as const },
          take: 400,
          select: {
            serviceDate: true,
            status: true,
            inventoryState: {
              select: {
                totalCapacity: true,
                blockedCapacity: true,
                heldCapacity: true,
                confirmedCapacity: true,
              },
            },
          },
        },
      },
    };
    const result: any = await this.prisma.product.findFirstOrThrow({
      where: { id, tenantId: ownedProduct.tenantId, deletedAt: null },
      include: {
        currentRevision: {
          include: {
            media: { where: { archivedAt: null }, orderBy: { rank: "asc" } },
            bookingQuestions: {
              where: { archivedAt: null },
              orderBy: [{ rank: "asc" }, { code: "asc" }],
            },
            fulfilmentPolicy: true,
          },
        },
        revisions: {
          orderBy: { versionNumber: "desc" },
          include: {
            media: { where: { archivedAt: null }, orderBy: { rank: "asc" } },
            bookingQuestions: {
              where: { archivedAt: null },
              orderBy: [{ rank: "asc" }, { code: "asc" }],
            },
            fulfilmentPolicy: true,
          },
        },
        variants: {
          where: { status: { not: VariantStatus.ARCHIVED } },
          include: { ...variantInclude, schedules: availabilityReadModel },
        },
        _count: { select: { variants: true, bookings: true } },
      },
    });
    const selectedRevision =
      result.revisions.find(
        (revision: any) =>
          revision.status === ProductRevisionStatus.DRAFT ||
          revision.status === ProductRevisionStatus.UNDER_REVIEW,
      ) ||
      result.currentRevision ||
      result.revisions.find(
        (revision: any) => revision.status === ProductRevisionStatus.REJECTED,
      );
    const allVariants = result.variants || [];
    const revisionVariants = allVariants.filter(
      (variant: any) =>
        !selectedRevision ||
        variant.revisionId === selectedRevision.id ||
        (!variant.revisionId &&
          result.currentRevisionId === selectedRevision.id),
    );
    // Older catalogue rows may have been created before revisionId was populated
    // or may still point at a superseded draft. Do not make a real product look
    // like it has no options in the shared Create/Edit wizard; the active option
    // records are still the canonical source for that product.
    result.variants =
      revisionVariants.length || !allVariants.length
        ? revisionVariants
        : allVariants;
    if (user.role === UserRole.VENDOR) {
      if (result.currentRevision)
        result.currentRevision = { ...result.currentRevision, sourcePayload: sourcePayloadForReader(user.role, result.currentRevision.sourcePayload) ?? null };
      result.revisions = result.revisions.map((revision: any) => ({
        ...revision,
        sourcePayload: sourcePayloadForReader(user.role, revision.sourcePayload) ?? null,
      }));
    }
    result.publicCode = await publicIdentifier(this.prisma, PublicEntity.PRODUCT, result.id);
    return result;
  }

  async adminItinerary(revisionId: string) {
    const revision = await this.prisma.productRevision.findFirst({
      where: { id: revisionId, product: { tenant: { kind: TenantKind.VENDOR }, deletedAt: null } },
      select: { id: true },
    });
    if (!revision) throw new NotFoundException("Product revision not found");
    return this.prisma.itineraryStop.findMany({ where: { productRevisionId: revisionId }, orderBy: { sequence: "asc" } });
  }

  async replaceAdminItinerary(user: AuthUser, revisionId: string, input: Record<string, unknown>) {
    const revision = await this.prisma.productRevision.findFirst({
      where: { id: revisionId, product: { tenant: { kind: TenantKind.VENDOR }, deletedAt: null }, status: ProductRevisionStatus.DRAFT },
      select: { id: true, productId: true, product: { select: { tenantId: true } } },
    });
    if (!revision) throw new NotFoundException("Editable product revision not found");
    const rawStops = Array.isArray(input.stops) ? input.stops : [];
    const stops = rawStops.map((raw, index) => {
      const item = raw as Record<string, unknown>;
      const stopName = String(item.stopName || "").trim();
      if (!stopName) throw new BadRequestException(`Itinerary stop ${index + 1} needs a name.`);
      const positiveInt = (value: unknown) => value == null || value === "" ? null : Math.max(0, Math.round(Number(value)));
      const rawStopType = String(item.stopType || "guided").trim();
      const normalizedStopType = ["MEETING_POINT", "ACTIVITY", "MEAL", "TRANSFER", "ATTRACTION", "FREE_TIME"].includes(rawStopType.toUpperCase()) ? rawStopType.toUpperCase() : rawStopType.toLowerCase();
      return { productRevisionId: revisionId, sequence: index + 1, stopName, stopType: normalizedStopType, stayDurationMinutes: positiveInt(item.stayDurationMinutes), travelTimeToNextMinutes: positiveInt(item.travelTimeToNextMinutes), ticketPolicy: String(item.ticketPolicy || "").trim() || null, replacementStop: String(item.replacementStop || "").trim() || null };
    });
    if (stops.some((stop) => (stop.stayDurationMinutes !== null && !Number.isFinite(stop.stayDurationMinutes)) || (stop.travelTimeToNextMinutes !== null && !Number.isFinite(stop.travelTimeToNextMinutes)))) throw new BadRequestException("Itinerary durations must be valid numbers.");
    await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "public"."ProductRevision" WHERE "id" = ${revisionId} FOR UPDATE`);
      const current = await tx.productRevision.findUniqueOrThrow({ where: { id: revisionId } });
      this.assertMutableRevision(current);
      await tx.itineraryStop.deleteMany({ where: { productRevisionId: revisionId } });
      if (stops.length) await tx.itineraryStop.createMany({ data: stops });
      await this.tagAdminRevisionEdit(tx, revisionId, user, ["itinerary"]);
    });
    const result = await this.prisma.itineraryStop.findMany({ where: { productRevisionId: revisionId }, orderBy: { sequence: "asc" } });
    await this.notifyAdminRevisionEdited(revisionId, user);
    return result;
  }

  async saveAdminLocation(user: AuthUser, revisionId: string, input: Record<string, unknown>) {
    const revision = await this.prisma.productRevision.findFirst({
      where: { id: revisionId, product: { tenant: { kind: TenantKind.VENDOR }, deletedAt: null }, status: ProductRevisionStatus.DRAFT },
      select: { id: true },
    });
    if (!revision) throw new NotFoundException("Editable product revision not found");
    const lat = input.lat == null || input.lat === "" ? null : Number(input.lat);
    const lon = input.lon == null || input.lon === "" ? null : Number(input.lon);
    if ((lat !== null && !Number.isFinite(lat)) || (lon !== null && !Number.isFinite(lon))) throw new BadRequestException("Latitude and longitude must be valid numbers.");
    const data = { address: String(input.address || "") || null, lat, lon, meetingPoint: String(input.meetingPoint || "") || null, provider: String(input.provider || "") || null, providerPlaceId: String(input.providerPlaceId || "") || null, sourceUrl: String(input.sourceUrl || "") || null, verifiedAt: new Date() };
    const result = await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "public"."ProductRevision" WHERE "id" = ${revisionId} FOR UPDATE`);
      const current = await tx.productRevision.findUniqueOrThrow({ where: { id: revisionId } });
      this.assertMutableRevision(current);
      const saved = await tx.productLocationVerification.upsert({ where: { productRevisionId: revisionId }, update: data, create: { productRevisionId: revisionId, ...data } });
      await this.tagAdminRevisionEdit(tx, revisionId, user, ["location"]);
      return saved;
    });
    await this.notifyAdminRevisionEdited(revisionId, user);
    return result;
  }

  async create(user: AuthUser, dto: CreateProductDto) {
    const tenantId = requireTenant(user);
    if (!dto.initialRevision)
      throw new BadRequestException("initialRevision is required");
    const initialRevision = {
      ...dto.initialRevision,
      sourcePayload: sourcePayloadForRole(user.role, dto.initialRevision.sourcePayload) || undefined,
    };
    const created = await this.prisma
      .$transaction(async (tx) => {
        const product = await tx.product.create({
          data: {
            tenantId,
            productCode: dto.productCode,
            currency: dto.currency?.trim().toUpperCase() || "INR",
            status: ProductStatus.DRAFT,
          },
        });
        await ensurePublicIdentifier(
          tx,
          PublicEntity.PRODUCT,
          product.id,
          await allocatePublicCode(
            tx,
            PublicEntity.PRODUCT,
            `TA-${stateCode((dto.initialRevision as any).stateName)}-`,
            4,
          ),
        );
        const revision = await tx.productRevision.create({
          data: {
            ...this.data(initialRevision),
            productId: product.id,
            versionNumber: 1,
            createdById: user.sub,
          },
        });
        await tx.product.update({
          where: { id: product.id },
          data: { currentRevisionId: revision.id },
        });
        if (initialRevision.fulfilmentPolicy)
          await tx.productFulfilmentPolicy.create({
            data: {
              productRevisionId: revision.id,
              ...this.policyData(initialRevision.fulfilmentPolicy),
            },
          });
        await this.audit.write(tx, {
          actor: user,
          tenantId,
          action: "PRODUCT_CREATED",
          entityType: "Product",
          entityId: product.id,
          afterState: {
            productCode: product.productCode,
            status: product.status,
          },
        });
        return product;
      })
      .catch((error) => {
        if (error?.code === "P2002")
          throw new ConflictException(
            "A product with this productCode already exists",
          );
        throw error;
      });
    return this.get(user, created.id);
  }

  async createDraft(
    user: AuthUser,
    dto: CreateProductDraftDto,
    identity?: ImportIdentity,
  ) {
    return this.createDraftForTenant(user, requireTenant(user), dto, identity);
  }

  async createDraftAsAdmin(
    user: AuthUser,
    tenantId: string,
    dto: CreateProductDraftDto,
  ) {
    if (user.role !== UserRole.ADMIN && user.role !== UserRole.SUPER_ADMIN)
      throw new ConflictException(
        "Only platform admins can create a product on behalf of a vendor",
      );
    const tenant = await this.prisma.tenant.findFirst({
      where: { id: tenantId, kind: "VENDOR" },
      select: { id: true },
    });
    if (!tenant) throw new NotFoundException("Vendor tenant not found");
    return this.createDraftForTenant(user, tenant.id, dto);
  }

  private async createDraftForTenant(
    user: AuthUser,
    tenantId: string,
    dto: CreateProductDraftDto,
    identity?: ImportIdentity,
  ) {
    let draftIdentity = identity;
    if (dto.importMode) {
      const importFingerprint = fingerprint({
        productName: dto.productName.trim().toLowerCase(),
        type: String(dto.type).toUpperCase(),
        city: (dto.cityName || "").trim().toLowerCase(),
        state: (dto.stateName || "").trim().toLowerCase(),
        country: (dto.countryName || "").trim().toLowerCase(),
      });
      const sourceImportKey =
        dto.sourceImportKey?.trim().toUpperCase() ||
        `FINGERPRINT-${importFingerprint}`;
      const existingByKey = await this.prisma.product.findFirst({
        where: { tenantId, sourceImportKey },
      });
      if (existingByKey)
        await this.importExistingProduct(user, existingByKey.id, "product_key");
      const existingByFingerprint = await this.prisma.product.findFirst({
        where: { tenantId, importFingerprint },
      });
      if (existingByFingerprint)
        await this.importExistingProduct(
          user,
          existingByFingerprint.id,
          "content_fingerprint",
        );
      const existingLegacyByFingerprint = await this.prisma.product.findFirst({
        where: {
          tenantId,
          deletedAt: null,
          importFingerprint: null,
          revisions: {
            some: {
              productName: {
                equals: dto.productName.trim(),
                mode: "insensitive",
              },
              type: dto.type,
              cityName: {
                equals: (dto.cityName || "").trim(),
                mode: "insensitive",
              },
              stateName: {
                equals: (dto.stateName || "").trim(),
                mode: "insensitive",
              },
              countryName: {
                equals: (dto.countryName || "").trim(),
                mode: "insensitive",
              },
            },
          },
        },
        select: { id: true },
      });
      if (existingLegacyByFingerprint)
        await this.importExistingProduct(
          user,
          existingLegacyByFingerprint.id,
          "content_fingerprint_legacy",
        );
      draftIdentity = { sourceImportKey, importFingerprint };
    }
    const productCode = `PRD-${randomUUID().replaceAll("-", "").slice(0, 10).toUpperCase()}`;
    const draftSourcePayload = sourcePayloadForRole(user.role, dto.sourcePayload);
    const created = await this.prisma.$transaction(async (tx) => {
      const product = await tx.product.create({
        data: {
          tenantId,
          productCode,
          currency: dto.currency?.trim().toUpperCase() || "INR",
          status: ProductStatus.DRAFT,
          ...(draftIdentity ?? {}),
        },
      });
      await ensurePublicIdentifier(
        tx,
        PublicEntity.PRODUCT,
        product.id,
        await allocatePublicCode(
          tx,
          PublicEntity.PRODUCT,
          `TA-${stateCode(dto.stateName)}-`,
          4,
        ),
      );
      const revision = await tx.productRevision.create({
        data: {
          productId: product.id,
          versionNumber: 1,
          status: ProductRevisionStatus.DRAFT,
          productName: dto.productName.trim(),
          type: dto.type,
          subType: dto.subType.trim(),
          category: dto.category?.trim() || null,
          subCategory: dto.subCategory?.trim() || null,
          shortDescription: dto.shortDescription?.trim() || null,
          description: dto.description?.trim() || "",
          highlights: dto.highlights || [],
          channels: dto.channels || [],
          terms: dto.terms || [],
          importantInfo: dto.importantInfo || [],
          thingsToCarry: dto.thingsToCarry || [],
          safetyMeasures: dto.safetyMeasures || [],
          additionalInfo: dto.additionalInfo || [],
          howToRedeem: dto.howToRedeem || [],
          labels: dto.labels || [],
          metaname: dto.metaname?.trim() || null,
          cityName: dto.cityName?.trim() || "",
          stateName: dto.stateName?.trim() || "",
          countryName: dto.countryName?.trim() || "",
          address: dto.address?.trim() || null,
          lat: dto.lat ?? null,
          lon: dto.lon ?? null,
          meetingModel: dto.meetingModel,
          meetingPoint: dto.meetingPoint?.trim() || null,
          durationValue: dto.durationValue?.trim() || null,
          durationUnit: dto.durationUnit?.trim() || null,
          guideIncluded: dto.guideIncluded?.trim() || null,
          guideLanguages: dto.guideLanguages || [],
          included: dto.included || [],
          notIncluded: dto.notIncluded || [],
          endPoint: dto.endPoint?.trim() || null,
          thingsToKnow: dto.thingsToKnow?.trim() || null,
          accessibility: dto.accessibility || [],
          followItinerary: dto.followItinerary ?? true,
          voucherCodeSource: dto.voucherCodeSource?.trim() || null,
          voucherAcceptedAs: dto.voucherAcceptedAs?.trim() || null,
          voucherInstructions: dto.voucherInstructions?.trim() || null,
          cancellationPreset: dto.cancellationPreset?.trim() || null,
          travellerDetails: dto.travellerDetails?.trim() || null,
          amendmentPolicy: dto.amendmentPolicy?.trim() || null,
          ...(draftSourcePayload
            ? { sourcePayload: draftSourcePayload as Prisma.InputJsonValue }
            : {}),
          createdById: user.sub,
        },
      });
      await tx.product.update({
        where: { id: product.id },
        data: { currentRevisionId: revision.id },
      });
      if (dto.travellerDetails?.trim())
        await this.syncTravellerDetailQuestions(
          tx,
          revision.id,
          dto.travellerDetails,
        );
      await this.audit.write(tx, {
        actor: user,
        tenantId,
        action: "PRODUCT_DRAFT_CREATED",
        entityType: "Product",
        entityId: product.id,
        afterState: {
          productCode: product.productCode,
          revisionId: revision.id,
          status: product.status,
        },
      });
      return product;
    });
    return user.tenantId
      ? this.get(user, created.id)
      : this.adminDetail(created.id);
  }

  async updateCurrency(
    user: AuthUser,
    productId: string,
    dto: UpdateProductCurrencyDto,
  ) {
    const currency = dto.currency.trim().toUpperCase();
    const ownedProduct = await this.product(user, productId);
    const tenantId = ownedProduct.tenantId;
    const product = await this.prisma.product.findFirst({
      where: { id: productId, tenantId, deletedAt: null },
      select: { id: true, status: true },
    });
    if (!product) throw new NotFoundException("Product not found");
    if (product.status !== ProductStatus.DRAFT)
      throw new ConflictException(
        "Product currency can only be changed while the product is a draft",
      );
    const updated = await this.prisma.product.update({
      where: { id: productId },
      data: { currency },
    });
    return { productId: updated.id, currency: updated.currency };
  }

  private async importExistingProduct(
    user: AuthUser,
    productId: string,
    matchedBy: string,
  ) {
    const product: any = await this.get(user, productId);
    const revision =
      product.revisions?.find((item: any) =>
        [
          ProductRevisionStatus.DRAFT,
          ProductRevisionStatus.UNDER_REVIEW,
        ].includes(item.status),
      ) ||
      product.currentRevision ||
      product.revisions?.[0] ||
      null;
    throw new ConflictException({
      code: "PRODUCT_IMPORT_DUPLICATE",
      message: "This product has already been imported by this vendor.",
      matchedBy,
      existingProduct: {
        productId: product.id,
        productCode: product.productCode,
        productName: revision?.productName || product.productCode,
        status: product.status,
        revisionStatus: revision?.status || null,
      },
      actions: [
        "Open the existing product",
        "Replace the existing draft",
        "Create a new revision",
      ],
    });
  }

  private async importIdempotencyReplay(user: AuthUser, productId: string) {
    const product: any = await this.get(user, productId);
    const revision =
      product.revisions?.find((item: any) =>
        [
          ProductRevisionStatus.DRAFT,
          ProductRevisionStatus.UNDER_REVIEW,
        ].includes(item.status),
      ) ||
      product.currentRevision ||
      product.revisions?.[0] ||
      null;
    const variants = product.variants || [];
    return {
      productId: product.id,
      productCode: product.productCode,
      revisionId: revision?.id || null,
      status: "DRAFT",
      duplicate: true,
      idempotencyReplay: true,
      counts: {
        options: variants.length,
        ratePlans: variants.reduce(
          (total: number, variant: any) =>
            total + (variant.ratePlans?.length || 0),
          0,
        ),
        schedules: variants.reduce(
          (total: number, variant: any) =>
            total + (variant.schedules?.length || 0),
          0,
        ),
        media: revision?.media?.length || 0,
        bookingQuestions: revision?.bookingQuestions?.length || 0,
      },
      product,
    };
  }

  /**
   * Server-side counterpart to the vendor JSON/Excel import. The request is
   * intentionally orchestrated through the same catalogue services used by
   * the UI so permissions, audit records, commercial versioning and schedule
   * version checks stay consistent with normal product creation.
   */
  async importJson(
    user: AuthUser,
    dto: ImportProductJsonDto,
    idempotencyKey?: string,
    validateOnly = false,
  ) {
    const source = dto as ImportProductJsonDto & Record<string, unknown>;
    const importSections = ["Basic_Info", "Experience", "Options", "Ticket_Types", "Rate_Plans", "Availability", "Media", "Booking_Questions", "Fulfilment"];
    const rowCount = importSections.reduce((count, section) => {
      const rows = source[section];
      return count + (Array.isArray(rows) ? rows.length : 0);
    }, 0);
    if (rowCount > 2000)
      throw new BadRequestException({
        code: "IMPORT_ROW_LIMIT_EXCEEDED",
        message: "A product import may contain at most 2,000 data rows.",
      });

    if (
      !this.ratePlans ||
      !this.schedules ||
      !this.materializer ||
      !this.commercial
    )
      throw new ConflictException("Product import services are not configured");

    const basicRows = (source.Basic_Info ?? []) as ImportJsonRow[];
    const experienceRows = (source.Experience ?? []) as ImportJsonRow[];
    const options = (source.Options ?? []) as ImportJsonRow[];
    const ratePlanRows = (source.Rate_Plans ?? []) as ImportJsonRow[];
    const availability = (source.Availability ?? []) as ImportJsonRow[];
    const mediaRows = (source.Media ?? []) as ImportJsonRow[];
    const questionRows = (source.Booking_Questions ?? []) as ImportJsonRow[];
    const fulfilmentRows = (source.Fulfilment ?? []) as ImportJsonRow[];
    const ticketTypeRows = (source.Ticket_Types ?? []) as ImportJsonRow[];
    const issues: Array<{ section: string; row: number; message: string }> = [];
    const issue = (section: string, row: number, message: string) =>
      issues.push({ section, row, message });

    if (basicRows.length !== 1)
      issue("Basic_Info", 3, "Provide exactly one product row.");
    if (experienceRows.length !== 1)
      issue("Experience", 3, "Provide exactly one Experience row.");
    if (!options.length) issue("Options", 3, "Add at least one option.");
    if (!ratePlanRows.length)
      issue("Rate_Plans", 3, "Add at least one rate plan.");
    if (!availability.length)
      issue("Availability", 3, "Add at least one availability schedule.");
    if (fulfilmentRows.length > 1)
      issue("Fulfilment", 4, "Provide at most one Fulfilment row.");
    let itineraryStops: Array<Record<string, unknown>> = [];
    const itineraryJson = importText(basicRows[0] ?? {}, "itinerary_stops_json");
    if (itineraryJson) {
      try {
        const parsed = JSON.parse(itineraryJson);
        if (!Array.isArray(parsed)) throw new Error("not an array");
        itineraryStops = parsed as Array<Record<string, unknown>>;
        itineraryStops.forEach((stop, index) => {
          if (!stop || typeof stop !== "object" || !String(stop.stopName ?? "").trim())
            issue("Basic_Info", 3, `Itinerary stop ${index + 1} needs a stopName.`);
          for (const field of ["stayDurationMinutes", "travelTimeToNextMinutes"]) {
            const value = stop?.[field];
            if (value !== undefined && value !== "" && (!Number.isInteger(Number(value)) || Number(value) < 0))
              issue("Basic_Info", 3, `Itinerary stop ${index + 1} ${field} must be a non-negative whole number.`);
          }
        });
      } catch {
        issue("Basic_Info", 3, "itinerary_stops_json must be a JSON array of itinerary stop objects.");
      }
    }

    const basic = basicRows[0] ?? {};
    const experience = experienceRows[0] ?? {};
    const productKey = importText(basic, "product_key");
    for (const [section, rows] of Object.entries({
      Experience: experienceRows,
      Options: options,
      Rate_Plans: ratePlanRows,
      Availability: availability,
      Media: mediaRows,
      Booking_Questions: questionRows,
      Fulfilment: fulfilmentRows,
      Ticket_Types: ticketTypeRows,
    })) {
      rows.forEach((row, index) => {
        const rowKey = importText(row, "product_key");
        if (productKey && rowKey && rowKey !== productKey)
          issue(section, index + 3, `product_key must be ${productKey}.`);
      });
    }
    [
      "product_key",
      "product_name",
      "type",
      "sub_type",
      "sub_category",
      "city",
      "state",
      "country",
      "meeting_model",
      "short_description",
    ].forEach((field) => {
      if (!importText(basic, field))
        issue("Basic_Info", 3, `${field} is required.`);
    });
    if (!importText(experience, "full_description"))
      issue("Experience", 3, "full_description is required.");

    const optionCodes = new Set<string>();
    options.forEach((row, index) => {
      const code = importText(row, "option_code");
      if (!code) issue("Options", index + 3, "option_code is required.");
      else if (optionCodes.has(code))
        issue("Options", index + 3, `Duplicate option_code: ${code}.`);
      else optionCodes.add(code);
      if (!importText(row, "option_name"))
        issue("Options", index + 3, "option_name is required.");
    });
    const ratePlanCodes = new Set<string>();
    ratePlanRows.forEach((row, index) => {
      const code = importText(row, "rate_plan_code");
      const optionCode = importText(row, "option_code");
      if (!code) issue("Rate_Plans", index + 3, "rate_plan_code is required.");
      else if (ratePlanCodes.has(code))
        issue("Rate_Plans", index + 3, `Duplicate rate_plan_code: ${code}.`);
      else ratePlanCodes.add(code);
      if (
        !importText(row, "rate_plan_name") ||
        !importText(row, "valid_from") ||
        !importText(row, "valid_to")
      )
        issue(
          "Rate_Plans",
          index + 3,
          "rate_plan_name, valid_from and valid_to are required.",
        );
      if (optionCode && !optionCodes.has(optionCode))
        issue("Rate_Plans", index + 3, `Unknown option_code: ${optionCode}.`);
      const mrpMode = importText(row, "mrp_mode").toUpperCase();
      const mrpAmount = importNumber(row, "mrp_amount");
      if (mrpMode && !["YES", "NO"].includes(mrpMode))
        issue("Rate_Plans", index + 3, "mrp_mode must be YES or NO.");
      if (mrpMode === "YES" && (!mrpAmount || mrpAmount <= 0))
        issue("Rate_Plans", index + 3, "Provide a positive mrp_amount when mrp_mode is YES.");
      if (mrpMode === "YES" && mrpAmount && ["adult_price", "child_price", "senior_price", "supplier_base_amount"].some((field) => importNumber(row, field, 0) > mrpAmount))
        issue("Rate_Plans", index + 3, "Selling prices cannot exceed mrp_amount.");
    });
    availability.forEach((row, index) => {
      const optionCode = importText(row, "option_code");
      if (optionCode && !optionCodes.has(optionCode))
        issue("Availability", index + 3, `Unknown option_code: ${optionCode}.`);
      if (
        !importText(row, "schedule_code") ||
        !importText(row, "effective_from") ||
        !importText(row, "effective_to")
      )
        issue(
          "Availability",
          index + 3,
          "schedule_code, effective_from and effective_to are required.",
        );
      if (!importList(row, "operating_days").length)
        issue(
          "Availability",
          index + 3,
          "At least one operating day is required.",
        );
      const slotsJson = importText(row, "slots_json");
      if (slotsJson) {
        try {
          const slots = JSON.parse(slotsJson);
          if (!Array.isArray(slots) || !slots.length || slots.some((slot: any) => !String(slot?.slotCode || "").trim() || !/^\d{2}:\d{2}$/.test(String(slot?.startTime || "")) || !/^\d{2}:\d{2}$/.test(String(slot?.endTime || "")) || String(slot.endTime) <= String(slot.startTime)))
            throw new Error("invalid slots");
        } catch {
          issue("Availability", index + 3, "slots_json must contain one or more valid slots with slotCode, startTime and endTime.");
        }
      } else if (!importText(row, "start_time") || !importText(row, "end_time")) {
        issue("Availability", index + 3, "Provide start_time and end_time for the schedule slot.");
      }
    });
    ticketTypeRows.forEach((row, index) => {
      if (!importText(row, "option_code") || !importText(row, "ticket_type"))
        issue("Ticket_Types", index + 3, "option_code and ticket_type are required.");
      else if (!optionCodes.has(importText(row, "option_code")))
        issue("Ticket_Types", index + 3, `Unknown option_code: ${importText(row, "option_code")}.`);
      const ageFrom = importText(row, "age_from");
      const ageTo = importText(row, "age_to");
      if ((ageFrom && (!Number.isInteger(Number(ageFrom)) || Number(ageFrom) < 0)) || (ageTo && (!Number.isInteger(Number(ageTo)) || Number(ageTo) < 0)) || (ageFrom && ageTo && Number(ageTo) < Number(ageFrom)))
        issue("Ticket_Types", index + 3, "Ticket type age range must contain valid non-negative integers in ascending order.");
    });
    mediaRows.forEach((row, index) => {
      if (!importText(row, "external_url") && !importText(row, "file_asset_id"))
        issue("Media", index + 3, "Provide external_url or file_asset_id.");
    });
    questionRows.forEach((row, index) => {
      if (!importText(row, "code") || !importText(row, "label"))
        issue("Booking_Questions", index + 3, "code and label are required.");
    });
    if (issues.length)
      throw new BadRequestException({
        code: "IMPORT_VALIDATION_FAILED",
        message: "Fix the JSON import validation issues.",
        issues,
      });

    if (validateOnly) return { valid: true, productKey };

    const tenantId = requireTenant(user);
    const sourceImportKey = productKey.toUpperCase();
    const importFingerprint = importContentFingerprint(basic);
    const stableIdempotencyKey = idempotencyKey?.trim() || undefined;
    if (stableIdempotencyKey) {
      const existingByIdempotency = await this.prisma.product.findFirst({
        where: { tenantId, importIdempotencyKey: stableIdempotencyKey },
      });
      if (existingByIdempotency) {
        if (existingByIdempotency.importFingerprint !== importFingerprint)
          throw new ConflictException({
            code: "IDEMPOTENCY_KEY_REUSED",
            message:
              "Idempotency-Key was already used for a different product import.",
          });
        return this.importIdempotencyReplay(user, existingByIdempotency.id);
      }
    }
    const existingByKey = await this.prisma.product.findFirst({
      where: { tenantId, sourceImportKey },
    });
    if (existingByKey)
      await this.importExistingProduct(user, existingByKey.id, "product_key");
    const existingByFingerprint = await this.prisma.product.findFirst({
      where: { tenantId, importFingerprint },
    });
    if (existingByFingerprint)
      await this.importExistingProduct(
        user,
        existingByFingerprint.id,
        "content_fingerprint",
      );
    // Products created before import identity was introduced have no stored
    // fingerprint. Compare their canonical revision fields as a compatibility
    // fallback so old imports cannot be duplicated by a new workbook/JSON file.
    const existingLegacyByFingerprint = await this.prisma.product.findFirst({
      where: {
        tenantId,
        deletedAt: null,
        importFingerprint: null,
        revisions: {
          some: {
            productName: {
              equals: importText(basic, "product_name"),
              mode: "insensitive",
            },
            type: importText(basic, "type") as any,
            cityName: {
              equals: importText(basic, "city"),
              mode: "insensitive",
            },
            stateName: {
              equals: importText(basic, "state"),
              mode: "insensitive",
            },
            countryName: {
              equals: importText(basic, "country"),
              mode: "insensitive",
            },
          },
        },
      },
      select: { id: true },
    });
    if (existingLegacyByFingerprint)
      await this.importExistingProduct(
        user,
        existingLegacyByFingerprint.id,
        "content_fingerprint_legacy",
      );

    let created: any;
    try {
      created = await this.createDraft(
        user,
        {
          productName: importText(basic, "product_name"),
          type: importText(basic, "type") as any,
          subType: importText(basic, "sub_type"),
          subCategory: importText(basic, "sub_category"),
          shortDescription: importText(basic, "short_description"),
          cityName: importText(basic, "city"),
          stateName: importText(basic, "state"),
          countryName: importText(basic, "country"),
          meetingModel: importText(basic, "meeting_model") as any,
          meetingPoint: importText(basic, "meeting_point"),
        },
        {
          sourceImportKey,
          importFingerprint,
          ...(stableIdempotencyKey
            ? { importIdempotencyKey: stableIdempotencyKey }
            : {}),
        },
      );
    } catch (error: any) {
      if (error?.code === "P2002") {
        const concurrent = stableIdempotencyKey
          ? await this.prisma.product.findFirst({
              where: { tenantId, importIdempotencyKey: stableIdempotencyKey },
            })
          : await this.prisma.product.findFirst({
              where: { tenantId, sourceImportKey },
            });
        if (
          concurrent?.importFingerprint === importFingerprint &&
          stableIdempotencyKey
        )
          return this.importIdempotencyReplay(user, concurrent.id);
        if (concurrent)
          await this.importExistingProduct(
            user,
            concurrent.id,
            stableIdempotencyKey ? "idempotency_key" : "product_key",
          );
      }
      throw error;
    }
    const loaded = await this.get(user, created.id);
    const revision =
      loaded.revisions?.find(
        (item: any) => item.status === ProductRevisionStatus.DRAFT,
      ) || loaded.currentRevision;
    if (!revision)
      throw new ConflictException(
        "The product draft was created but its working revision could not be loaded.",
      );

    const fulfilment = fulfilmentRows[0] ?? {};
    await this.updateRevision(user, revision.id, {
      productName: importText(basic, "product_name"),
      type: importText(basic, "type") as any,
      subType: importText(basic, "sub_type"),
      subCategory: importText(basic, "sub_category"),
      shortDescription: importText(basic, "short_description"),
      description: importText(experience, "full_description"),
      highlights: importList(experience, "highlights"),
      importantInfo: importList(experience, "important_information"),
      thingsToCarry: importList(experience, "things_to_carry"),
      safetyMeasures: importList(experience, "safety_measures"),
      terms: importList(experience, "terms"),
      howToRedeem: importList(experience, "how_to_redeem"),
      additionalInfo: importList(experience, "additional_information"),
      labels: importList(basic, "labels"),
      metaname: importText(experience, "metaname") || undefined,
      cityName: importText(basic, "city"),
      stateName: importText(basic, "state"),
      countryName: importText(basic, "country"),
      meetingModel: importText(basic, "meeting_model") as any,
      meetingPoint: importText(basic, "meeting_point") || undefined,
      address: importText(basic, "address") || undefined,
      lat: sourceNumber(basic, "latitude"),
      lon: sourceNumber(basic, "longitude"),
      durationValue: importText(basic, "duration_value") || undefined,
      durationUnit: importText(basic, "duration_unit") || undefined,
      guideIncluded: importText(basic, "guide_included") || undefined,
      guideLanguages: importList(basic, "guide_languages"),
      included: importList(basic, "included"),
      notIncluded: importList(basic, "not_included"),
      endPoint: importText(basic, "end_point") || undefined,
      thingsToKnow: importText(basic, "things_to_know") || undefined,
      accessibility: importList(basic, "accessibility"),
      followItinerary: importBool(basic, "follow_itinerary", true),
      voucherCodeSource: importText(basic, "voucher_code_source") || undefined,
      voucherAcceptedAs: importText(basic, "voucher_accepted_as") || undefined,
      voucherInstructions: importText(basic, "voucher_instructions") || undefined,
      cancellationPreset: importText(basic, "cancellation_preset") || undefined,
      travellerDetails: importText(basic, "traveller_details") || undefined,
      amendmentPolicy: importText(basic, "amendment_policy") || undefined,
      fulfilmentPolicy: {
        mode: importText(fulfilment, "mode") || "AUTO",
        requiredEvidenceKinds: [],
        evidenceMatchMode: "ALL",
        reviewRequired: importBool(fulfilment, "review_required"),
        operationsContactName:
          importText(fulfilment, "operations_contact_name") || undefined,
        operationsContactPhone:
          importText(fulfilment, "operations_contact_phone") || undefined,
        operationsContactEmail:
          importText(fulfilment, "operations_contact_email") || undefined,
        emergencyContactName:
          importText(fulfilment, "emergency_contact_name") || undefined,
        emergencyContactPhone:
          importText(fulfilment, "emergency_contact_phone") || undefined,
        emergencyContactEmail:
          importText(fulfilment, "emergency_contact_email") || undefined,
        voucherNotes: importList(fulfilment, "voucher_notes"),
      },
    } as any);

    if (itineraryStops.length) {
      await this.prisma.itineraryStop.createMany({
        data: itineraryStops.map((stop, index) => ({
          productRevisionId: revision.id,
          sequence: index + 1,
          stopName: String(stop.stopName).trim(),
          stopType: String(stop.stopType || "guided").trim(),
          stayDurationMinutes: stop.stayDurationMinutes == null || stop.stayDurationMinutes === "" ? null : Number(stop.stayDurationMinutes),
          travelTimeToNextMinutes: stop.travelTimeToNextMinutes == null || stop.travelTimeToNextMinutes === "" ? null : Number(stop.travelTimeToNextMinutes),
          ticketPolicy: String(stop.ticketPolicy || "").trim() || null,
          replacementStop: String(stop.replacementStop || "").trim() || null,
        })),
      });
    }

    for (const [index, row] of mediaRows.entries())
      await this.addMedia(user, revision.id, {
        kind: importText(row, "kind") || "IMAGE",
        externalUrl: importText(row, "external_url") || undefined,
        fileAssetId: importText(row, "file_asset_id") || undefined,
        description: importText(row, "description") || undefined,
        seoTitle: importText(row, "seo_title") || undefined,
        seoDescription: importText(row, "seo_description") || undefined,
        rank: importNumber(row, "rank", index + 1),
      } as any);
    for (const [index, row] of questionRows.entries())
      await this.createBookingQuestion(user, revision.id, {
        code: importText(row, "code"),
        label: importText(row, "label"),
        helpText: importText(row, "help_text") || undefined,
        type: importText(row, "type") || "TEXT",
        required: importBool(row, "required"),
        options: Array.isArray(row.options) ? row.options : undefined,
        appliesPerTraveller: importBool(row, "applies_per_traveller"),
        rank: importNumber(row, "rank", index + 1),
      } as any);

    const variants = new Map<string, any>();
    const variantIds: string[] = [];
    for (const row of options) {
      const variant = await this.createVariant(user, created.id, {
        variantCode: importText(row, "option_code"),
        name: importText(row, "option_name"),
        description: importText(row, "description") || undefined,
        durationMinutes: importNumber(row, "duration_minutes", 0),
        privateShared: importText(row, "sharing") || undefined,
        vehicleType: importText(row, "vehicle_guide_type") || undefined,
        pickupIncluded: importBool(row, "pickup_included"),
        pickupType: importText(row, "pickup_type") || undefined,
        pickupInput: importText(row, "pickup_instructions") || undefined,
        pickupTimings: importText(row, "pickup_timings") || undefined,
        dropoffIncluded: importBool(row, "dropoff_included"),
        dropoffTimings: importText(row, "dropoff_timings") || undefined,
        mealIncluded: importBool(row, "meal_included"),
        mealType: importText(row, "meal_type") || undefined,
        menu: importList(row, "menu"),
        mealVariety: importText(row, "meal_variety") || undefined,
        pointsOfInterest: importList(row, "points_of_interest"),
        inclusions: importList(row, "inclusions"),
        exclusions: importList(row, "exclusions"),
        suitableFor: importList(row, "suitable_for"),
      } as any);
      variants.set(importText(row, "option_code"), variant);
      variantIds.push(variant.id);
    }

    for (const [optionCode, variant] of variants) {
      const optionTicketTypes = ticketTypeRows.filter((row) => importText(row, "option_code") === optionCode);
      if (!optionTicketTypes.length) continue;
      await this.replaceVariantBlueprint(user, variant.id, {
        ticketTypes: optionTicketTypes.map((row) => ({
          name: importText(row, "ticket_type"),
          ageFrom: importNumber(row, "age_from"),
          ageTo: importNumber(row, "age_to"),
          needsAdult: importBool(row, "needs_adult"),
          countsCapacity: importBool(row, "counts_capacity", true),
        })),
      });
    }

    const ratePlans = new Map<string, any>();
    const ratePlanIds: string[] = [];
    for (const row of ratePlanRows) {
      const variant = variants.get(importText(row, "option_code"));
      const pricingUnit = importText(row, "pricing_unit") || "PER_PERSON";
      const travellers =
        pricingUnit === "GROUP"
          ? [
              {
                type: "GROUP",
                displayName: "Group",
                minCount: importNumber(row, "group_min_count", 1),
                maxCount: importNumber(
                  row,
                  "group_max_count",
                  importNumber(row, "max_pax", 99),
                ),
              },
            ]
          : [
              {
                type: "ADULT",
                displayName: "Adult",
                minCount: importNumber(row, "adult_min_count", 1),
                maxCount: importNumber(
                  row,
                  "adult_max_count",
                  importNumber(row, "max_pax", 99),
                ),
              },
              ...(importText(row, "child_price")
                ? [
                    {
                      type: "CHILD",
                      displayName: "Child",
                      minCount: 0,
                      maxCount: importNumber(
                        row,
                        "child_max_count",
                        importNumber(row, "max_pax", 99),
                      ),
                    },
                  ]
                : []),
            ];
      const plan = await this.ratePlans.create(user, variant.id, {
        ratePlanCode: importText(row, "rate_plan_code"),
        name: importText(row, "rate_plan_name"),
        description: importText(row, "description") || undefined,
        currency: importText(row, "currency") || "INR",
        validFrom: importDate(row, "valid_from"),
        validTo: importDate(row, "valid_to"),
        minPax: importNumber(row, "min_pax", 1),
        maxPax: importNumber(row, "max_pax", 99),
        cutOffMinutes: importNumber(row, "cutoff_minutes", 0),
        adultRequired: travellers.some(
          (traveller) => traveller.type === "ADULT" && traveller.minCount > 0,
        ),
        minAdultRequired:
          travellers.find((traveller) => traveller.type === "ADULT")
            ?.minCount || 0,
        travellerRules: travellers as any,
        cancellationRules: [
          {
            minDaysBefore: 7,
            chargeValue: importNumber(row, "cancel_7_days_pct", 0),
            chargeType: "PERCENTAGE",
          },
          {
            minDaysBefore: 3,
            maxDaysBefore: 6,
            chargeValue: importNumber(row, "cancel_3_days_pct", 50),
            chargeType: "PERCENTAGE",
          },
          {
            minDaysBefore: 0,
            maxDaysBefore: 2,
            chargeValue: importNumber(row, "cancel_0_days_pct", 100),
            chargeType: "PERCENTAGE",
          },
        ],
      } as any);
      ratePlans.set(importText(row, "rate_plan_code"), plan);
      ratePlanIds.push(plan.id);
      const commercial = await this.commercial.createVersion(user, plan.id, {
        effectiveFrom: importDate(row, "valid_from"),
        effectiveTo: importDate(row, "valid_to"),
        supplierModel: (importText(row, "supplier_model") || "NET_RATE") as any,
        pricingUnit: pricingUnit as any,
        bookingMode: (importText(row, "booking_mode") || "INSTANT") as any,
        currency: importText(row, "currency") || "INR",
        supplierBaseAmount: String(
          importNumber(row, "supplier_base_amount", 0),
        ),
        travellerPrices:
          pricingUnit === "GROUP"
            ? []
            : [
                {
                  travellerType: "ADULT",
                  amount: String(importNumber(row, "adult_price", 0)),
                },
                ...(importText(row, "child_price")
                  ? [
                      {
                        travellerType: "CHILD",
                        amount: String(importNumber(row, "child_price", 0)),
                      },
                    ]
                  : []),
                ...(importText(row, "senior_price")
                  ? [
                      {
                        travellerType: "SENIOR",
                        amount: String(importNumber(row, "senior_price", 0)),
                      },
                    ]
                  : []),
              ],
        sourcePayload: {
          createdFromProductImport: true,
          mrpMode: importText(row, "mrp_mode") || (importText(row, "mrp_amount") ? "YES" : "NO"),
          ...(importText(row, "mrp_amount") ? { mrpAmount: importText(row, "mrp_amount") } : {}),
          ...(importText(row, "mrp_proof") ? { mrpProof: importText(row, "mrp_proof") } : {}),
          pricingDays: importList(row, "pricing_days").length ? importList(row, "pricing_days") : ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"],
        },
      } as any);
      await this.commercial.activateVersion(user, commercial.id);
    }

    const scheduleIds: string[] = [];
    for (const row of availability) {
      const variant = variants.get(importText(row, "option_code"));
      let schedule: any = await this.schedules.create(user, variant.id, {
        scheduleCode: importText(row, "schedule_code"),
        name:
          importText(row, "schedule_name") || importText(row, "schedule_code"),
        operatingModel: (importText(row, "operating_model") ||
          "MULTIPLE_SLOTS") as any,
        timezone: importText(row, "timezone") || "Asia/Kolkata",
        effectiveFrom: importDate(row, "effective_from"),
        effectiveTo: importDate(row, "effective_to"),
        operatingDays: importList(row, "operating_days"),
        capacityUnit: (importText(row, "capacity_unit") || "PERSON") as any,
        defaultCapacity: importNumber(row, "default_capacity", 1),
        slots: importText(row, "slots_json")
          ? (JSON.parse(importText(row, "slots_json")) as Array<Record<string, unknown>>).map((slot, index) => ({ slotCode: String(slot.slotCode), startTime: String(slot.startTime), endTime: String(slot.endTime), rank: Number.isInteger(Number(slot.rank)) ? Number(slot.rank) : index }))
          : [{ slotCode: importText(row, "start_time"), startTime: importText(row, "start_time"), endTime: importText(row, "end_time"), rank: 0 }],
      } as any);
      schedule = await this.schedules.activate(
        user,
        schedule.id,
        schedule.version,
      );
      for (const planRow of ratePlanRows.filter(
        (item) =>
          importText(item, "option_code") === importText(row, "option_code"),
      )) {
        const plan = ratePlans.get(importText(planRow, "rate_plan_code"));
        if (!plan) continue;
        await this.schedules.mapRatePlan(user, schedule.id, {
          ratePlanId: plan.id,
          expectedVersion: schedule.version,
        });
        schedule = (await this.schedules.list(user, variant.id)).find(
          (item: any) => item.id === schedule.id,
        );
      }
      if (!schedule)
        throw new ConflictException(
          "Schedule could not be reloaded after rate-plan mapping.",
        );
      scheduleIds.push(schedule.id);
      if (importBool(row, "materialize", true))
        await this.materializer.materialize(schedule.id, {
          dateFrom: importDate(row, "effective_from"),
          dateTo: importDate(row, "effective_to"),
          expectedVersion: schedule.version,
        });
    }

    const product = await this.get(user, created.id);
    return {
      productId: created.id,
      productCode: created.productCode,
      revisionId: revision.id,
      status: "DRAFT",
      variantIds,
      ratePlanIds,
      scheduleIds,
      counts: {
        options: variantIds.length,
        ratePlans: ratePlanIds.length,
        schedules: scheduleIds.length,
        media: mediaRows.length,
        bookingQuestions: questionRows.length,
      },
      product,
    };
  }

  async importBatch(user: AuthUser, dto: { products: ImportProductJsonDto[] }) {
    const products = Array.isArray(dto?.products) ? dto.products : [];
    if (!products.length || products.length > 200)
      throw new BadRequestException({
        code: "IMPORT_BATCH_SIZE_INVALID",
        message: "Provide between 1 and 200 product records.",
      });
    const rowCount = products.reduce((count, product) =>
      count + ["Basic_Info", "Experience", "Options", "Ticket_Types", "Rate_Plans", "Availability", "Media", "Booking_Questions", "Fulfilment"]
        .reduce((sectionCount, section) => sectionCount + (Array.isArray((product as any)[section]) ? (product as any)[section].length : 0), 0), 0);
    if (rowCount > 2000)
      throw new BadRequestException({
        code: "IMPORT_BATCH_ROW_LIMIT_EXCEEDED",
        message: "A product import batch may contain at most 2,000 data rows.",
      });

    const keys = products.map((product) => importText((product.Basic_Info || [])[0] as any, "product_key").toUpperCase());
    const duplicateKeys = keys.filter((key, index) => key && keys.indexOf(key) !== index);
    if (duplicateKeys.length)
      throw new BadRequestException({
        code: "IMPORT_BATCH_DUPLICATE_PRODUCT_KEY",
        message: "Each product_key must be unique within the batch.",
        productKeys: [...new Set(duplicateKeys)],
      });

    const validationIssues: Array<{ productIndex: number; productKey: string; issues: unknown }> = [];
    for (let index = 0; index < products.length; index += 1) {
      try {
        await this.importJson(user, products[index], undefined, true);
      } catch (error: any) {
        const response = typeof error?.getResponse === "function" ? error.getResponse() : error?.response;
        validationIssues.push({
          productIndex: index + 1,
          productKey: keys[index],
          issues: response?.issues ?? response?.message ?? error?.message ?? "Validation failed.",
        });
      }
    }
    if (validationIssues.length)
      throw new BadRequestException({
        code: "IMPORT_BATCH_VALIDATION_FAILED",
        message: "No products were saved because one or more products failed validation.",
        products: validationIssues,
      });

    const tenantId = requireTenant(user);
    const fingerprints = products.map((product) => importContentFingerprint((product.Basic_Info || [])[0] as any));
    const existing = await this.prisma.product.findMany({
      where: {
        tenantId,
        deletedAt: null,
        OR: [
          { sourceImportKey: { in: keys } },
          { importFingerprint: { in: fingerprints } },
        ],
      },
      select: { sourceImportKey: true, importFingerprint: true },
    });
    if (existing.length)
      throw new ConflictException({
        code: "IMPORT_BATCH_PRODUCT_ALREADY_EXISTS",
        message: "No products were saved because this create batch contains a product already imported for this vendor.",
        products: existing.map((item: any) => item.sourceImportKey || item.importFingerprint),
      });
    for (let index = 0; index < products.length; index += 1) {
      const basic = (products[index].Basic_Info || [])[0] as any;
      const legacyDuplicate = await this.prisma.product.findFirst({
        where: {
          tenantId,
          deletedAt: null,
          importFingerprint: null,
          revisions: {
            some: {
              productName: { equals: importText(basic, "product_name"), mode: "insensitive" },
              type: importText(basic, "type") as any,
              cityName: { equals: importText(basic, "city"), mode: "insensitive" },
              stateName: { equals: importText(basic, "state"), mode: "insensitive" },
              countryName: { equals: importText(basic, "country"), mode: "insensitive" },
            },
          },
        },
        select: { id: true },
      });
      if (legacyDuplicate)
        throw new ConflictException({
          code: "IMPORT_BATCH_PRODUCT_ALREADY_EXISTS",
          message: "No products were saved because a product with the same name and destination already exists for this vendor.",
          productIndex: index + 1,
          productKey: keys[index],
        });
    }

    const imported: any[] = [];
    for (let index = 0; index < products.length; index += 1) {
      try {
        imported.push(await this.importJson(user, products[index]));
      } catch (error: any) {
        return {
          status: "PARTIAL",
          importedCount: imported.length,
          failedProductIndex: index + 1,
          failedProductKey: keys[index],
          error: error?.response ?? error?.message ?? "Product could not be saved.",
          products: imported,
        };
      }
    }
    return { status: "COMPLETED", importedCount: imported.length, products: imported };
  }

  async importRateBatch(user: AuthUser, dto: VendorBulkRateUpdateDto) {
    const rows = Array.isArray(dto?.rows) ? dto.rows : [];
    if (!rows.length || rows.length > 2000)
      throw new BadRequestException({ code: "RATE_IMPORT_ROW_LIMIT", message: "Provide between 1 and 2,000 rate rows." });
    const rowIssues: Array<{ row: number; productCode: string; optionCode: string; message: string }> = [];
    const identities = new Set<string>();
    rows.forEach((row, index) => {
      const identity = `${row.productCode.trim().toUpperCase()}::${row.optionCode.trim().toUpperCase()}`;
      if (identities.has(identity)) rowIssues.push({ row: index + 2, productCode: row.productCode, optionCode: row.optionCode, message: "Only one rate row per product option is allowed in a batch." });
      identities.add(identity);
      if (new Date(row.validTo) <= new Date(row.validFrom)) rowIssues.push({ row: index + 2, productCode: row.productCode, optionCode: row.optionCode, message: "validTo must be after validFrom." });
      if (![row.adultSellInr, row.childSellInr, row.seniorSellInr, row.baseSellInr].some((value) => value !== undefined)) rowIssues.push({ row: index + 2, productCode: row.productCode, optionCode: row.optionCode, message: "Provide at least one sell price." });
    });
    if (rowIssues.length) throw new BadRequestException({ code: "RATE_IMPORT_VALIDATION_FAILED", message: "No rates were saved because the file contains invalid rows.", issues: rowIssues });

    const tenantId = requireTenant(user);
    const groupedRows = new Map<string, { productCode: string; options: any[]; sourceRows: VendorBulkRateUpdateRowDto[] }>();
    const rowsByCode = new Map<string, VendorBulkRateUpdateRowDto[]>();
    rows.forEach((row) => {
      const code = row.productCode.trim().toUpperCase();
      rowsByCode.set(code, [...(rowsByCode.get(code) || []), row]);
    });
    const products = await this.prisma.product.findMany({
      where: { tenantId, productCode: { in: [...rowsByCode.keys()] }, deletedAt: null },
      select: { id: true, productCode: true },
    });
    const productsByCode = new Map(products.map((product: any) => [String(product.productCode).toUpperCase(), product]));
    for (const [productCode, productRows] of rowsByCode) {
      const product = productsByCode.get(productCode);
      if (!product) {
        productRows.forEach((row) => rowIssues.push({ row: rows.indexOf(row) + 2, productCode: row.productCode, optionCode: row.optionCode, message: "Product code was not found for this vendor." }));
        continue;
      }
      const current = await this.activityPricesAvailability(user, product.id);
      const optionDtos: any[] = [];
      for (const row of productRows) {
        const option = (current.options || []).find((item: any) => String(item.variantCode).toUpperCase() === row.optionCode.trim().toUpperCase());
        const editablePlan = option?.ratePlans?.find((plan: any) => plan.editable);
        const version = editablePlan?.versions?.[0];
        if (!option || !editablePlan || !version) {
          rowIssues.push({ row: rows.indexOf(row) + 2, productCode: row.productCode, optionCode: row.optionCode, message: "Product option has no editable rate version." });
          continue;
        }
        const currentCurrency = String(version.currency || editablePlan.currency || "INR").toUpperCase();
        if (currentCurrency !== "INR" || (row.currency && row.currency.toUpperCase() !== currentCurrency)) {
          rowIssues.push({ row: rows.indexOf(row) + 2, productCode: row.productCode, optionCode: row.optionCode, message: `This rate template uses INR amounts; the existing option currency is ${currentCurrency}.` });
          continue;
        }
        const sourcePayload = (version.sourcePayload || {}) as Record<string, any>;
        const existingPrices = version.travellerPrices || [];
        const price = (travellerType: string, replacement?: string) => {
          const existingPrice = existingPrices.find((item: any) => item.travellerType === travellerType)?.amount;
          const amount = replacement ?? existingPrice;
          return amount === undefined || amount === null ? null : { travellerType, amount: String(amount) };
        };
        const pricingUnit = row.pricingUnit || version.pricingUnit || editablePlan.pricingUnit;
        const travellerPrices = pricingUnit === PricingUnit.PER_PERSON
          ? [price("ADULT", row.adultSellInr), price("CHILD", row.childSellInr), price("SENIOR", row.seniorSellInr)].filter(Boolean)
          : [];
        if (pricingUnit === PricingUnit.PER_PERSON && !travellerPrices.some((item: any) => item.travellerType === "ADULT")) {
          rowIssues.push({ row: rows.indexOf(row) + 2, productCode: row.productCode, optionCode: row.optionCode, message: "An adult sell price is required for per-person pricing." });
          continue;
        }
        if (pricingUnit !== PricingUnit.PER_PERSON && !(row.baseSellInr || version.supplierBaseAmount)) {
          rowIssues.push({ row: rows.indexOf(row) + 2, productCode: row.productCode, optionCode: row.optionCode, message: "A base sell price is required for this pricing unit." });
          continue;
        }
        optionDtos.push({
          variantId: option.variantId,
          pricingUnit,
          currency: row.currency || version.currency || editablePlan.currency || "INR",
          supplierModel: row.supplierModel || version.supplierModel || "NET_RATE",
          bookingMode: row.bookingMode || version.bookingMode || "INSTANT",
          effectiveFrom: row.validFrom,
          effectiveTo: row.validTo,
          expectedVersion: version.versionNumber,
          supplierBaseAmount: row.supplierBaseAmount || version.supplierBaseAmount || undefined,
          minPax: version.minPax || editablePlan.minPax,
          maxPax: version.maxPax || editablePlan.maxPax,
          cutOffMinutes: version.cutOffMinutes ?? editablePlan.cutOffMinutes,
          pricingDays: sourcePayload.pricingDays || ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"],
          ...(travellerPrices.length ? { travellerPrices } : {}),
          ...(pricingUnit !== PricingUnit.PER_PERSON ? { supplierBaseAmount: row.baseSellInr || version.supplierBaseAmount } : {}),
          ...(row.mrpInr || sourcePayload.mrpAmount ? { mrpMode: "YES", mrpAmount: row.mrpInr || sourcePayload.mrpAmount } : { mrpMode: "NO" }),
          ...(sourcePayload.mrpProof ? { mrpProof: sourcePayload.mrpProof } : {}),
          ...(sourcePayload.pricingSlotCodes?.length ? { pricingSlotCodes: sourcePayload.pricingSlotCodes } : {}),
          ...(sourcePayload.visitorPrices?.length ? { visitorPrices: sourcePayload.visitorPrices } : {}),
          ...(editablePlan.cancellationRules?.length ? { cancellationRules: editablePlan.cancellationRules } : {}),
        });
      }
      if (optionDtos.length) groupedRows.set(product.id, { productCode: product.productCode, options: optionDtos, sourceRows: productRows });
    }
    if (rowIssues.length) throw new BadRequestException({ code: "RATE_IMPORT_VALIDATION_FAILED", message: "No rates were saved because one or more product or option codes could not be matched.", issues: rowIssues });

    const prepared: Array<{ productId: string; productCode: string; dto: ActivityPricesAvailabilityDto; sourceRows: VendorBulkRateUpdateRowDto[] }> = [];
    for (const [productId, group] of groupedRows) {
      const update: ActivityPricesAvailabilityDto = { options: group.options };
      const preview = await this.previewActivityPricesAvailability(user, productId, update);
      if (!preview.valid) rowIssues.push(...preview.errors.map((message: string) => ({ row: 0, productCode: group.productCode, optionCode: "", message })));
      prepared.push({ productId, productCode: group.productCode, dto: update, sourceRows: group.sourceRows });
    }
    if (rowIssues.length) throw new BadRequestException({ code: "RATE_IMPORT_VALIDATION_FAILED", message: "No rates were saved because one or more rate updates failed preview validation.", issues: rowIssues });

    const results: any[] = [];
    for (const group of prepared) {
      try {
        const idempotencyKey = `BULK-${fingerprint({ tenantId, productId: group.productId, rows: group.sourceRows })}`;
        results.push(await this.applyActivityPricesAvailability(user, group.productId, group.dto, idempotencyKey));
      } catch (error: any) {
        return { status: "PARTIAL", updatedProductCount: results.length, failedProductCode: group.productCode, error: error?.response ?? error?.message ?? "Rate update failed.", products: results };
      }
    }
    return { status: "COMPLETED", updatedProductCount: results.length, products: results };
  }

  async readiness(user: AuthUser, productId: string) {
    if (!this.readinessService)
      throw new ConflictException("Product readiness is not configured");
    return this.readinessService.evaluate(user, productId);
  }

  async createRevision(
    user: AuthUser,
    productId: string,
    dto: CreateProductRevisionDto = {},
  ) {
    const product = await this.product(user, productId);
    const result = await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw(
        Prisma.sql`SELECT "id" FROM "Product" WHERE "id" = ${productId} FOR UPDATE`,
      );
      const working = await tx.productRevision.findFirst({
        where: {
          productId,
          status: {
            in: [
              ProductRevisionStatus.DRAFT,
              ProductRevisionStatus.UNDER_REVIEW,
            ],
          },
        },
        orderBy: { versionNumber: "desc" },
      });
      if (working) return working;
      const published = await tx.productRevision.findFirst({
        where: { productId, status: ProductRevisionStatus.PUBLISHED },
        orderBy: { versionNumber: "desc" },
        include: revisionCloneInclude,
      });
      const latest = await tx.productRevision.findFirst({
        where: { productId },
        orderBy: { versionNumber: "desc" },
        include: revisionCloneInclude,
      });
      let source = published;
      if (dto.sourceRevisionId) {
        source = await tx.productRevision.findFirst({
          where: {
            id: dto.sourceRevisionId,
            productId,
            status: {
              in: [
                ProductRevisionStatus.PUBLISHED,
                ProductRevisionStatus.REJECTED,
                ProductRevisionStatus.SUPERSEDED,
              ],
            },
          },
          include: revisionCloneInclude,
        });
        if (!source)
          throw new ConflictException(
            "Source revision must belong to this Product and be immutable history",
          );
      } else if (
        latest?.status === ProductRevisionStatus.REJECTED &&
        (!published || latest.versionNumber > published.versionNumber)
      ) {
        source = latest;
      } else {
        source = published ?? latest;
      }
      if (!source)
        throw new ConflictException("Product has no revision to clone");
      const maxVersion = await tx.productRevision.aggregate({
        where: { productId },
        _max: { versionNumber: true },
      });
      const {
        id: _id,
        createdAt: _createdAt,
        updatedAt: _updatedAt,
        versionNumber: _version,
        status: _status,
        rejectionReason: _reason,
        submittedAt: _submitted,
        reviewedAt: _reviewed,
        reviewedById: _reviewedBy,
        createdById: _createdBy,
        productId: _productId,
        sourcePayload: _sourcePayload,
        media: sourceMedia,
        bookingQuestions: sourceQuestions,
        fulfilmentPolicy: sourcePolicy,
        variants: sourceVariants,
        ...content
      } = source as any;
      const revision = await tx.productRevision.create({
        data: {
          ...content,
          faqs: (source.faqs ?? []) as Prisma.InputJsonValue,
          ...(source.sourcePayload
            ? { sourcePayload: source.sourcePayload as Prisma.InputJsonValue }
            : {}),
          productId,
          versionNumber: (maxVersion._max.versionNumber ?? 0) + 1,
          createdById: user.sub,
          status: ProductRevisionStatus.DRAFT,
        },
      });
      if ((sourceMedia ?? []).length)
        await tx.productMedia.createMany({
          data: (sourceMedia as any[]).map((item: any) => {
            const {
              id: _mediaId,
              revisionId: _revisionId,
              createdAt: _mediaCreatedAt,
              updatedAt: _mediaUpdatedAt,
              archivedAt: _archivedAt,
              ...media
            } = item;
            return { ...media, revisionId: revision.id };
          }),
        });
      if ((sourceQuestions ?? []).length)
        await tx.productBookingQuestion.createMany({
          data: (sourceQuestions as any[]).map((item: any) => {
            const {
              id: _questionId,
              productRevisionId: _sourceRevisionId,
              createdAt: _questionCreatedAt,
              updatedAt: _questionUpdatedAt,
              archivedAt: _questionArchivedAt,
              options,
              ...question
            } = item;
            return {
              ...question,
              productRevisionId: revision.id,
              ...(options == null
                ? {}
                : { options: options as Prisma.InputJsonValue }),
            };
          }),
        });
      if (sourcePolicy)
        await tx.productFulfilmentPolicy.create({
          data: {
            productRevisionId: revision.id,
            mode: sourcePolicy.mode,
            requiredEvidenceKinds: sourcePolicy.requiredEvidenceKinds,
            evidenceMatchMode: sourcePolicy.evidenceMatchMode,
            reviewRequired: sourcePolicy.reviewRequired,
            emergencyContactName: sourcePolicy.emergencyContactName,
            emergencyContactPhone: sourcePolicy.emergencyContactPhone,
            emergencyContactEmail: sourcePolicy.emergencyContactEmail,
            operationsContactName: sourcePolicy.operationsContactName,
            operationsContactPhone: sourcePolicy.operationsContactPhone,
            operationsContactEmail: sourcePolicy.operationsContactEmail,
            voucherNotes: sourcePolicy.voucherNotes,
            migrationMetadata: sourcePolicy.migrationMetadata as
              Prisma.InputJsonValue | undefined,
          },
        });
      const omit = (input: any, keys: string[]) => {
        const copy = { ...input };
        for (const key of keys) delete copy[key];
        return copy;
      };
      const ratePlanIdMap = new Map<string, string>();
      for (const sourceVariant of (sourceVariants || []) as any[]) {
        const sourcePlans = sourceVariant.ratePlans || [];
        const sourceSchedules = sourceVariant.schedules || [];
        const sourceTicketTypes = sourceVariant.ticketTypes || [];
        const sourceUnitRows = sourceVariant.unitRows || [];
        const variantData = omit(sourceVariant, [
          "id",
          "productId",
          "revisionId",
          "createdAt",
          "updatedAt",
          "ratePlans",
          "schedules",
          "commercialRules",
          "channelMappings",
          "ticketTypes",
          "unitRows",
          "bookings",
        ]);
        const clonedVariant = await tx.productVariant.create({
          data: { ...variantData, productId, revisionId: revision.id },
        } as any);
        if (sourceTicketTypes.length)
          await tx.productVariantTicketType.createMany({
            data: sourceTicketTypes.map((ticketType: any) => ({
              ...omit(ticketType, ["id", "variantId", "createdAt", "updatedAt"]),
              variantId: clonedVariant.id,
            })),
          });
        if (sourceUnitRows.length)
          await tx.productVariantUnit.createMany({
            data: sourceUnitRows.map((unitRow: any) => ({
              ...omit(unitRow, ["id", "variantId", "createdAt", "updatedAt"]),
              variantId: clonedVariant.id,
            })),
          });
        for (const sourcePlan of sourcePlans as any[]) {
          const travellerRules = sourcePlan.travellerRules || [];
          const cancellationRules = sourcePlan.cancellationRules || [];
          const commercialVersions = sourcePlan.commercialVersions || [];
          const planData = omit(sourcePlan, [
            "id",
            "variantId",
            "createdAt",
            "updatedAt",
            "travellerRules",
            "cancellationRules",
            "commercialVersions",
            "scheduleMappings",
            "channelMappings",
            "bookings",
            "commercialRules",
          ]);
          const clonedPlan = await tx.ratePlan.create({
            data: {
              ...planData,
              variantId: clonedVariant.id,
              travellerRules: travellerRules.length
                ? {
                    create: travellerRules.map((rule: any) =>
                      omit(rule, ["id", "ratePlanId"]),
                    ),
                  }
                : undefined,
              cancellationRules: cancellationRules.length
                ? {
                    create: cancellationRules.map((rule: any) =>
                      omit(rule, ["id", "ratePlanId"]),
                    ),
                  }
                : undefined,
              commercialVersions: commercialVersions.length
                ? {
                    create: commercialVersions.map((version: any) => ({
                      ...omit(version, [
                        "id",
                        "ratePlanId",
                        "createdAt",
                        "updatedAt",
                        "travellerPrices",
                        "bookingSnapshots",
                      ]),
                      createdById: user.sub,
                      travellerPrices: version.travellerPrices?.length
                        ? {
                            create: version.travellerPrices.map((price: any) =>
                              omit(price, [
                                "id",
                                "commercialVersionId",
                                "createdAt",
                                "updatedAt",
                              ]),
                            ),
                          }
                        : undefined,
                    })),
                  }
                : undefined,
            },
          } as any);
          ratePlanIdMap.set(sourcePlan.id, clonedPlan.id);
        }
        for (const sourceSchedule of sourceSchedules as any[]) {
          const slotTemplates = sourceSchedule.slotTemplates || [];
          const ratePlanMappings = sourceSchedule.ratePlanMappings || [];
          const scheduleData = omit(sourceSchedule, [
            "id",
            "variantId",
            "createdAt",
            "updatedAt",
            "status",
            "archivedAt",
            "slotTemplates",
            "ratePlanMappings",
            "sessions",
            "exceptions",
            "resourceRequirements",
          ]);
          const clonedSchedule = await tx.scheduleTemplate.create({
            data: {
              ...scheduleData,
              variantId: clonedVariant.id,
              status: ScheduleStatus.INACTIVE,
              slotTemplates: slotTemplates.length
                ? {
                    create: slotTemplates.map((slot: any) =>
                      omit(slot, [
                        "id",
                        "scheduleTemplateId",
                        "createdAt",
                        "updatedAt",
                        "archivedAt",
                      ]),
                    ),
                  }
                : undefined,
            },
          } as any);
          for (const mapping of ratePlanMappings as any[]) {
            const clonedRatePlanId = ratePlanIdMap.get(mapping.ratePlanId);
            if (clonedRatePlanId)
              await tx.ratePlanSchedule.create({
                data: {
                  ratePlanId: clonedRatePlanId,
                  scheduleTemplateId: clonedSchedule.id,
                  active: true,
                },
              });
          }
        }
      }
      await this.audit.write(tx, {
        actor: user,
        tenantId: product.tenantId,
        action: "PRODUCT_REVISION_CREATED",
        entityType: "ProductRevision",
        entityId: revision.id,
        afterState: {
          productId,
          sourceRevisionId: source.id,
          newRevisionId: revision.id,
          versionNumber: revision.versionNumber,
        },
      });
      return revision;
    });
    return result;
  }

  async listBookingQuestions(user: AuthUser, revisionId: string) {
    const tenantId = await this.tenantForRevision(user, revisionId);
    const revision = await this.prisma.productRevision.findFirst({
      where: { id: revisionId, product: { tenantId } },
    });
    if (!revision) throw new NotFoundException("Product revision not found");
    return this.prisma.productBookingQuestion.findMany({
      where: { productRevisionId: revisionId, archivedAt: null },
      orderBy: [{ rank: "asc" }, { code: "asc" }],
    });
  }

  async createBookingQuestion(
    user: AuthUser,
    revisionId: string,
    dto: import("./catalogue.dto").BookingQuestionDto,
  ) {
    const tenantId = await this.tenantForRevision(user, revisionId);
    const result = await this.prisma.$transaction(async (tx) => {
      const revision = await tx.productRevision.findFirst({
        where: { id: revisionId, product: { tenantId } },
      });
      if (!revision) throw new NotFoundException("Product revision not found");
      await tx.$queryRaw(
        Prisma.sql`SELECT "id" FROM "public"."ProductRevision" WHERE "id" = ${revisionId} FOR UPDATE`,
      );
      const locked = await tx.productRevision.findUniqueOrThrow({
        where: { id: revisionId },
      });
      this.assertMutableRevision(locked);
      try {
        const question = await tx.productBookingQuestion.create({
          data: {
            productRevisionId: revisionId,
            code: dto.code.trim(),
            label: dto.label.trim(),
            helpText: dto.helpText?.trim(),
            type: dto.type,
            required: dto.required ?? false,
            options: dto.options as Prisma.InputJsonValue | undefined,
            appliesPerTraveller: dto.appliesPerTraveller ?? false,
            rank: dto.rank ?? 0,
          },
        });
        await this.audit.write(tx, {
          actor: user,
          tenantId,
          action: "BOOKING_QUESTION_CREATED",
          entityType: "ProductBookingQuestion",
          entityId: question.id,
          metadata: {
            productId: locked.productId,
            revisionId,
            questionId: question.id,
            code: question.code,
          },
        });
        await this.tagAdminRevisionEdit(tx, revisionId, user, [`bookingQuestions.${question.code}`]);
        return question;
      } catch (error: any) {
        if (error?.code === "P2002")
          throw new ConflictException(
            "Question code already exists on this revision",
          );
        throw error;
      }
    });
    await this.notifyAdminRevisionEdited(revisionId, user);
    return result;
  }

  async updateBookingQuestion(
    user: AuthUser,
    id: string,
    dto: import("./catalogue.dto").UpdateBookingQuestionDto,
  ) {
    const tenantId = await this.tenantForQuestion(user, id);
    const result = await this.prisma.$transaction(async (tx) => {
      const question = await tx.productBookingQuestion.findFirst({
        where: { id, productRevision: { product: { tenantId } } },
      });
      if (!question) throw new NotFoundException("Booking question not found");
      await tx.$queryRaw(
        Prisma.sql`SELECT "id" FROM "public"."ProductRevision" WHERE "id" = ${question.productRevisionId} FOR UPDATE`,
      );
      const revision = await tx.productRevision.findUniqueOrThrow({
        where: { id: question.productRevisionId },
      });
      this.assertMutableRevision(revision);
      try {
        const updated = await tx.productBookingQuestion.update({
          where: { id },
          data: {
            ...(dto.code === undefined ? {} : { code: dto.code.trim() }),
            ...(dto.label === undefined ? {} : { label: dto.label.trim() }),
            ...(dto.helpText === undefined
              ? {}
              : { helpText: dto.helpText?.trim() }),
            ...(dto.type === undefined ? {} : { type: dto.type }),
            ...(dto.required === undefined ? {} : { required: dto.required }),
            ...(dto.options === undefined
              ? {}
              : { options: dto.options as Prisma.InputJsonValue }),
            ...(dto.appliesPerTraveller === undefined
              ? {}
              : { appliesPerTraveller: dto.appliesPerTraveller }),
            ...(dto.rank === undefined ? {} : { rank: dto.rank }),
          },
        });
        await this.audit.write(tx, {
          actor: user,
          tenantId,
          action: "BOOKING_QUESTION_UPDATED",
          entityType: "ProductBookingQuestion",
          entityId: id,
          metadata: {
            productId: revision.productId,
            revisionId: revision.id,
            questionId: id,
            code: updated.code,
          },
        });
        await this.tagAdminRevisionEdit(tx, revision.id, user, [`bookingQuestions.${updated.code}`]);
        return updated;
      } catch (error: any) {
        if (error?.code === "P2002")
          throw new ConflictException(
            "Question code already exists on this revision",
          );
        throw error;
      }
    });
    await this.notifyAdminRevisionEdited(result.productRevisionId, user);
    return result;
  }

  async archiveBookingQuestion(user: AuthUser, id: string) {
    const tenantId = await this.tenantForQuestion(user, id);
    const result = await this.prisma.$transaction(async (tx) => {
      const question = await tx.productBookingQuestion.findFirst({
        where: { id, productRevision: { product: { tenantId } } },
      });
      if (!question) throw new NotFoundException("Booking question not found");
      await tx.$queryRaw(
        Prisma.sql`SELECT "id" FROM "public"."ProductRevision" WHERE "id" = ${question.productRevisionId} FOR UPDATE`,
      );
      const revision = await tx.productRevision.findUniqueOrThrow({
        where: { id: question.productRevisionId },
      });
      this.assertMutableRevision(revision);
      const archived = await tx.productBookingQuestion.update({
        where: { id },
        data: { archivedAt: new Date() },
      });
      await this.audit.write(tx, {
        actor: user,
        tenantId,
        action: "BOOKING_QUESTION_ARCHIVED",
        entityType: "ProductBookingQuestion",
        entityId: id,
        metadata: {
          productId: revision.productId,
          revisionId: revision.id,
          questionId: id,
          code: question.code,
        },
      });
      await this.tagAdminRevisionEdit(tx, revision.id, user, [`bookingQuestions.${question.code}.archivedAt`]);
      return archived;
    });
    await this.notifyAdminRevisionEdited(result.productRevisionId, user);
    return result;
  }

  async updateRevision(
    user: AuthUser,
    id: string,
    dto: UpdateProductRevisionDto,
  ) {
    const tenantId = await this.tenantForRevision(user, id);
    const existing = await this.prisma.productRevision.findFirst({
      where: { id, product: { tenantId } },
    });
    if (!existing) throw new NotFoundException("Product revision not found");
    const changed = await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw(
        Prisma.sql`SELECT "id" FROM "public"."ProductRevision" WHERE "id" = ${id} FOR UPDATE`,
      );
      const current = await tx.productRevision.findUnique({ where: { id } });
      if (!current) throw new NotFoundException("Product revision not found");
      this.assertMutableRevision(current);
      const updateData = this.data(dto) as Prisma.ProductRevisionUpdateInput;
      if (user.role === UserRole.VENDOR && dto.sourcePayload !== undefined) {
        const currentPayload = current.sourcePayload && typeof current.sourcePayload === "object" && !Array.isArray(current.sourcePayload)
          ? current.sourcePayload as Record<string, unknown>
          : {};
        const submittedPayload = dto.sourcePayload && typeof dto.sourcePayload === "object" && !Array.isArray(dto.sourcePayload)
          ? { ...dto.sourcePayload }
          : {};
        delete submittedPayload.admin;
        delete submittedPayload.adminEdit;
        if (currentPayload.admin !== undefined)
          submittedPayload.admin = currentPayload.admin;
        if (currentPayload.adminEdit !== undefined)
          submittedPayload.adminEdit = currentPayload.adminEdit;
        updateData.sourcePayload = submittedPayload as Prisma.InputJsonValue;
      }
      const adminActor = user.role === UserRole.ADMIN || user.role === UserRole.SUPER_ADMIN;
      const changedFields = Object.keys(dto).filter((field) => field !== "sourcePayload").filter((field) => {
        const before = (current as any)[field] ?? null;
        const after = (dto as any)[field] ?? null;
        return JSON.stringify(before) !== JSON.stringify(after);
      });
      if (dto.sourcePayload !== undefined && updateData.sourcePayload !== undefined) {
        changedFields.push(...changedJsonPaths(current.sourcePayload, updateData.sourcePayload, "sourcePayload"));
      }
      if (adminActor && changedFields.length) {
        const currentPayload = current.sourcePayload && typeof current.sourcePayload === "object" && !Array.isArray(current.sourcePayload)
          ? current.sourcePayload as Record<string, unknown>
          : {};
        const suppliedPayload = updateData.sourcePayload && typeof updateData.sourcePayload === "object" && !Array.isArray(updateData.sourcePayload)
          ? updateData.sourcePayload as Record<string, unknown>
          : {};
        updateData.sourcePayload = {
          ...currentPayload,
          ...suppliedPayload,
          adminEdit: {
            editedByAdmin: true,
            lastEditedById: user.sub,
            lastEditedByName: user.fullName || user.email,
            lastEditedAt: new Date().toISOString(),
          },
        } as Prisma.InputJsonValue;
      }
      const updated = await tx.productRevision.update({
        where: { id },
        data: updateData,
      });
      if (dto.travellerDetails !== undefined)
        await this.syncTravellerDetailQuestions(
          tx,
          id,
          dto.travellerDetails || "",
        );
      if (dto.fulfilmentPolicy) {
        const policyCheck = validateFulfilmentPolicy(dto.fulfilmentPolicy);
        if (!policyCheck.valid && dto.fulfilmentPolicy.mode)
          throw new ConflictException(policyCheck.reason);
        await tx.productFulfilmentPolicy.upsert({
          where: { productRevisionId: id },
          create: {
            productRevisionId: id,
            ...this.policyData(dto.fulfilmentPolicy),
          },
          update: this.policyData(dto.fulfilmentPolicy),
        });
        await this.audit.write(tx, {
          actor: user,
          tenantId,
          action: "PRODUCT_FULFILMENT_POLICY_UPDATED",
          entityType: "ProductFulfilmentPolicy",
          entityId: id,
          metadata: { revisionId: id },
        });
      }
      await this.audit.write(tx, {
        actor: user,
        tenantId,
        action: adminActor && changedFields.length ? "PRODUCT_REVISION_ADMIN_EDITED" : "PRODUCT_REVISION_UPDATED",
        entityType: "ProductRevision",
        entityId: id,
        beforeState: adminActor && changedFields.length
          ? Object.fromEntries(changedFields.map((field) => [field, (current as any)[field] ?? null]))
          : { status: current.status },
        afterState: adminActor && changedFields.length
          ? Object.fromEntries(changedFields.map((field) => [field, (dto as any)[field] ?? null]))
          : { status: updated.status },
        metadata: adminActor && changedFields.length ? { editedByAdmin: true, changedFields } : undefined,
      });
      if (adminActor && changedFields.length) {
        await this.outbox.enqueue(tx, {
          tenantId,
          eventType: "PRODUCT_ADMIN_EDITED",
          aggregateType: "ProductRevision",
          aggregateId: id,
          payload: {
            productId: current.productId,
            revisionId: id,
            versionNumber: current.versionNumber,
            editedByAdmin: true,
            editorId: user.sub,
            editorName: user.fullName || user.email,
            changedFields,
          },
        });
      }
      return { updated, adminEdited: adminActor && changedFields.length > 0 };
    });
    if (changed.adminEdited) {
      await this.notifyCatalogueEmail("admin edit", () =>
        this.catalogueEmail?.notifyAdminEdited(id, user.fullName || user.email),
      );
    }
    return changed.updated;
  }

  async submitRevision(user: AuthUser, id: string) {
    const tenantId = await this.tenantForRevision(user, id);
    let publishedDirectly = false;
    const submitted = await this.prisma.$transaction(async (tx) => {
      const existing = await tx.productRevision.findFirst({
        where: { id, product: { tenantId } },
        include: { product: { select: { id: true, currentRevisionId: true } } },
      });
      if (!existing) throw new NotFoundException("Product revision not found");
      if (existing.status !== ProductRevisionStatus.DRAFT)
        throw new ConflictException(
          `Only DRAFT revisions can be submitted; current status is ${existing.status}`,
        );
      if (this.readinessService) {
        const result = await this.readinessService.evaluate(
          user,
          existing.productId,
          tx,
        );
        if (!result.ready)
          throw new ConflictException({
            code: "PRODUCT_NOT_READY",
            message: "Product is not ready for review",
            details: result,
          });
      }
      const sourcePayload = existing.sourcePayload && typeof existing.sourcePayload === "object" && !Array.isArray(existing.sourcePayload)
        ? existing.sourcePayload as Record<string, unknown>
        : {};
      const adminMetadata = sourcePayload.admin && typeof sourcePayload.admin === "object" && !Array.isArray(sourcePayload.admin)
        ? sourcePayload.admin as Record<string, unknown>
        : {};
      // Only a Super Admin can exercise the direct-publish mode. Other roles
      // continue through the QC queue even if a draft contains this metadata.
      publishedDirectly = user.role === UserRole.SUPER_ADMIN && adminMetadata.approvalMode === "PUBLISH_DIRECTLY";
      if (publishedDirectly) {
        await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "Product" WHERE "id" = ${existing.productId} FOR UPDATE`);
        const currentPublished = await tx.productRevision.findFirst({
          where: { productId: existing.productId, status: ProductRevisionStatus.PUBLISHED },
          orderBy: { versionNumber: "desc" },
          select: { id: true },
        });
        if (currentPublished) {
          const superseded = await tx.productRevision.updateMany({
            where: { id: currentPublished.id, productId: existing.productId, status: ProductRevisionStatus.PUBLISHED },
            data: { status: ProductRevisionStatus.SUPERSEDED },
          });
          if (superseded.count !== 1) throw new ConflictException("Current published revision changed in another session");
        }
        const now = new Date();
        const changed = await tx.productRevision.updateMany({
          where: { id, productId: existing.productId, status: ProductRevisionStatus.DRAFT },
          data: { status: ProductRevisionStatus.PUBLISHED, submittedAt: now, reviewedAt: now, reviewedById: user.sub, rejectionReason: null },
        });
        if (changed.count !== 1) throw new ConflictException("Revision changed in another session");
        await tx.product.update({ where: { id: existing.productId }, data: { currentRevisionId: id, status: ProductStatus.LIVE } });
        await this.audit.write(tx, {
          actor: user,
          tenantId,
          action: "PRODUCT_REVISION_DIRECTLY_PUBLISHED",
          entityType: "ProductRevision",
          entityId: id,
          beforeState: { status: existing.status, currentRevisionId: existing.product.currentRevisionId },
          afterState: { status: ProductRevisionStatus.PUBLISHED, currentRevisionId: id },
        });
        await this.outbox.enqueue(tx, {
          tenantId,
          eventType: "PRODUCT_PUBLISHED",
          aggregateType: "Product",
          aggregateId: existing.productId,
          payload: { revisionId: id, versionNumber: existing.versionNumber, direct: true },
        });
        return tx.productRevision.findUniqueOrThrow({ where: { id } });
      }
      const changed = await tx.productRevision.updateMany({
        where: { id, status: ProductRevisionStatus.DRAFT },
        data: {
          status: ProductRevisionStatus.UNDER_REVIEW,
          submittedAt: new Date(),
          rejectionReason: null,
        },
      });
      if (changed.count !== 1)
        throw new ConflictException("Revision changed in another session");
      await this.audit.write(tx, {
        actor: user,
        tenantId,
        action: "PRODUCT_REVISION_SUBMITTED",
        entityType: "ProductRevision",
        entityId: id,
        beforeState: { status: existing.status },
        afterState: { status: ProductRevisionStatus.UNDER_REVIEW },
      });
      await this.outbox.enqueue(tx, {
        tenantId,
        eventType: "PRODUCT_SUBMITTED",
        aggregateType: "ProductRevision",
        aggregateId: id,
        payload: {
          productId: existing.productId,
          versionNumber: existing.versionNumber,
        },
      });
      return tx.productRevision.findUniqueOrThrow({ where: { id } });
    });
    if (publishedDirectly) {
      await this.notifyCatalogueEmail("direct publication", () =>
        this.catalogueEmail?.notifyDecision(submitted.id, "APPROVED", null),
      );
    } else {
      await this.notifyCatalogueEmail("submission", () =>
        this.catalogueEmail?.notifySubmitted(submitted.id),
      );
    }
    return submitted;
  }

  async withdrawRevision(user: AuthUser, id: string) {
    const tenantId = await this.tenantForRevision(user, id);
    const withdrawn = await this.prisma.$transaction(async (tx) => {
      const existing = await tx.productRevision.findFirst({
        where: { id, product: { tenantId, deletedAt: null } },
        select: {
          id: true,
          productId: true,
          status: true,
          versionNumber: true,
        },
      });
      if (!existing) throw new NotFoundException("Product revision not found");
      if (existing.status !== ProductRevisionStatus.UNDER_REVIEW)
        throw new ConflictException(
          `Only UNDER_REVIEW revisions can be withdrawn; current status is ${existing.status}`,
        );
      const changed = await tx.productRevision.updateMany({
        where: { id, status: ProductRevisionStatus.UNDER_REVIEW },
        data: {
          status: ProductRevisionStatus.DRAFT,
          submittedAt: null,
          reviewedAt: null,
          reviewedById: null,
        },
      });
      if (changed.count !== 1)
        throw new ConflictException("Revision changed in another session");
      await this.audit.write(tx, {
        actor: user,
        tenantId,
        action: "PRODUCT_REVISION_WITHDRAWN",
        entityType: "ProductRevision",
        entityId: id,
        beforeState: { status: ProductRevisionStatus.UNDER_REVIEW },
        afterState: { status: ProductRevisionStatus.DRAFT },
      });
      await this.outbox.enqueue(tx, {
        tenantId,
        eventType: "PRODUCT_SUBMISSION_WITHDRAWN",
        aggregateType: "ProductRevision",
        aggregateId: id,
        payload: {
          productId: existing.productId,
          versionNumber: existing.versionNumber,
        },
      });
      return tx.productRevision.findUniqueOrThrow({ where: { id } });
    });
    return withdrawn;
  }

  private async changeVendorProductStatus(
    user: AuthUser,
    id: string,
    action: "deactivate" | "archive" | "reactivate",
  ) {
    const tenantId = requireTenant(user);
    return this.prisma.$transaction(async (tx) => {
      const product: any = await tx.product.findFirst({
        where: { id, tenantId, deletedAt: null },
        include: { currentRevision: { select: { status: true, type: true, subType: true, category: true, subCategory: true } } },
      });
      if (!product) throw new NotFoundException("Product not found");
      const allowedStatuses: ProductStatus[] =
        action === "deactivate"
          ? [ProductStatus.LIVE]
          : action === "archive"
            ? [ProductStatus.SUSPENDED]
            : [ProductStatus.SUSPENDED, ProductStatus.ARCHIVED];
      if (!allowedStatuses.includes(product.status))
        throw new ConflictException(
          `Cannot ${action} a product in ${product.status} status`,
        );
      if (
        action === "reactivate" &&
        product.currentRevision?.status !== ProductRevisionStatus.PUBLISHED
      )
        throw new ConflictException(
          "A published revision is required before reactivating this product",
        );
      if (action === "reactivate") {
        const application = await tx.vendorOnboardingApplication.findUnique({ where: { tenantId }, select: { supplementalData: true } });
        const supplemental = application?.supplementalData && typeof application.supplementalData === 'object' && !Array.isArray(application.supplementalData) ? application.supplementalData as Record<string, unknown> : {};
        const requiredTypes = requiredVendorDocumentsForProduct(supplemental.categories, product.currentRevision);
        const documents = await tx.vendorDocument.findMany({ where: { tenantId, type: { in: requiredTypes as any } }, select: { type: true, currentStatus: true, versions: { orderBy: { versionNumber: 'desc' }, take: 1, select: { status: true, expiresAt: true } } } });
        const byType = new Map(documents.map((document: any) => [document.type, document]));
        const invalid = requiredTypes.filter((type) => {
          const document: any = byType.get(type);
          const latest = document?.versions[0];
          return document?.currentStatus !== 'VERIFIED' || latest?.status !== 'VERIFIED' || (latest.expiresAt && latest.expiresAt <= new Date());
        });
        if (invalid.length) throw new ConflictException(`Current verified documents are required before reactivating this product: ${invalid.join(', ')}`);
      }
      const next =
        action === "deactivate"
          ? ProductStatus.SUSPENDED
          : action === "archive"
            ? ProductStatus.ARCHIVED
            : ProductStatus.LIVE;
      const updated = await tx.product.update({
        where: { id },
        data: { status: next },
      });
      const actionName =
        action === "deactivate"
          ? "PRODUCT_DEACTIVATED"
          : action === "archive"
            ? "PRODUCT_ARCHIVED"
            : "PRODUCT_REACTIVATED";
      await this.audit.write(tx, {
        actor: user,
        tenantId,
        action: actionName,
        entityType: "Product",
        entityId: id,
        beforeState: { status: product.status },
        afterState: { status: next },
      });
      await this.outbox.enqueue(tx, {
        tenantId,
        eventType: actionName,
        aggregateType: "Product",
        aggregateId: id,
        payload: { fromStatus: product.status, toStatus: next },
      });
      return updated;
    });
  }

  async deactivate(user: AuthUser, id: string) {
    return this.changeVendorProductStatus(user, id, "deactivate");
  }
  async archive(user: AuthUser, id: string) {
    return this.changeVendorProductStatus(user, id, "archive");
  }
  async reactivate(user: AuthUser, id: string) {
    return this.changeVendorProductStatus(user, id, "reactivate");
  }

  private async hardDeleteDraftGraph(
    tx: Prisma.TransactionClient,
    productId: string,
  ) {
    const variants = await tx.productVariant.findMany({
      where: { productId },
      select: { id: true },
    });
    const variantIds = variants.map((item) => item.id);
    const ratePlans = variantIds.length
      ? await tx.ratePlan.findMany({
          where: { variantId: { in: variantIds } },
          select: { id: true },
        })
      : [];
    const ratePlanIds = ratePlans.map((item) => item.id);
    const schedules = variantIds.length
      ? await tx.scheduleTemplate.findMany({
          where: { variantId: { in: variantIds } },
          select: { id: true },
        })
      : [];
    const scheduleIds = schedules.map((item) => item.id);
    const sessions = scheduleIds.length
      ? await tx.serviceSession.findMany({
          where: { scheduleTemplateId: { in: scheduleIds } },
          select: { id: true },
        })
      : [];
    const sessionIds = sessions.map((item) => item.id);

    // Delete only records owned by this draft graph. Shared channels, resources,
    // users, tenants and file assets are deliberately left intact.
    if (sessionIds.length) {
      await tx.sessionResourceAllocation.deleteMany({
        where: { sessionId: { in: sessionIds } },
      });
      await tx.inventoryAllocation.deleteMany({
        where: { inventoryState: { sessionId: { in: sessionIds } } },
      });
      await tx.inventoryHold.deleteMany({
        where: { inventoryState: { sessionId: { in: sessionIds } } },
      });
      await tx.inventoryState.deleteMany({
        where: { sessionId: { in: sessionIds } },
      });
      await tx.serviceSession.deleteMany({ where: { id: { in: sessionIds } } });
    }
    if (scheduleIds.length) {
      await tx.scheduleException.deleteMany({
        where: { scheduleTemplateId: { in: scheduleIds } },
      });
      await tx.scheduleResourceRequirement.deleteMany({
        where: { scheduleTemplateId: { in: scheduleIds } },
      });
      await tx.ratePlanSchedule.deleteMany({
        where: { scheduleTemplateId: { in: scheduleIds } },
      });
      await tx.scheduleSlotTemplate.deleteMany({
        where: { scheduleTemplateId: { in: scheduleIds } },
      });
      await tx.scheduleTemplate.deleteMany({
        where: { id: { in: scheduleIds } },
      });
    }
    if (ratePlanIds.length) {
      // Commercial versions are draft-owned; booking economics would be blocked
      // by the booking guard above and therefore cannot be removed here.
      await tx.ratePlanCommercialVersion.deleteMany({
        where: { ratePlanId: { in: ratePlanIds } },
      });
      await tx.ratePlan.deleteMany({ where: { id: { in: ratePlanIds } } });
    }
    if (variantIds.length)
      await tx.productVariant.deleteMany({ where: { id: { in: variantIds } } });
    await tx.productRevision.deleteMany({ where: { productId } });
    await tx.product.delete({ where: { id: productId } });
  }

  async deleteDraft(user: AuthUser, id: string) {
    const tenantId = requireTenant(user);
    return this.prisma.$transaction(async (tx) => {
      const product: any = await tx.product.findFirst({
        where: { id, tenantId, deletedAt: null },
        select: {
          id: true,
          status: true,
          productCode: true,
          _count: { select: { bookings: true } },
          revisions: { select: { status: true } },
        },
      });
      if (!product) throw new NotFoundException("Product not found");
      if (product.status !== ProductStatus.DRAFT)
        throw new ConflictException("Only draft products can be deleted");
      if (product._count.bookings > 0)
        throw new ConflictException("Products with bookings cannot be deleted");
      if (
        product.revisions.some((revision: any) =>
          [
            ProductRevisionStatus.PUBLISHED,
            ProductRevisionStatus.SUPERSEDED,
          ].includes(revision.status),
        )
      )
        throw new ConflictException(
          "A product with published history cannot be deleted",
        );
      const deletedAt = new Date();
      const setting =
        (await tx.globalSetting.findFirst({
          where: { key: "HARD_DELETE_DRAFT", tenantId },
          select: { value: true, tenantId: true },
        })) ||
        (await tx.globalSetting.findFirst({
          where: { key: "HARD_DELETE_DRAFT", tenantId: null },
          select: { value: true, tenantId: true },
        }));
      const configuredValue: any = setting?.value;
      const hardDelete = setting
        ? configuredValue === true || configuredValue?.enabled === true
        : String(process.env.HARD_DELETE_DRAFT || "").toLowerCase() === "true";
      await this.audit.write(tx, {
        actor: user,
        tenantId,
        action: "PRODUCT_DELETED",
        entityType: "Product",
        entityId: id,
        beforeState: { status: product.status },
        afterState: {
          deletedAt: hardDelete ? null : deletedAt.toISOString(),
          hardDelete,
        },
      });
      if (hardDelete) {
        // Detach the composite current-revision pointer before deleting the
        // vendor-owned draft graph. Shared catalogue records are not touched.
        await tx.product.update({
          where: { id },
          data: { currentRevisionId: null },
        });
        try {
          await this.hardDeleteDraftGraph(tx, id);
        } catch (error: any) {
          if (error?.code === "P2003")
            throw new ConflictException(
              "Hard delete is blocked because this draft still has dependent catalogue records",
            );
          throw error;
        }
        await this.outbox.enqueue(tx, {
          tenantId,
          eventType: "PRODUCT_DELETED",
          aggregateType: "Product",
          aggregateId: id,
          payload: { productCode: product.productCode, hardDelete: true },
        });
        return { id, deletedAt: null, hardDeleted: true };
      }
      await tx.product.update({
        where: { id },
        data: { deletedAt, deletedById: user.sub },
      });
      await this.outbox.enqueue(tx, {
        tenantId,
        eventType: "PRODUCT_DELETED",
        aggregateType: "Product",
        aggregateId: id,
        payload: { productCode: product.productCode, hardDelete: false },
      });
      return { id, deletedAt, hardDeleted: false };
    });
  }

  /**
   * Publish the simplified editor's pending commercial history atomically with
   * the product revision. Existing active versions are split instead of being
   * overwritten so booking snapshots keep their original version identity.
   */
  private async activateActivityEditorVersions(
    tx: any,
    productId: string,
    actorId: string,
    tenantId: string,
  ) {
    if (!tx.ratePlanCommercialVersion?.findMany) return;
    const pending: any[] = await tx.ratePlanCommercialVersion.findMany({
      where: { status: "DRAFT", ratePlan: { variant: { productId } } },
      include: { travellerPrices: true },
      orderBy: [
        { ratePlanId: "asc" },
        { effectiveFrom: "asc" },
        { versionNumber: "asc" },
      ],
    });
    for (const candidate of pending.filter(
      (version) =>
        (version.sourcePayload as any)?.createdFromActivityEditor === true,
    )) {
      if (
        !candidate.supplierModel ||
        !candidate.pricingUnit ||
        candidate.supplierBaseAmount == null ||
        !candidate.bookingMode ||
        (candidate.pricingUnit === "PER_PERSON" &&
          !candidate.travellerPrices?.length)
      ) {
        throw new ConflictException({
          code: "PRODUCT_COMMERCIAL_NOT_READY",
          message:
            "Complete the prices and booking rules before approving this activity.",
        });
      }
      const from = new Date(candidate.effectiveFrom);
      const to = candidate.effectiveTo ? new Date(candidate.effectiveTo) : null;
      const overlapping: any[] = await tx.ratePlanCommercialVersion.findMany({
        where: {
          ratePlanId: candidate.ratePlanId,
          status: "ACTIVE",
          effectiveFrom: { lt: to || new Date("9999-12-31") },
          OR: [{ effectiveTo: null }, { effectiveTo: { gt: from } }],
        },
        include: { travellerPrices: true },
      });
      for (const old of overlapping) {
        const oldFrom = new Date(old.effectiveFrom);
        const oldTo = old.effectiveTo ? new Date(old.effectiveTo) : null;
        if (oldFrom < from) {
          await tx.ratePlanCommercialVersion.update({
            where: { id: old.id },
            data: { effectiveTo: from },
          });
          if (to && (!oldTo || oldTo > to)) {
            const latest = await tx.ratePlanCommercialVersion.findFirst({
              where: { ratePlanId: old.ratePlanId },
              orderBy: { versionNumber: "desc" },
              select: { versionNumber: true },
            });
            await tx.ratePlanCommercialVersion.create({
              data: {
                ratePlanId: old.ratePlanId,
                versionNumber: (latest?.versionNumber || 0) + 1,
                status: "ACTIVE",
                effectiveFrom: to,
                effectiveTo: oldTo,
                supplierModel: old.supplierModel,
                currency: old.currency,
                pricingUnit: old.pricingUnit,
                supplierBaseAmount: old.supplierBaseAmount,
                supplierCommissionPercent: old.supplierCommissionPercent,
                bookingMode: old.bookingMode,
                confirmationSlaMinutes: old.confirmationSlaMinutes,
                sourcePayload: old.sourcePayload as Prisma.InputJsonValue,
                createdById: old.createdById,
                activatedById: old.activatedById,
                travellerPrices: old.travellerPrices?.length
                  ? {
                      create: old.travellerPrices.map((price: any) => ({
                        travellerType: price.travellerType,
                        amount: price.amount,
                      })),
                    }
                  : undefined,
              },
            });
          }
        } else if (to && (!oldTo || oldTo > to)) {
          await tx.ratePlanCommercialVersion.update({
            where: { id: old.id },
            data: { effectiveFrom: to },
          });
        } else {
          await tx.ratePlanCommercialVersion.update({
            where: { id: old.id },
            data: { status: "RETIRED" },
          });
        }
      }
      await tx.ratePlanCommercialVersion.update({
        where: { id: candidate.id },
        data: { status: "ACTIVE", activatedById: actorId },
      });
      await this.audit.write(tx, {
        actor: { sub: actorId, role: UserRole.ADMIN } as any,
        tenantId,
        action: "ACTIVITY_EDITOR_COMMERCIAL_VERSION_ACTIVATED",
        entityType: "RatePlanCommercialVersion",
        entityId: candidate.id,
        afterState: {
          productId,
          ratePlanId: candidate.ratePlanId,
          effectiveFrom: from,
          effectiveTo: to,
        },
      });
    }
  }

  async review(
    user: AuthUser,
    id: string,
    decision: "publish" | "reject",
    dto?: RejectProductRevisionDto,
  ) {
    if (user.role !== UserRole.SUPER_ADMIN && user.role !== UserRole.ADMIN)
      throw new ConflictException(
        "Only platform reviewers can review product revisions",
      );
    if (
      decision === "reject" &&
      (!dto?.reason?.trim() || dto.reason.trim().length < 5)
    )
      throw new ConflictException(
        "A rejection reason of at least 5 characters is required",
      );
    const reviewed = await this.prisma.$transaction(async (tx) => {
      const candidate = await tx.productRevision.findFirst({
        where: { id, product: { tenant: { kind: "VENDOR" } } },
        include: { product: true },
      });
      if (!candidate) throw new NotFoundException("Product revision not found");
      if (candidate.status !== ProductRevisionStatus.UNDER_REVIEW)
        throw new ConflictException(
          `Only UNDER_REVIEW revisions can be reviewed; current status is ${candidate.status}`,
        );
      if (decision === "publish" && candidate.createdById === user.sub)
        throw new ConflictException(
          "A second platform reviewer must publish a revision created by this account",
        );
      await tx.$queryRaw(
        Prisma.sql`SELECT "id" FROM "Product" WHERE "id" = ${candidate.productId} FOR UPDATE`,
      );
      if (decision === "reject") {
        const changed = await tx.productRevision.updateMany({
          where: { id, status: ProductRevisionStatus.UNDER_REVIEW },
          data: {
            status: ProductRevisionStatus.REJECTED,
            rejectionReason: dto!.reason.trim(),
            reviewedAt: new Date(),
            reviewedById: user.sub,
          },
        });
        if (changed.count !== 1)
          throw new ConflictException(
            "Revision changed in another session; only one review action can win",
          );
        await this.audit.write(tx, {
          actor: user,
          tenantId: candidate.product.tenantId,
          action: "PRODUCT_REVISION_REJECTED",
          entityType: "ProductRevision",
          entityId: id,
          reason: dto!.reason,
          beforeState: { status: candidate.status },
          afterState: { status: ProductRevisionStatus.REJECTED },
        });
        await this.outbox.enqueue(tx, {
          tenantId: candidate.product.tenantId,
          eventType: "PRODUCT_REJECTED",
          aggregateType: "ProductRevision",
          aggregateId: id,
          payload: {
            productId: candidate.productId,
            reason: dto!.reason.trim(),
          },
        });
      } else {
        await this.activateActivityEditorVersions(
          tx,
          candidate.productId,
          user.sub,
          candidate.product.tenantId,
        );
        const currentPublished = await tx.productRevision.findFirst({
          where: {
            productId: candidate.productId,
            status: ProductRevisionStatus.PUBLISHED,
          },
          orderBy: { versionNumber: "desc" },
          select: { id: true },
        });
        if (currentPublished) {
          const superseded = await tx.productRevision.updateMany({
            where: {
              id: currentPublished.id,
              productId: candidate.productId,
              status: ProductRevisionStatus.PUBLISHED,
            },
            data: { status: ProductRevisionStatus.SUPERSEDED },
          });
          if (superseded.count !== 1)
            throw new ConflictException(
              "Current published revision changed in another session",
            );
        }
        const changed = await tx.productRevision.updateMany({
          where: {
            id,
            productId: candidate.productId,
            status: ProductRevisionStatus.UNDER_REVIEW,
          },
          data: {
            status: ProductRevisionStatus.PUBLISHED,
            reviewedAt: new Date(),
            reviewedById: user.sub,
            rejectionReason: null,
          },
        });
        if (changed.count !== 1)
          throw new ConflictException(
            "Revision changed in another session; only one review action can win",
          );
        await tx.product.update({
          where: { id: candidate.productId },
          data: { currentRevisionId: id, status: ProductStatus.LIVE },
        });
        await this.audit.write(tx, {
          actor: user,
          tenantId: candidate.product.tenantId,
          action: "PRODUCT_REVISION_PUBLISHED",
          entityType: "ProductRevision",
          entityId: id,
          beforeState: {
            status: candidate.status,
            currentRevisionId: candidate.product.currentRevisionId,
          },
          afterState: {
            status: ProductRevisionStatus.PUBLISHED,
            currentRevisionId: id,
          },
        });
        await this.outbox.enqueue(tx, {
          tenantId: candidate.product.tenantId,
          eventType: "PRODUCT_PUBLISHED",
          aggregateType: "Product",
          aggregateId: candidate.productId,
          payload: { revisionId: id, versionNumber: candidate.versionNumber },
        });
      }
      return tx.product.findUniqueOrThrow({
        where: { id: candidate.productId },
        include: { currentRevision: true },
      });
    });
    await this.notifyCatalogueEmail("review decision", () =>
      this.catalogueEmail?.notifyDecision(
        id,
        decision === "publish" ? "APPROVED" : "REJECTED",
        decision === "reject" ? (dto?.reason ?? null) : null,
      ),
    );
    return reviewed;
  }

  private async notifyCatalogueEmail(
    context: string,
    send: () => Promise<void> | undefined,
  ) {
    if (!send) return;
    try {
      await send();
    } catch (error) {
      // Email is an asynchronous notification. It must not turn a committed
      // product state transition into a false failure when SMTP is unavailable.
      console.warn(
        `[catalogue email] ${context} notification skipped`,
        error instanceof Error ? error.message : error,
      );
    }
  }

  async listReview() {
    return this.prisma.productRevision.findMany({
      where: { status: ProductRevisionStatus.UNDER_REVIEW },
      select: {
        id: true,
        productId: true,
        versionNumber: true,
        status: true,
        productName: true,
        type: true,
        subType: true,
        subCategory: true,
        meetingModel: true,
        meetingPoint: true,
        description: true,
        shortDescription: true,
        highlights: true,
        importantInfo: true,
        thingsToCarry: true,
        safetyMeasures: true,
        terms: true,
        howToRedeem: true,
        additionalInfo: true,
        channels: true,
        labels: true,
        cityName: true,
        stateName: true,
        countryName: true,
        address: true,
        lat: true,
        lon: true,
        submittedAt: true,
        updatedAt: true,
        media: {
          where: { archivedAt: null },
          orderBy: { rank: "asc" },
          include: { fileAsset: { select: { id: true, originalName: true } } },
        },
        bookingQuestions: {
          where: { archivedAt: null },
          orderBy: [{ rank: "asc" }, { code: "asc" }],
        },
        fulfilmentPolicy: true,
        product: {
          select: {
            productCode: true,
            tenant: {
              select: {
                id: true,
                name: true,
                vendorProfile: {
                  select: { legalBusinessName: true, verificationStatus: true },
                },
              },
            },
            variants: {
              where: {
                status: { not: VariantStatus.ARCHIVED },
                archivedAt: null,
              },
              include: reviewVariantInclude,
              orderBy: { createdAt: "asc" },
            },
          },
        },
      },
      orderBy: { submittedAt: "asc" },
    });
  }
  async adminDetail(productId: string) {
    const product: any = await this.prisma.product.findFirst({
      where: { id: productId, deletedAt: null, tenant: { kind: "VENDOR" } },
      select: {
        id: true,
        productCode: true,
        status: true,
        currentRevisionId: true,
        tenant: {
          select: {
            id: true,
            name: true,
            vendorProfile: {
              select: { legalBusinessName: true, verificationStatus: true },
            },
          },
        },
        revisions: {
          orderBy: { versionNumber: "desc" },
          select: {
            id: true,
            versionNumber: true,
            status: true,
            productName: true,
            type: true,
            subType: true,
            subCategory: true,
            meetingModel: true,
            meetingPoint: true,
            description: true,
            shortDescription: true,
            highlights: true,
            importantInfo: true,
            thingsToCarry: true,
            safetyMeasures: true,
            terms: true,
            howToRedeem: true,
            additionalInfo: true,
            channels: true,
            labels: true,
            cityName: true,
            stateName: true,
            countryName: true,
            address: true,
            lat: true,
            lon: true,
            submittedAt: true,
            updatedAt: true,
            media: {
              where: { archivedAt: null },
              orderBy: { rank: "asc" },
              include: {
                fileAsset: { select: { id: true, originalName: true } },
              },
            },
            bookingQuestions: {
              where: { archivedAt: null },
              orderBy: [{ rank: "asc" }, { code: "asc" }],
            },
            fulfilmentPolicy: true,
          },
        },
        variants: {
          where: { status: { not: VariantStatus.ARCHIVED }, archivedAt: null },
          include: reviewVariantInclude,
          orderBy: { createdAt: "asc" },
        },
      },
    });
    if (!product) throw new NotFoundException("Product not found");
    const revision =
      product.revisions.find(
        (item: any) =>
          item.status === ProductRevisionStatus.DRAFT ||
          item.status === ProductRevisionStatus.UNDER_REVIEW,
      ) ||
      product.revisions.find(
        (item: any) => item.id === product.currentRevisionId,
      ) ||
      product.revisions.find(
        (item: any) => item.status === ProductRevisionStatus.REJECTED,
      ) ||
      product.revisions[0];
    if (!revision) throw new NotFoundException("Product revision not found");
    return {
      productId: product.id,
      publicCode: await publicIdentifier(this.prisma, PublicEntity.PRODUCT, product.id),
      ...revision,
      product: {
        id: product.id,
        productCode: product.productCode,
        status: product.status,
        tenant: product.tenant,
        variants: product.variants.filter(
          (variant: any) =>
            !variant.revisionId || variant.revisionId === revision.id,
        ),
      },
    };
  }
  async variants(user: AuthUser, productId: string) {
    const owned = await this.product(user, productId);
    const product = await this.prisma.product.findFirst({
      where: { id: productId, tenantId: owned.tenantId },
      select: {
        currentRevisionId: true,
        revisions: {
          where: {
            status: {
              in: [
                ProductRevisionStatus.DRAFT,
                ProductRevisionStatus.UNDER_REVIEW,
                ProductRevisionStatus.REJECTED,
              ],
            },
          },
          orderBy: { versionNumber: "desc" },
          select: { id: true, status: true },
        },
      },
    });
    if (!product) throw new NotFoundException("Product not found");
    const revision = product.revisions.find(
      (item) =>
        item.status === ProductRevisionStatus.DRAFT ||
        item.status === ProductRevisionStatus.UNDER_REVIEW,
    ) ||
      product.revisions.find(
        (item) => item.status === ProductRevisionStatus.REJECTED,
      ) || { id: product.currentRevisionId };
    return this.prisma.productVariant.findMany({
      where: {
        productId,
        status: { not: VariantStatus.ARCHIVED },
        ...(revision?.id
          ? {
              OR: [
                { revisionId: revision.id },
                {
                  revisionId: null,
                  product: { currentRevisionId: revision.id },
                },
              ],
            }
          : {}),
      },
      include: variantInclude,
      orderBy: { createdAt: "asc" },
    });
  }

  private activityPriceInput(
    dto: ActivityPricesAvailabilityDto,
    optionNames = new Map<string, string>(),
  ) {
    const errors: string[] = [];
    const seen = new Set<string>();
    for (const [index, option] of (dto.options || []).entries()) {
      if (seen.has(option.variantId))
        errors.push(`options[${index}]: each option can be included only once`);
      seen.add(option.variantId);
      const from = new Date(
        option.effectiveFrom || new Date().toISOString().slice(0, 10),
      );
      const to = new Date(
        option.effectiveTo ||
          new Date(Date.now() + 365 * 86400000).toISOString().slice(0, 10),
      );
      if (to <= from)
        errors.push(
          `options[${index}]: selling end must be after selling start (the end date is exclusive)`,
        );
      const prices = option.travellerPrices || [];
      if (option.pricingUnit === PricingUnit.PER_PERSON && !prices.length)
        errors.push(
          `options[${index}]: add at least one traveller price for per-traveller pricing`,
        );
      if (
        option.pricingUnit === PricingUnit.PER_PERSON &&
        !prices.some((price) => price.travellerType === TravellerType.ADULT)
      )
        errors.push(
          `${optionNames.get(option.variantId) || `Option ${index + 1}`}: enter an adult price for per-traveller pricing`,
        );
      if (
        option.pricingUnit !== PricingUnit.PER_PERSON &&
        !option.supplierBaseAmount
      )
        errors.push(
          `options[${index}]: add a base amount for this pricing basis`,
        );
      if (option.mrpMode === "YES" && !option.mrpAmount)
        errors.push(
          `${optionNames.get(option.variantId) || `Option ${index + 1}`}: enter the MRP / gate price when MRP is enabled`,
        );
      if (option.mrpMode === "YES" && option.mrpAmount) {
        const mrp = Number(option.mrpAmount);
        const sellPrices = [
          option.supplierBaseAmount,
          ...(prices || []).map((price) => price.amount),
          ...(option.visitorPrices || []).flatMap((price) => [
            price.indian,
            price.foreign,
          ]),
        ]
          .filter((value) => value !== undefined && value !== "")
          .map(Number);
        if (sellPrices.some((price) => Number.isFinite(price) && price > mrp)) {
          errors.push(
            `${optionNames.get(option.variantId) || `Option ${index + 1}`}: selling prices cannot be above the MRP / gate price`,
          );
        }
      }
      if (
        option.pricingUnit === PricingUnit.PER_UNIT &&
        option.maxPassengersPerResource == null
      )
        errors.push(
          `options[${index}]: add maximum passengers per resource for per-resource pricing`,
        );
      if (
        option.availability?.capacityScope === "RESOURCE_POOL" &&
        option.availability.capacityUnit !== CapacityUnit.UNIT
      )
        errors.push(
          `options[${index}]: resource-pool capacity requires Resources / vehicles capacity unit`,
        );
      if (
        option.availability?.capacityScope === "SESSION_SHARED" &&
        option.availability.capacityUnit === CapacityUnit.UNIT
      )
        errors.push(
          `options[${index}]: resources / vehicles capacity must use resource-pool capacity`,
        );
      if (option.minPax && option.maxPax && option.maxPax < option.minPax)
        errors.push(
          `options[${index}]: maximum travellers must be at least the minimum`,
        );
      const validDays = new Set([
        "MON",
        "TUE",
        "WED",
        "THU",
        "FRI",
        "SAT",
        "SUN",
      ]);
      if (option.pricingDays?.some((day) => !validDays.has(day.toUpperCase())))
        errors.push(`options[${index}]: pricing days must be MON through SUN`);
      if (
        option.pricingDays &&
        new Set(normalizedDays(option.pricingDays)).size !==
          option.pricingDays.length
      )
        errors.push(
          `options[${index}]: pricing days cannot contain duplicates`,
        );
      if (
        option.pricingSlotCodes &&
        new Set(normalizedSlotCodes(option.pricingSlotCodes)).size !==
          option.pricingSlotCodes.length
      )
        errors.push(
          `options[${index}]: pricing slots cannot contain duplicates`,
        );
      if (
        option.confirmationSlaMinutes != null &&
        option.confirmationSlaMinutes < 1
      )
        errors.push(
          `options[${index}]: confirmation SLA must be at least one minute`,
        );
      if (
        option.bookingMode &&
        option.bookingMode !== BookingMode.INSTANT &&
        option.confirmationSlaMinutes == null
      )
        errors.push(
          `options[${index}]: add a confirmation SLA for non-instant booking`,
        );
      for (const rule of option.cancellationRules || []) {
        if (
          rule.maxDaysBefore != null &&
          rule.maxDaysBefore < rule.minDaysBefore
        )
          errors.push(
            `options[${index}]: cancellation rule maximum days must be at least the minimum`,
          );
        if (Number(rule.chargeValue) < 0)
          errors.push(
            `options[${index}]: cancellation charges cannot be negative`,
          );
      }
      for (const visitorPrice of option.visitorPrices || []) {
        if (
          !Number.isFinite(Number(visitorPrice.foreign)) ||
          !Number.isFinite(Number(visitorPrice.indian)) ||
          Number(visitorPrice.foreign) < 0 ||
          Number(visitorPrice.indian) < 0
        )
          errors.push(
            `options[${index}]: visitor prices must be valid non-negative amounts`,
          );
      }
      if (dto.hasDifferentialVisitorPricing) {
        const visitorPrices = option.visitorPrices || [];
        const adult = visitorPrices.find(
          (price) => price.travellerType === TravellerType.ADULT,
        );
        if (!adult || adult.indian === "" || adult.foreign === "")
          errors.push(
            `${optionNames.get(option.variantId) || `Option ${index + 1}`}: enter the foreign adult price or turn off visitor pricing (the Indian price comes from the option price)`,
          );
      }
      if (
        option.availability?.operatingModel &&
        ["FIXED_SLOT", "MULTIPLE_SLOTS"].includes(
          option.availability.operatingModel,
        ) &&
        !option.availability.slots?.length
      )
        errors.push(
          `options[${index}]: add at least one time slot for slot-based availability`,
        );
      if (
        option.availability?.effectiveTo &&
        option.availability.effectiveFrom &&
        new Date(option.availability.effectiveTo) <
          new Date(option.availability.effectiveFrom)
      )
        errors.push(
          `options[${index}]: availability end must be on or after availability start`,
        );
      if (
        option.availability?.updateCapacity &&
        option.availability.defaultCapacity == null
      )
        errors.push(
          `options[${index}]: enter a capacity before selecting Also update capacity`,
        );
    }
    if (!dto.options?.length)
      errors.push("Add pricing for at least one option.");
    return errors;
  }

  async previewActivityPricesAvailability(
    user: AuthUser,
    productId: string,
    dto: ActivityPricesAvailabilityDto,
  ) {
    const product = await this.product(user, productId);
    const variants = await this.prisma.productVariant.findMany({
      where: {
        productId,
        status: { not: VariantStatus.ARCHIVED },
        archivedAt: null,
      },
      select: { id: true, variantCode: true, name: true },
    });
    const errors = this.activityPriceInput(
      dto,
      new Map(variants.map((variant) => [variant.id, variant.name])),
    );
    const allowed = new Set(variants.map((variant) => variant.id));
    for (const option of dto.options || [])
      if (!allowed.has(option.variantId))
        errors.push(
          `Option ${option.variantId} does not belong to this product.`,
        );
    const ratePlanClient: any = (this.prisma as any).ratePlan;
    const existing: any[] =
      errors.length === 0 && ratePlanClient?.findMany
        ? await ratePlanClient
            .findMany({
              where: {
                variantId: { in: variants.map((variant) => variant.id) },
                status: "ACTIVE",
              },
              include: {
                cancellationRules: { orderBy: { minDaysBefore: "desc" } },
                commercialVersions: {
                  where: { status: { in: ["DRAFT", "ACTIVE"] } },
                  include: { travellerPrices: true },
                  orderBy: { effectiveFrom: "asc" },
                },
              },
              orderBy: { createdAt: "asc" },
            })
            .catch(() => [])
        : [];
    const existingVersions = existing.flatMap((plan: any) =>
      (plan.commercialVersions || []).map((version: any) => ({
        ...version,
        ratePlan: {
          variantId: plan.variantId,
          ratePlanCode: plan.ratePlanCode,
          name: plan.name,
          sourcePayload: plan.sourcePayload,
          cancellationRules: plan.cancellationRules || [],
        },
      })),
    );
    const affectedDates = (dto.options || []).reduce((total, option) => {
      const from = dateOnly(
        option.effectiveFrom || new Date().toISOString().slice(0, 10),
      );
      const to = dateOnly(
        option.effectiveTo ||
          new Date(Date.now() + 365 * 86400000).toISOString().slice(0, 10),
      );
      return total + dateRangeDays(from, to, option.pricingDays);
    }, 0);
    const previousRates = existingVersions.map((version: any) => ({
      variantId: version.ratePlan.variantId,
      ratePlanCode: version.ratePlan.ratePlanCode,
      ratePlanName: version.ratePlan.name,
      effectiveFrom: version.effectiveFrom,
      effectiveTo: version.effectiveTo,
      pricingUnit: version.pricingUnit,
      supplierBaseAmount: version.supplierBaseAmount,
      bookingMode: version.bookingMode,
      cancellationRules: version.ratePlan?.cancellationRules || [],
      travellerPrices: version.travellerPrices,
      visitorPrices: (version.sourcePayload as any)?.visitorPrices || [],
      pricingDays: (version.sourcePayload as any)?.pricingDays || [],
      pricingSlotCodes: (version.sourcePayload as any)?.pricingSlotCodes || [],
    }));
    const proposedRates = (dto.options || []).map((option) => ({
      variantId: option.variantId,
      effectiveFrom: option.effectiveFrom || null,
      effectiveTo: option.effectiveTo || null,
      pricingUnit: option.pricingUnit,
      supplierBaseAmount: option.supplierBaseAmount || null,
      bookingMode: option.bookingMode || BookingMode.INSTANT,
      cancellationRules: option.cancellationRules || [],
      travellerPrices: option.travellerPrices || [],
      visitorPrices: option.visitorPrices || [],
      pricingDays: normalizedDays(option.pricingDays),
      pricingSlotCodes: normalizedSlotCodes(option.pricingSlotCodes),
    }));
    const historyConflicts = (dto.options || []).flatMap((option) => {
      const from = dateOnly(
        option.effectiveFrom || new Date().toISOString().slice(0, 10),
      );
      const to = dateOnly(
        option.effectiveTo ||
          new Date(Date.now() + 365 * 86400000).toISOString().slice(0, 10),
      );
      return existingVersions
        .filter((version: any) => {
          const editorOwned =
            String(version.ratePlan.ratePlanCode || "").startsWith(
              "ACTIVITY-",
            ) ||
            (version.ratePlan.sourcePayload as any)
              ?.createdFromActivityEditor === true ||
            (version.sourcePayload as any)?.createdFromActivityEditor === true;
          return (
            editorOwned &&
            version.ratePlan.variantId === option.variantId &&
            dateRangesOverlap(
              from,
              to,
              new Date(version.effectiveFrom),
              version.effectiveTo
                ? new Date(version.effectiveTo)
                : new Date("9999-12-31"),
            )
          );
        })
        .map((version: any) => ({
          type: "EFFECTIVE_HISTORY_OVERLAP",
          variantId: option.variantId,
          existingVersionId: version.id,
          existingVersionNumber: version.versionNumber,
          existingEffectiveFrom: version.effectiveFrom,
          existingEffectiveTo: version.effectiveTo,
          resolution: "SPLIT_EXISTING_HISTORY",
          message: `This update overlaps existing editor pricing ${String(version.effectiveFrom).slice(0, 10)} to ${version.effectiveTo ? String(version.effectiveTo).slice(0, 10) : "open-ended"}; the save will split the surrounding history without changing protected contracts or booking snapshots.`,
        }));
    });
    const conflicts = [
      ...errors
        .filter((error) => /overlap|version|capacity/i.test(error))
        .map((message) => ({ type: "VALIDATION", message })),
      ...historyConflicts,
    ];
    return {
      productId: product.id,
      valid: errors.length === 0,
      errors,
      summary: {
        optionCount: dto.options?.length || 0,
        affectedDates,
        dateRange: dto.options?.[0]
          ? `${dto.options[0].effectiveFrom || "today"} to ${dto.options[0].effectiveTo || "one year"} (exclusive)`
          : null,
        availabilityCount: (dto.options || []).filter((option) =>
          Boolean(option.availability),
        ).length,
        existingRateCount: existingVersions.length,
      },
      previousRates,
      proposedRates,
      unchangedFields: [
        "special and contract rate plans",
        "confirmed booking snapshots",
      ],
      conflicts,
      inventoryWarnings: (dto.options || [])
        .filter((option) => option.availability?.updateCapacity)
        .map((option) => ({
          variantId: option.variantId,
          message:
            "Capacity is checked against held and confirmed inventory during save.",
        })),
      options: (dto.options || []).map((option) => ({
        variantId: option.variantId,
        pricingUnit: option.pricingUnit,
        travellerPrices: option.travellerPrices?.length || 0,
        visitorPrices: option.visitorPrices?.length || 0,
        hasAvailability: Boolean(option.availability),
        pricingDays: normalizedDays(option.pricingDays),
        pricingSlotCodes: normalizedSlotCodes(option.pricingSlotCodes),
        effectiveDateCount: dateRangeDays(
          dateOnly(
            option.effectiveFrom || new Date().toISOString().slice(0, 10),
          ),
          dateOnly(
            option.effectiveTo ||
              new Date(Date.now() + 365 * 86400000).toISOString().slice(0, 10),
          ),
          option.pricingDays,
        ),
      })),
    };
  }

  async activityPricesAvailability(user: AuthUser, productId: string) {
    await this.product(user, productId);
    const variants: any[] = await this.prisma.productVariant.findMany({
      where: {
        productId,
        status: { not: VariantStatus.ARCHIVED },
        archivedAt: null,
      },
      include: {
        ratePlans: {
          where: { status: "ACTIVE" },
          include: {
            commercialVersions: {
              where: { status: { in: ["DRAFT", "ACTIVE"] } },
              include: { travellerPrices: true },
              orderBy: { versionNumber: "desc" },
            },
            cancellationRules: { orderBy: { minDaysBefore: "desc" } },
            channelMappings: {
              where: { status: "ACTIVE" },
              select: { status: true, enabled: true },
            },
            scheduleMappings: {
              where: { active: true },
              include: {
                scheduleTemplate: {
                  include: {
                    slotTemplates: {
                      where: { archivedAt: null },
                      orderBy: { rank: "asc" },
                    },
                  },
                },
              },
            },
          },
          orderBy: { createdAt: "asc" },
        },
      },
      orderBy: { createdAt: "asc" },
    });
    return {
      productId,
      options: variants.map((variant) => ({
        variantId: variant.id,
        variantCode: variant.variantCode,
        name: variant.name,
        ratePlans: (() => {
          const editorPlan = variant.ratePlans.find(
            (candidate: any) =>
              candidate.ratePlanCode?.startsWith("ACTIVITY-") ||
              (candidate.sourcePayload as any)?.createdFromActivityEditor ===
                true,
          );
          const compatiblePlan =
            (editorPlan && !isProtectedLegacyRatePlan(editorPlan)) ||
            (!editorPlan &&
              variant.ratePlans.length === 1 &&
              !isProtectedLegacyRatePlan(variant.ratePlans[0]))
              ? editorPlan || variant.ratePlans[0]
              : null;
          const ordered = compatiblePlan
            ? [
                compatiblePlan,
                ...variant.ratePlans.filter(
                  (candidate: any) => candidate.id !== compatiblePlan.id,
                ),
              ]
            : variant.ratePlans;
          return ordered.map((plan: any) => ({
            id: plan.id,
            code: plan.ratePlanCode,
            name: plan.name,
            editable: plan.id === compatiblePlan?.id,
            advanced: plan.id !== compatiblePlan?.id,
            protected: isProtectedLegacyRatePlan(plan),
            cancellationRules: plan.cancellationRules,
            currency: plan.currency,
            pricingUnit: plan.unitType,
            validFrom: plan.validFrom,
            validTo: plan.validTo,
            versions: plan.commercialVersions.map((version: any) => ({
              id: version.id,
              versionNumber: version.versionNumber,
              status: version.status,
              effectiveFrom: version.effectiveFrom,
              effectiveTo: version.effectiveTo,
              currency: version.currency,
              pricingUnit: version.pricingUnit,
              supplierModel: version.supplierModel,
              supplierBaseAmount: version.supplierBaseAmount,
              bookingMode: version.bookingMode,
              sourcePayload: version.sourcePayload,
              minPax: plan.minPax,
              maxPax: plan.maxPax,
              cutOffMinutes: plan.cutOffMinutes,
              travellerPrices: version.travellerPrices,
            })),
            schedules: plan.scheduleMappings.map(
              (mapping: any) => mapping.scheduleTemplate,
            ),
          }));
        })(),
      })),
    };
  }

  /**
   * The simplified editor writes the same canonical records as the detailed
   * wizard. Its generated plan/schedule codes are deliberately namespaced so
   * vendor-created special contracts are never overwritten by a bulk save.
   */
  async applyActivityPricesAvailability(
    user: AuthUser,
    productId: string,
    dto: ActivityPricesAvailabilityDto,
    idempotencyKey?: string,
  ) {
    const product = await this.product(user, productId);
    const tenantId = product.tenantId;
    if (!idempotencyKey?.trim())
      throw new BadRequestException({
        code: "IDEMPOTENCY_KEY_REQUIRED",
        message:
          "Idempotency-Key is required for a prices and availability save.",
      });
    const validationVariants = await this.prisma.productVariant.findMany({
      where: {
        productId,
        status: { not: VariantStatus.ARCHIVED },
        archivedAt: null,
      },
      select: { id: true, name: true },
    });
    const errors = this.activityPriceInput(
      dto,
      new Map(validationVariants.map((variant) => [variant.id, variant.name])),
    );
    if (errors.length)
      throw new BadRequestException({
        code: "ACTIVITY_PRICES_INVALID",
        message: "Fix the highlighted prices and availability fields.",
        details: errors,
      });
    const key = idempotencyKey.trim();
    const payloadFingerprint = fingerprint(dto);
    const materializationRequests: Array<{
      scheduleId: string;
      dateFrom: Date;
      dateTo: Date;
      expectedVersion: number;
      status: ScheduleStatus;
    }> = [];
    let adminEditedRevisionId: string | null = null;
    const response = await this.prisma.$transaction(
      async (tx) => {
        const prior = await tx.activityPriceApplyRequest.findUnique({
          where: { tenantId_idempotencyKey: { tenantId, idempotencyKey: key } },
        });
        if (prior) {
          if (prior.payloadFingerprint !== payloadFingerprint)
            throw new ConflictException({
              code: "IDEMPOTENCY_KEY_REUSED",
              message:
                "Use a new Idempotency-Key when the prices or availability have changed.",
            });
          return (
            prior.responsePayload || {
              productId,
              saved: [],
              replayed: true,
              message: "The same save was already applied.",
            }
          );
        }
        const variants = await tx.productVariant.findMany({
          where: {
            productId,
            status: { not: VariantStatus.ARCHIVED },
            archivedAt: null,
          },
        });
        const byId = new Map(variants.map((variant) => [variant.id, variant]));
        if (dto.hasDifferentialVisitorPricing !== undefined) {
          const draftRevision = await tx.productRevision.findFirst({
            where: { productId, status: ProductRevisionStatus.DRAFT },
            orderBy: { versionNumber: "desc" },
          });
          if (draftRevision) {
            const sourcePayload = (draftRevision.sourcePayload || {}) as Record<
              string,
              unknown
            >;
            await tx.productRevision.update({
              where: { id: draftRevision.id },
              data: {
                sourcePayload: {
                  ...sourcePayload,
                  hasDifferentialVisitorPricing:
                    dto.hasDifferentialVisitorPricing,
                } as Prisma.InputJsonValue,
              },
            });
          }
        }
        const result: Array<{
          variantId: string;
          ratePlanId: string;
          commercialVersionId: string;
          scheduleId?: string;
          commercialVersionIds?: string[];
        }> = [];
        for (const option of dto.options) {
          const variant: any = byId.get(option.variantId);
          if (!variant)
            throw new NotFoundException(
              `Product option ${option.variantId} not found`,
            );
          const safeCode =
            variant.variantCode
              .replace(/[^A-Za-z0-9]+/g, "-")
              .replace(/^-|-$/g, "")
              .toUpperCase()
              .slice(0, 35) || variant.id.slice(0, 8).toUpperCase();
          let planCode = `ACTIVITY-${safeCode}`;
          const effectiveFrom = new Date(
            option.effectiveFrom || new Date().toISOString().slice(0, 10),
          );
          const effectiveTo = new Date(
            option.effectiveTo ||
              new Date(Date.now() + 365 * 86400000).toISOString().slice(0, 10),
          );
          const travellerPrices = option.travellerPrices || [];
          const baseAmount =
            option.supplierBaseAmount || travellerPrices[0]?.amount;
          const unitType =
            option.pricingUnit === PricingUnit.PER_PERSON
              ? "per_person"
              : option.pricingUnit === PricingUnit.PER_BOOKING
                ? "per_booking"
                : option.pricingUnit === PricingUnit.GROUP
                  ? "group"
                  : "per_unit";
          const travellerRules = travellerPrices.map((price) => ({
            type: price.travellerType,
            displayName:
              price.travellerType[0] +
              price.travellerType.slice(1).toLowerCase(),
            minCount: price.travellerType === TravellerType.ADULT ? 1 : 0,
            maxCount: 99,
          }));
          let plan: any = await tx.ratePlan.findFirst({
            where: { variantId: variant.id, ratePlanCode: planCode },
            include: {
              cancellationRules: true,
              commercialVersions: {
                where: { status: { in: ["DRAFT", "ACTIVE"] } },
                orderBy: { versionNumber: "desc" },
              },
            },
          });
          if (
            plan &&
            (plan.sourcePayload as any)?.createdFromActivityEditor !== true
          ) {
            planCode = `ACTIVITY-${safeCode}-EDITOR`;
            plan = await tx.ratePlan.findFirst({
              where: { variantId: variant.id, ratePlanCode: planCode },
              include: {
                cancellationRules: true,
                commercialVersions: {
                  where: { status: { in: ["DRAFT", "ACTIVE"] } },
                  orderBy: { versionNumber: "desc" },
                },
              },
            });
          }
          if (!plan) {
            const legacyCandidates: any[] = await tx.ratePlan.findMany({
              where: { variantId: variant.id, status: "ACTIVE" },
              include: {
                cancellationRules: true,
                commercialVersions: {
                  where: { status: { in: ["DRAFT", "ACTIVE"] } },
                  orderBy: { versionNumber: "desc" },
                },
                channelMappings: {
                  where: { status: "ACTIVE" },
                  select: { status: true, enabled: true },
                },
              },
              orderBy: { createdAt: "asc" },
            });
            if (legacyCandidates.length === 1) {
              if (isProtectedLegacyRatePlan(legacyCandidates[0]))
                throw new ConflictException({
                  code: "LEGACY_RATE_PLAN_REVIEW_REQUIRED",
                  message: `Option ${variant.name} has a protected or channel-mapped rate plan. Select its standard editable offer in advanced pricing before using the simplified editor.`,
                });
              plan = legacyCandidates[0];
            } else if (legacyCandidates.length > 1)
              throw new ConflictException({
                code: "MULTIPLE_LEGACY_RATE_PLANS",
                message: `Option ${variant.name} has multiple existing rate plans. Choose the standard offer in advanced pricing before using the simplified editor.`,
              });
          }
          const cancellationData = option.cancellationRules?.map((rule) => ({
            minDaysBefore: rule.minDaysBefore,
            maxDaysBefore: rule.maxDaysBefore,
            chargeValue: rule.chargeValue,
            chargeType: rule.chargeType,
          }));
          const previousCancellationRules = (plan?.cancellationRules || []).map(
            (rule: any) => ({
              minDaysBefore: rule.minDaysBefore,
              maxDaysBefore: rule.maxDaysBefore,
              chargeValue:
                rule.chargeValue?.toString?.() ?? String(rule.chargeValue),
              chargeType: rule.chargeType,
            }),
          );
          const planFrom =
            plan?.validFrom && plan.validFrom < effectiveFrom
              ? plan.validFrom
              : effectiveFrom;
          const planTo =
            !plan?.validTo || plan.validTo > effectiveTo
              ? plan?.validTo || effectiveTo
              : effectiveTo;
          // The Rates step is the final editor for these commercial limits. Keep the
          // variant defaults in sync so reopening Options cannot silently revert them.
          if (
            option.minPax !== undefined ||
            option.maxPax !== undefined ||
            option.cutOffMinutes !== undefined
          ) {
            await tx.productVariant.update({
              where: { id: variant.id },
              data: {
                ...(option.minPax !== undefined
                  ? { minPax: option.minPax }
                  : {}),
                ...(option.maxPax !== undefined
                  ? { maxPax: option.maxPax }
                  : {}),
                ...(option.cutOffMinutes !== undefined
                  ? { cutOffMinutes: option.cutOffMinutes }
                  : {}),
              },
            });
          }
          const planData: any = {
            validFrom: planFrom,
            validTo: planTo,
            currency:
              option.currency || plan?.currency || product.currency || "INR",
            unitType,
            basePrice: baseAmount || plan?.basePrice || 0,
            minPax: option.minPax ?? variant.minPax ?? plan?.minPax ?? 1,
            maxPax: option.maxPax ?? variant.maxPax ?? plan?.maxPax ?? 99,
            cutOffMinutes:
              option.cutOffMinutes ??
              variant.cutOffMinutes ??
              plan?.cutOffMinutes ??
              0,
            ...(option.bookingMode
              ? {
                  instantConfirmation:
                    option.bookingMode === BookingMode.INSTANT,
                }
              : {}),
            sourcePayload: {
              ...((plan?.sourcePayload as any) || {}),
              createdFromActivityEditor: true,
            },
          };
          if (!plan) {
            plan = await tx.ratePlan.create({
              data: {
                variant: { connect: { id: variant.id } },
                ratePlanCode: planCode,
                name: `Activity price · ${variant.name}`,
                status: "ACTIVE",
                ...planData,
                adultRequired: travellerPrices.some(
                  (price) => price.travellerType === TravellerType.ADULT,
                ),
                minAdultRequired: travellerPrices.some(
                  (price) => price.travellerType === TravellerType.ADULT,
                )
                  ? 1
                  : 0,
                travellerRules: travellerRules.length
                  ? { create: travellerRules }
                  : undefined,
                cancellationRules: cancellationData?.length
                  ? { create: cancellationData }
                  : undefined,
              } as any,
            });
            await this.audit.write(tx, {
              actor: user,
              tenantId,
              action: "RATEPLAN_CREATED_FROM_ACTIVITY_EDITOR",
              entityType: "RatePlan",
              entityId: plan.id,
              afterState: {
                ratePlanCode: plan.ratePlanCode,
                variantId: variant.id,
              },
            });
          } else {
            plan = await tx.ratePlan.update({
              where: { id: plan.id },
              data: planData,
            });
            await tx.travellerRule.deleteMany({
              where: { ratePlanId: plan.id },
            });
            if (travellerRules.length)
              await tx.travellerRule.createMany({
                data: travellerRules.map((rule) => ({
                  ...rule,
                  ratePlanId: plan.id,
                })),
              });
            if (cancellationData) {
              await tx.cancellationRule.deleteMany({
                where: { ratePlanId: plan.id },
              });
              if (cancellationData.length)
                await tx.cancellationRule.createMany({
                  data: cancellationData.map((rule) => ({
                    ...rule,
                    ratePlanId: plan.id,
                  })),
                });
            }
          }

          const editableVersions: any[] =
            await tx.ratePlanCommercialVersion.findMany({
              where: {
                ratePlanId: plan.id,
                status: { in: ["DRAFT", "ACTIVE"] },
              },
              include: { travellerPrices: true },
              orderBy: [{ effectiveFrom: "asc" }, { versionNumber: "asc" }],
            });
          const editorDrafts = editableVersions.filter(
            (version) => version.status === "DRAFT",
          );
          const editorHistory = editableVersions.filter(
            (version) =>
              (version.sourcePayload as any)?.createdFromActivityEditor ===
                true || plan.sourcePayload?.createdFromActivityEditor === true,
          );
          const knownVersions = (plan.commercialVersions || []) as any[];
          const latestKnownVersion = Math.max(
            0,
            ...knownVersions.map((version) =>
              Number(version.versionNumber || 0),
            ),
          );
          if (option.expectedVersion != null) {
            const latest = editorDrafts.reduce(
              (max, version) => Math.max(max, version.versionNumber),
              latestKnownVersion,
            );
            if (latest !== option.expectedVersion)
              throw new ConflictException({
                code: "ACTIVITY_PRICES_VERSION_CONFLICT",
                message:
                  "This option changed in another session. Reload the activity and retry.",
              });
          }
          const latestEditable = [...editableVersions].sort(
            (a, b) =>
              Number(b.versionNumber || 0) - Number(a.versionNumber || 0),
          )[0];
          const bookingRulesSnapshot =
            option.bookingMode !== undefined ||
            option.confirmationSlaMinutes !== undefined ||
            option.cancellationRules !== undefined
              ? {
                  bookingMode:
                    option.bookingMode ||
                    latestEditable?.bookingMode ||
                    BookingMode.INSTANT,
                  confirmationSlaMinutes:
                    option.confirmationSlaMinutes ??
                    latestEditable?.confirmationSlaMinutes ??
                    null,
                  cancellationRules: option.cancellationRules || [],
                }
              : undefined;
          const latestSourcePayload = {
            ...((latestEditable?.sourcePayload as any) || {}),
          };
          const candidateData = {
            effectiveFrom,
            effectiveTo,
            supplierModel:
              option.supplierModel ||
              latestEditable?.supplierModel ||
              SupplierCommercialModel.NET_RATE,
            currency:
              option.currency ||
              latestEditable?.currency ||
              plan.currency ||
              product.currency ||
              "INR",
            pricingUnit: option.pricingUnit,
            supplierBaseAmount:
              baseAmount ?? latestEditable?.supplierBaseAmount,
            supplierCommissionPercent:
              option.supplierCommissionPercent ??
              latestEditable?.supplierCommissionPercent,
            bookingMode:
              option.bookingMode ||
              latestEditable?.bookingMode ||
              BookingMode.INSTANT,
            confirmationSlaMinutes:
              option.confirmationSlaMinutes ??
              latestEditable?.confirmationSlaMinutes,
            sourcePayload: buildActivityEditorSourcePayload(
              latestSourcePayload,
              dto.hasDifferentialVisitorPricing,
              option,
              bookingRulesSnapshot,
            ),
          };
          const history: ActivityPriceHistoryRange<any>[] = editorHistory.map(
            (version) => ({
              effectiveFrom: version.effectiveFrom,
              effectiveTo: version.effectiveTo || effectiveTo,
              value: { kind: "existing", version },
            }),
          );
          const desired = splitActivityPriceHistory(history, {
            effectiveFrom,
            effectiveTo,
            value: { kind: "candidate", option, data: candidateData },
          });
          const used = new Set<string>();
          let latestNumber = Math.max(
            latestKnownVersion,
            ...editableVersions.map((version: any) =>
              Number(version.versionNumber || 0),
            ),
          );
          const versionIds: string[] = [];
          let candidateVersion: any;
          for (const range of desired) {
            const existing = editorDrafts.find(
              (version) =>
                !used.has(version.id) && sameActivityRange(version, range),
            );
            const value =
              range.value?.kind === "existing" ? range.value.version : null;
            const preservedRules =
              value &&
              value.status === "ACTIVE" &&
              previousCancellationRules.length &&
              !(value.sourcePayload as any)?.bookingRules
                ? {
                    bookingRules: {
                      cancellationRules: previousCancellationRules,
                    },
                  }
                : {};
            const data: any = value
              ? {
                  effectiveFrom: range.effectiveFrom,
                  effectiveTo: range.effectiveTo,
                  supplierModel: value.supplierModel,
                  currency: value.currency,
                  pricingUnit: value.pricingUnit,
                  supplierBaseAmount: value.supplierBaseAmount,
                  supplierCommissionPercent: value.supplierCommissionPercent,
                  bookingMode: value.bookingMode,
                  confirmationSlaMinutes: value.confirmationSlaMinutes,
                  sourcePayload: {
                    ...((value.sourcePayload as any) || {}),
                    ...preservedRules,
                  },
                }
              : {
                  ...candidateData,
                  effectiveFrom: range.effectiveFrom,
                  effectiveTo: range.effectiveTo,
                };
            let version: any;
            if (existing) {
              used.add(existing.id);
              await tx.ratePlanTravellerPrice.deleteMany({
                where: { commercialVersionId: existing.id },
              });
              version = await tx.ratePlanCommercialVersion.update({
                where: { id: existing.id },
                data: {
                  ...data,
                  status: "DRAFT",
                  travellerPrices: value
                    ? value.travellerPrices?.length
                      ? {
                          create: value.travellerPrices.map((price: any) => ({
                            travellerType: price.travellerType,
                            amount: price.amount,
                          })),
                        }
                      : undefined
                    : travellerPrices.length
                      ? {
                          create: travellerPrices.map((price) => ({
                            travellerType: price.travellerType,
                            amount: price.amount,
                          })),
                        }
                      : undefined,
                },
              });
            } else {
              latestNumber += 1;
              const prices = value?.travellerPrices || travellerPrices;
              version = await tx.ratePlanCommercialVersion.create({
                data: {
                  ratePlanId: plan.id,
                  versionNumber: latestNumber,
                  status: "DRAFT",
                  createdById: user.sub,
                  ...data,
                  travellerPrices: prices.length
                    ? {
                        create: prices.map((price: any) => ({
                          travellerType: price.travellerType,
                          amount: price.amount,
                        })),
                      }
                    : undefined,
                },
              });
            }
            versionIds.push(version.id);
            if (range.value?.kind === "candidate") candidateVersion = version;
          }
          for (const version of editorDrafts.filter(
            (item) => !used.has(item.id),
          ))
            await tx.ratePlanCommercialVersion.update({
              where: { id: version.id },
              data: { status: "RETIRED" },
            });
          const version =
            candidateVersion ||
            (await tx.ratePlanCommercialVersion.findFirstOrThrow({
              where: { id: versionIds[0] },
            }));
          await this.audit.write(tx, {
            actor: user,
            tenantId,
            action: "ACTIVITY_PRICES_AVAILABILITY_SAVED",
            entityType: "RatePlanCommercialVersion",
            entityId: version.id,
            afterState: {
              productId,
              variantId: variant.id,
              ratePlanId: plan.id,
              versionIds,
              effectiveFrom,
              effectiveTo,
            },
          });
          await this.outbox.enqueue(tx, {
            tenantId,
            eventType: "ACTIVITY_PRICES_AVAILABILITY_SAVED",
            aggregateType: "Product",
            aggregateId: productId,
            payload: {
              variantId: variant.id,
              ratePlanId: plan.id,
              commercialVersionId: version.id,
              versionIds,
            },
          });
          await this.outbox.enqueue(tx, {
            tenantId,
            eventType: "ACTIVITY_PRICES_PROJECTIONS_INVALIDATE",
            aggregateType: "Product",
            aggregateId: productId,
            payload: {
              variantId: variant.id,
              ratePlanId: plan.id,
              commercialVersionIds: versionIds,
              reason: "ACTIVITY_PRICES_AVAILABILITY_SAVED",
            },
          });
          let scheduleId: string | undefined;
          const availability: any = option.availability;
          if (availability) {
            const scheduleCode =
              availability.scheduleCode?.trim() || `ACTIVITY-${safeCode}`;
            const scheduleFrom = new Date(
              availability.effectiveFrom || effectiveFrom,
            );
            const scheduleTo = availability.effectiveTo
              ? new Date(availability.effectiveTo)
              : effectiveTo;
            let schedule: any = await tx.scheduleTemplate.findFirst({
              where: { variantId: variant.id, scheduleCode },
              include: { slotTemplates: { where: { archivedAt: null } } },
            });
            const capacityUnit =
              availability.capacityUnit || CapacityUnit.PERSON;
            const capacityScope =
              availability.capacityScope ||
              (capacityUnit === CapacityUnit.UNIT
                ? "RESOURCE_POOL"
                : "SESSION_SHARED");
            const capacitySourcePayload = {
              createdFromActivityEditor: true,
              capacityScope,
              capacitySemantics:
                capacityScope === "RESOURCE_POOL"
                  ? "Capacity is a resource/vehicle pool; passenger limits are enforced per resource."
                  : "One shared inventory pool per service session across traveller categories.",
            };
            if (!schedule)
              schedule = await tx.scheduleTemplate.create({
                data: {
                  variantId: variant.id,
                  scheduleCode,
                  name:
                    availability.name?.trim() || `${variant.name} availability`,
                  status: "DRAFT",
                  operatingModel:
                    availability.operatingModel ||
                    (availability.slots?.length
                      ? OperatingModel.MULTIPLE_SLOTS
                      : OperatingModel.DATE_CAPACITY),
                  timezone: availability.timezone || "Asia/Kolkata",
                  effectiveFrom: scheduleFrom,
                  effectiveTo: scheduleTo,
                  operatingDays: availability.operatingDays?.length
                    ? availability.operatingDays.map((day: string) =>
                        day.toUpperCase(),
                      )
                    : ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"],
                  capacityUnit,
                  defaultCapacity: availability.defaultCapacity,
                  sourcePayload: capacitySourcePayload,
                  slotTemplates: availability.slots?.length
                    ? {
                        create: availability.slots.map(
                          (slot: any, index: number) => ({
                            slotCode: slot.slotCode.trim(),
                            label: slot.label?.trim() || null,
                            startTime: slot.startTime,
                            endTime: slot.endTime || null,
                            rank: index,
                          }),
                        ),
                      }
                    : undefined,
                } as any,
              });
            else {
              const structuralChange =
                availability.effectiveFrom !== undefined ||
                availability.effectiveTo !== undefined ||
                availability.operatingModel !== undefined ||
                availability.timezone !== undefined ||
                availability.operatingDays !== undefined ||
                availability.capacityUnit !== undefined ||
                availability.updateCapacity ||
                (availability.slots?.length ?? 0) > 0;
              if (schedule.status === ScheduleStatus.ACTIVE && structuralChange)
                throw new ConflictException(
                  "This availability is active. Deactivate the schedule before changing its dates, slots, operating days or capacity.",
                );
              const scheduleData: any = {
                effectiveFrom: scheduleFrom,
                effectiveTo: scheduleTo,
                operatingModel:
                  availability.operatingModel || schedule.operatingModel,
                timezone: availability.timezone || schedule.timezone,
                operatingDays: availability.operatingDays?.length
                  ? availability.operatingDays.map((day: string) =>
                      day.toUpperCase(),
                    )
                  : schedule.operatingDays,
                capacityUnit,
                sourcePayload: {
                  ...((schedule.sourcePayload as any) || {}),
                  ...capacitySourcePayload,
                },
                ...(availability.updateCapacity
                  ? { defaultCapacity: availability.defaultCapacity }
                  : {}),
              };
              schedule = await tx.scheduleTemplate.update({
                where: { id: schedule.id },
                data: { ...scheduleData, version: { increment: 1 } },
              });
              if (availability.slots?.length && tx.scheduleSlotTemplate) {
                for (const [index, slot] of availability.slots.entries())
                  await tx.scheduleSlotTemplate.upsert({
                    where: {
                      scheduleTemplateId_slotCode: {
                        scheduleTemplateId: schedule.id,
                        slotCode: slot.slotCode.trim(),
                      },
                    },
                    update: {
                      label: slot.label?.trim() || null,
                      startTime: slot.startTime,
                      endTime: slot.endTime || null,
                      rank: index,
                      active: true,
                      archivedAt: null,
                    },
                    create: {
                      scheduleTemplateId: schedule.id,
                      slotCode: slot.slotCode.trim(),
                      label: slot.label?.trim() || null,
                      startTime: slot.startTime,
                      endTime: slot.endTime || null,
                      rank: index,
                    },
                  });
              }
            }
            await tx.ratePlanSchedule.upsert({
              where: {
                ratePlanId_scheduleTemplateId: {
                  ratePlanId: plan.id,
                  scheduleTemplateId: schedule.id,
                },
              },
              update: { active: true },
              create: {
                ratePlanId: plan.id,
                scheduleTemplateId: schedule.id,
                active: true,
              },
            });
            if (Array.isArray(option.availabilityBlackouts)) {
              const blackoutDates = new Set(
                option.availabilityBlackouts.map((value: string) =>
                  value.slice(0, 10),
                ),
              );
              const existingBlackouts: any[] =
                await tx.scheduleException.findMany({
                  where: {
                    scheduleTemplateId: schedule.id,
                    slotTemplateId: null,
                    type: "BLACKOUT",
                    archivedAt: null,
                    serviceDate: { gte: scheduleFrom, lt: scheduleTo },
                  },
                });
              for (const existing of existingBlackouts)
                if (
                  !blackoutDates.has(
                    existing.serviceDate.toISOString().slice(0, 10),
                  )
                )
                  await tx.scheduleException.update({
                    where: { id: existing.id },
                    data: { archivedAt: new Date() },
                  });
              for (const serviceDate of blackoutDates) {
                const date = dateOnly(serviceDate);
                if (date < scheduleFrom || date >= scheduleTo) continue;
                const exceptionKey = `${schedule.id}:${serviceDate}:ALL`;
                await tx.scheduleException.upsert({
                  where: { exceptionKey },
                  update: {
                    type: "BLACKOUT",
                    reason: "Configured in the activity builder",
                    archivedAt: null,
                  },
                  create: {
                    scheduleTemplateId: schedule.id,
                    serviceDate: date,
                    slotTemplateId: null,
                    type: "BLACKOUT",
                    reason: "Configured in the activity builder",
                    exceptionKey,
                  },
                });
              }
            }
            if (availability.updateCapacity && tx.serviceSession?.findMany) {
              const sessions: any[] = await tx.serviceSession.findMany({
                where: {
                  scheduleTemplateId: schedule.id,
                  serviceDate: { gte: scheduleFrom, lt: scheduleTo },
                  archivedAt: null,
                },
                include: { inventoryState: true, slotTemplate: true },
              });
              const allowedSlots = new Set(
                (availability.slotCodes || []).map((slot: string) =>
                  slot.trim(),
                ),
              );
              for (const session of sessions) {
                if (
                  allowedSlots.size &&
                  (!session.slotTemplate ||
                    !allowedSlots.has(session.slotTemplate.slotCode))
                )
                  continue;
                const state = session.inventoryState;
                const total = Number(availability.defaultCapacity);
                if (
                  state &&
                  total <
                    Number(state.blockedCapacity) +
                      Number(state.heldCapacity) +
                      Number(state.confirmedCapacity)
                )
                  throw new ConflictException({
                    code: "CAPACITY_BELOW_COMMITTED",
                    message: `Capacity cannot be reduced below committed inventory for session ${session.id}.`,
                  });
                if (state)
                  await tx.inventoryState.update({
                    where: { id: state.id },
                    data: { totalCapacity: total, version: { increment: 1 } },
                  });
                else
                  await tx.inventoryState.create({
                    data: {
                      sessionId: session.id,
                      totalCapacity: total,
                      sourcePayload: { createdFromActivityEditor: true },
                    },
                  });
              }
            }
            scheduleId = schedule.id;
            materializationRequests.push({
              scheduleId: schedule.id,
              dateFrom: scheduleFrom,
              dateTo: scheduleTo,
              expectedVersion: schedule.version,
              status: schedule.status,
            });
          }
          result.push({
            variantId: variant.id,
            ratePlanId: plan.id,
            commercialVersionId: version.id,
            commercialVersionIds: versionIds,
            ...(scheduleId ? { scheduleId } : {}),
          });
        }
        const response: any = {
          productId,
          saved: result,
          replayed: false,
          materialization: materializationRequests.map((request) => ({
            scheduleId: request.scheduleId,
            dateFrom: request.dateFrom.toISOString().slice(0, 10),
            dateTo: request.dateTo.toISOString().slice(0, 10),
          })),
          materializationStatus: materializationRequests.length
            ? "PENDING"
            : "NOT_REQUIRED",
          message:
            "Prices and availability saved as draft records. Review commercial readiness before submitting.",
        };
        const draftRevision = await tx.productRevision.findFirst({
          where: { productId, status: ProductRevisionStatus.DRAFT },
          orderBy: { versionNumber: "desc" },
          select: { id: true },
        });
        if (draftRevision) {
          await this.tagAdminRevisionEdit(tx, draftRevision.id, user, [
            "rates",
            "availability",
          ]);
          if (this.isAdminActor(user)) adminEditedRevisionId = draftRevision.id;
        }
        await tx.activityPriceApplyRequest.create({
          data: {
            tenantId,
            productId,
            idempotencyKey: key,
            payloadFingerprint,
            responsePayload: response,
            createdById: user.sub,
          },
        });
        return response;
      },
      { timeout: 30000, maxWait: 30000 },
    );
    if (adminEditedRevisionId)
      await this.notifyAdminRevisionEdited(adminEditedRevisionId, user);
    const savedPayload: any = response || {};
    const pendingMaterialization =
      savedPayload.materializationStatus === "MATERIALIZED"
        ? []
        : savedPayload.materialization ||
          materializationRequests.map((request) => ({
            scheduleId: request.scheduleId,
            dateFrom: request.dateFrom.toISOString().slice(0, 10),
            dateTo: request.dateTo.toISOString().slice(0, 10),
          }));
    const materialized: Array<{ scheduleId: string; sessions: number }> = [];
    if (this.schedules && this.materializer && pendingMaterialization.length) {
      try {
        for (const request of pendingMaterialization) {
          const current = await (
            this.prisma as any
          ).scheduleTemplate.findUnique({
            where: { id: request.scheduleId },
            select: { version: true, status: true },
          });
          if (!current)
            throw new NotFoundException(
              `Schedule ${request.scheduleId} not found while preparing availability.`,
            );
          let scheduleVersion = Number(current.version);
          if (current.status !== ScheduleStatus.ACTIVE) {
            const activated = await this.schedules.activate(
              user,
              request.scheduleId,
              scheduleVersion,
            );
            scheduleVersion = activated.version;
          }
          const materializedResult = await this.materializer.materialize(
            request.scheduleId,
            {
              dateFrom: request.dateFrom,
              dateTo: request.dateTo,
              expectedVersion: scheduleVersion,
            },
          );
          materialized.push({
            scheduleId: request.scheduleId,
            sessions: materializedResult.sessions,
          });
        }
        const completedPayload = {
          ...savedPayload,
          materializationStatus: "MATERIALIZED",
          materialized,
          materializationError: null,
        };
        if ((this.prisma as any).activityPriceApplyRequest?.update)
          await (this.prisma as any).activityPriceApplyRequest.update({
            where: {
              tenantId_idempotencyKey: { tenantId, idempotencyKey: key },
            },
            data: { responsePayload: completedPayload },
          });
        return completedPayload;
      } catch (error: any) {
        const pendingPayload = {
          ...savedPayload,
          materializationStatus: "PENDING",
          materializationError:
            error?.message ||
            "Availability sessions could not be prepared yet.",
        };
        if ((this.prisma as any).activityPriceApplyRequest?.update)
          await (this.prisma as any).activityPriceApplyRequest.update({
            where: {
              tenantId_idempotencyKey: { tenantId, idempotencyKey: key },
            },
            data: { responsePayload: pendingPayload },
          });
        throw new ConflictException({
          code: "ACTIVITY_MATERIALIZATION_PENDING",
          message:
            "Prices were saved, but availability sessions are still being prepared. Retry the same request to resume safely.",
          details: {
            scheduleIds: pendingMaterialization.map(
              (item: any) => item.scheduleId,
            ),
            cause: pendingPayload.materializationError,
          },
        });
      }
    }
    return {
      ...savedPayload,
      ...(materialized.length ? { materialized } : {}),
    };
  }

  async getVariantBlueprint(user: AuthUser, id: string) {
    const tenantId = await this.tenantForVariant(user, id);
    const variant = await this.prisma.productVariant.findFirst({
      where: { id, product: { tenantId } },
      include: {
        ticketTypes: { orderBy: { rank: "asc" } },
        unitRows: { orderBy: { rank: "asc" } },
      },
    });
    if (!variant) throw new NotFoundException("Product variant not found");
    return { ticketTypes: variant.ticketTypes, unitRows: variant.unitRows };
  }

  async replaceVariantBlueprint(
    user: AuthUser,
    id: string,
    input: Record<string, unknown>,
  ) {
    const tenantId = await this.tenantForVariant(user, id);
    const variant = await this.prisma.productVariant.findFirst({
      where: { id, product: { tenantId } },
      select: { id: true, productId: true, revisionId: true, status: true },
    });
    if (!variant) throw new NotFoundException("Product variant not found");
    if (variant.status === VariantStatus.ARCHIVED)
      throw new ConflictException("Archived options cannot be edited");
    const ticketTypes = Array.isArray(input.ticketTypes)
      ? input.ticketTypes
      : [];
    const unitRows = Array.isArray(input.unitRows) ? input.unitRows : [];
    const integer = (value: unknown, fallback: number | null = null) =>
      value === "" || value == null ? fallback : Number(value);
    const normalizedTickets = ticketTypes.map((value, index) => {
      const item = value as Record<string, unknown>;
      const name = String(item.name || "").trim();
      if (!name)
        throw new BadRequestException(`Ticket type ${index + 1} needs a name.`);
      const ageFrom = integer(item.ageFrom);
      const ageTo = integer(item.ageTo);
      if (
        (ageFrom !== null && (!Number.isInteger(ageFrom) || ageFrom < 0)) ||
        (ageTo !== null && (!Number.isInteger(ageTo) || ageTo < 0)) ||
        (ageFrom !== null && ageTo !== null && ageTo < ageFrom)
      )
        throw new BadRequestException(
          `Ticket type ${index + 1} has an invalid age range.`,
        );
      return {
        name,
        ageFrom,
        ageTo,
        needsAdult: item.needsAdult === true,
        countsCapacity: item.countsCapacity !== false,
        rank: index,
      };
    });
    const normalizedUnits = unitRows.map((value, index) => {
      const item = value as Record<string, unknown>;
      const name = String(item.name || "").trim();
      const minPax = integer(item.minPax, 1);
      const maxPax = integer(item.maxPax, 1);
      const paxIncluded = integer(item.paxIncluded, 1);
      const unitsPerSlot = integer(item.unitsPerSlot, 1);
      const extraPerPerson =
        item.extraPerPerson === "" || item.extraPerPerson == null
          ? null
          : Number(item.extraPerPerson);
      if (
        !name ||
        ![minPax, maxPax, paxIncluded, unitsPerSlot].every(
          (number) => Number.isInteger(number) && number! > 0,
        ) ||
        maxPax! < minPax! ||
        (extraPerPerson !== null &&
          (!Number.isFinite(extraPerPerson) || extraPerPerson < 0))
      )
        throw new BadRequestException(
          `Unit ${index + 1} has invalid capacity values.`,
        );
      return {
        name,
        minPax: minPax!,
        maxPax: maxPax!,
        paxIncluded: paxIncluded!,
        unitsPerSlot: unitsPerSlot!,
        extraPerPerson,
        rank: index,
      };
    });
    await this.prisma.$transaction(async (tx) => {
      if (variant.revisionId) {
        await tx.$queryRaw(
          Prisma.sql`SELECT "id" FROM "public"."ProductRevision" WHERE "id" = ${variant.revisionId} FOR UPDATE`,
        );
        const revision = await tx.productRevision.findUniqueOrThrow({
          where: { id: variant.revisionId },
        });
        this.assertMutableRevision(revision);
      }
      await tx.productVariantTicketType.deleteMany({
        where: { variantId: id },
      });
      await tx.productVariantUnit.deleteMany({ where: { variantId: id } });
      if (normalizedTickets.length)
        await tx.productVariantTicketType.createMany({
          data: normalizedTickets.map((item) => ({ ...item, variantId: id })),
        });
      if (normalizedUnits.length)
        await tx.productVariantUnit.createMany({
          data: normalizedUnits.map((item) => ({ ...item, variantId: id })),
        });
      await this.audit.write(tx, {
        actor: user,
        tenantId,
        action: "PRODUCT_VARIANT_BLUEPRINT_REPLACED",
        entityType: "ProductVariant",
        entityId: id,
        metadata: {
          productId: variant.productId,
          revisionId: variant.revisionId,
          ticketTypeCount: normalizedTickets.length,
          unitCount: normalizedUnits.length,
        },
      });
      await this.outbox.enqueue(tx, {
        tenantId,
        eventType: "PRODUCT_VARIANT_BLUEPRINT_REPLACED",
        aggregateType: "ProductVariant",
        aggregateId: id,
        payload: {
          productId: variant.productId,
          revisionId: variant.revisionId,
          ticketTypeCount: normalizedTickets.length,
          unitCount: normalizedUnits.length,
        },
      });
      if (variant.revisionId)
        await this.tagAdminRevisionEdit(tx, variant.revisionId, user, [
          `options.${id}.ticketTypes`,
          `options.${id}.units`,
        ]);
    });
    if (variant.revisionId)
      await this.notifyAdminRevisionEdited(variant.revisionId, user);
    return this.getVariantBlueprint(user, id);
  }

  async createVariant(user: AuthUser, productId: string, dto: VariantDto) {
    const product = await this.product(user, productId);
    const { sourcePayload, ...rest } = dto;
    try {
      const created = await this.prisma.$transaction(async (tx) => {
        const revision = await tx.productRevision.findFirst({
          where: { productId, status: ProductRevisionStatus.DRAFT },
          orderBy: { versionNumber: "desc" },
        });
        if (!revision)
          throw new ConflictException(
            "Start a draft revision before adding options",
          );
        await tx.$queryRaw(
          Prisma.sql`SELECT "id" FROM "public"."ProductRevision" WHERE "id" = ${revision.id} FOR UPDATE`,
        );
        const lockedRevision = await tx.productRevision.findUniqueOrThrow({
          where: { id: revision.id },
        });
        this.assertMutableRevision(lockedRevision);
        const created = await tx.productVariant.create({
          data: {
            productId,
            revisionId: revision.id,
            ...rest,
            ...(sourcePayload
              ? { sourcePayload: sourcePayload as Prisma.InputJsonValue }
              : {}),
          },
        });
        await this.audit.write(tx, {
          actor: user,
          tenantId: product.tenantId,
          action: "PRODUCT_VARIANT_CREATED",
          entityType: "ProductVariant",
          entityId: created.id,
          afterState: {
            variantCode: created.variantCode,
            status: created.status,
            revisionId: revision.id,
          },
        });
        await this.outbox.enqueue(tx, {
          tenantId: product.tenantId,
          eventType: "PRODUCT_VARIANT_CREATED",
          aggregateType: "ProductVariant",
          aggregateId: created.id,
          payload: {
            productId,
            variantCode: created.variantCode,
            revisionId: revision.id,
          },
        });
        await this.tagAdminRevisionEdit(tx, revision.id, user, [`options.${created.variantCode}`]);
        return created;
      });
      if (created.revisionId) await this.notifyAdminRevisionEdited(created.revisionId, user);
      return created;
    } catch (error: any) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      )
        throw new ConflictException(
          "A variant with this variantCode already exists for the product revision",
        );
      throw error;
    }
  }
  async updateVariant(user: AuthUser, id: string, dto: UpdateVariantDto) {
    const tenantId = await this.tenantForVariant(user, id);
    const existing = await this.prisma.productVariant.findFirst({
      where: { id, product: { tenantId } },
    });
    if (!existing) throw new NotFoundException("Product variant not found");
    if (!Number.isInteger(dto.expectedVersion) || dto.expectedVersion < 1)
      throw new BadRequestException("expectedVersion is required");
    const attempted = dto as UpdateVariantDto & {
      variantCode?: string;
      status?: VariantStatus;
      archivedAt?: Date;
    };
    if (
      attempted.variantCode !== undefined ||
      attempted.status !== undefined ||
      attempted.archivedAt !== undefined
    )
      throw new ConflictException(
        "Variant code and lifecycle status are immutable; use archive",
      );
    const { expectedVersion: _expectedVersion, sourcePayload, ...rest } = dto;
    const updatedResult = await this.prisma.$transaction(async (tx) => {
      if (existing.revisionId) {
        await tx.$queryRaw(
          Prisma.sql`SELECT "id" FROM "public"."ProductRevision" WHERE "id" = ${existing.revisionId} FOR UPDATE`,
        );
        const revision = await tx.productRevision.findUniqueOrThrow({
          where: { id: existing.revisionId },
        });
        this.assertMutableRevision(revision);
      }
      const changed = await tx.productVariant.updateMany({
        where: {
          id,
          version: dto.expectedVersion,
          status: { not: VariantStatus.ARCHIVED },
          archivedAt: null,
        },
        data: {
          ...rest,
          version: { increment: 1 },
          ...(sourcePayload !== undefined
            ? { sourcePayload: sourcePayload as Prisma.InputJsonValue }
            : {}),
        },
      });
      if (changed.count !== 1)
        throw new ConflictException(
          "Variant changed in another session; reload and retry",
        );
      const updated = await tx.productVariant.findUniqueOrThrow({
        where: { id },
      });
      await this.audit.write(tx, {
        actor: user,
        tenantId,
        action: "PRODUCT_VARIANT_UPDATED",
        entityType: "ProductVariant",
        entityId: id,
        beforeState: {
          name: existing.name,
          version: existing.version,
          status: existing.status,
        },
        afterState: {
          name: updated.name,
          version: updated.version,
          status: updated.status,
        },
      });
      await this.outbox.enqueue(tx, {
        tenantId,
        eventType: "PRODUCT_VARIANT_UPDATED",
        aggregateType: "ProductVariant",
        aggregateId: id,
        payload: { productId: existing.productId, version: updated.version },
      });
      if (existing.revisionId)
        await this.tagAdminRevisionEdit(tx, existing.revisionId, user, [`options.${updated.variantCode || id}`]);
      return updated;
    });
    if (existing.revisionId) await this.notifyAdminRevisionEdited(existing.revisionId, user);
    return updatedResult;
  }
  async archiveVariant(user: AuthUser, id: string, dto: ArchiveVariantDto) {
    const tenantId = await this.tenantForVariant(user, id);
    const existing = await this.prisma.productVariant.findFirst({
      where: { id, product: { tenantId } },
    });
    if (!existing) throw new NotFoundException("Product variant not found");
    if (!Number.isInteger(dto.expectedVersion) || dto.expectedVersion < 1)
      throw new BadRequestException("expectedVersion is required");
    const archivedResult = await this.prisma.$transaction(async (tx) => {
      if (existing.revisionId) {
        await tx.$queryRaw(
          Prisma.sql`SELECT "id" FROM "public"."ProductRevision" WHERE "id" = ${existing.revisionId} FOR UPDATE`,
        );
        const revision = await tx.productRevision.findUniqueOrThrow({
          where: { id: existing.revisionId },
        });
        this.assertMutableRevision(revision);
      }
      const changed = await tx.productVariant.updateMany({
        where: {
          id,
          version: dto.expectedVersion,
          status: { not: VariantStatus.ARCHIVED },
          archivedAt: null,
        },
        data: {
          status: VariantStatus.ARCHIVED,
          archivedAt: new Date(),
          version: { increment: 1 },
        },
      });
      if (changed.count !== 1)
        throw new ConflictException(
          "Variant changed in another session; reload and retry",
        );
      const updated = await tx.productVariant.findUniqueOrThrow({
        where: { id },
      });
      await this.audit.write(tx, {
        actor: user,
        tenantId,
        action: "PRODUCT_VARIANT_ARCHIVED",
        entityType: "ProductVariant",
        entityId: id,
        beforeState: {
          status: existing.status,
          version: existing.version,
          archivedAt: existing.archivedAt,
        },
        afterState: {
          status: updated.status,
          version: updated.version,
          archivedAt: updated.archivedAt,
        },
      });
      await this.outbox.enqueue(tx, {
        tenantId,
        eventType: "PRODUCT_VARIANT_ARCHIVED",
        aggregateType: "ProductVariant",
        aggregateId: id,
        payload: { productId: existing.productId, version: updated.version },
      });
      if (existing.revisionId)
        await this.tagAdminRevisionEdit(tx, existing.revisionId, user, [`options.${id}.archivedAt`]);
      return updated;
    });
    if (existing.revisionId) await this.notifyAdminRevisionEdited(existing.revisionId, user);
    return archivedResult;
  }
  async addMedia(user: AuthUser, revisionId: string, dto: ProductMediaDto) {
    const tenantId = await this.tenantForRevision(user, revisionId);
    const revision = await this.prisma.productRevision.findFirst({
      where: { id: revisionId, product: { tenantId } },
    });
    if (!revision) throw new NotFoundException("Product revision not found");
    this.assertMutableRevision(revision);
    if (
      (dto.fileAssetId && dto.externalUrl) ||
      (!dto.fileAssetId && !dto.externalUrl)
    )
      throw new ConflictException(
        "Provide exactly one of fileAssetId or externalUrl",
      );
    if (dto.externalUrl && dto.kind === "IMAGE")
      throw new ConflictException(
        "External image URLs cannot be quality-checked; upload a validated image asset instead",
      );
    if (dto.fileAssetId) {
      const asset = await this.prisma.fileAsset.findFirst({
        where: {
          id: dto.fileAssetId,
          tenantId,
          purpose: FilePurpose.PRODUCT_MEDIA,
          visibility: FileVisibility.PUBLIC,
        },
      });
      if (!asset) throw new NotFoundException("Product media file not found");
    }
    const media = await this.prisma.$transaction(async (tx) => {
      const current = await tx.productRevision.findFirst({
        where: { id: revisionId, productId: revision.productId },
      });
      if (!current) throw new NotFoundException("Product revision not found");
      this.assertMutableRevision(current);
      const nextRank =
        dto.rank ??
        ((
          await tx.productMedia.aggregate({
            where: { revisionId, archivedAt: null },
            _max: { rank: true },
          })
        )._max.rank || 0) + 1;
      const media = await tx.productMedia.create({
        data: { revisionId, ...dto, rank: nextRank },
      });
      await this.audit.write(tx, {
        actor: user,
        tenantId,
        action: "PRODUCT_MEDIA_ADDED",
        entityType: "ProductMedia",
        entityId: media.id,
        afterState: {
          productId: revision.productId,
          revisionId,
          mediaId: media.id,
          kind: media.kind,
        },
      });
      await this.tagAdminRevisionEdit(tx, revisionId, user, [`photos.${media.id}`]);
      return media;
    });
    await this.notifyAdminRevisionEdited(revisionId, user);
    return media;
  }
  async uploadMedia(
    user: AuthUser,
    revisionId: string,
    file: any,
    dto: ProductMediaUploadDto,
  ) {
    const tenantId = await this.tenantForRevision(user, revisionId);
    if (!file?.buffer?.length)
      throw new ConflictException("An image file is required");
    if (file.size > 10 * 1024 * 1024)
      throw new ConflictException("Product images must be 10 MB or smaller");
    if (dto.kind !== "IMAGE")
      throw new ConflictException(
        "Only image uploads are supported; add video as an external URL",
      );
    const detected =
      file.buffer[0] === 0xff &&
      file.buffer[1] === 0xd8 &&
      file.buffer[2] === 0xff
        ? { mimeType: "image/jpeg", extension: ".jpg" }
        : file.buffer
              .subarray(0, 8)
              .equals(
                Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
              )
          ? { mimeType: "image/png", extension: ".png" }
          : file.buffer.subarray(0, 4).toString() === "RIFF" &&
              file.buffer.subarray(8, 12).toString() === "WEBP"
            ? { mimeType: "image/webp", extension: ".webp" }
            : null;
    if (!detected)
      throw new ConflictException(
        "Unsupported or invalid image signature; JPEG, PNG, or WebP required",
      );
    const revision = await this.prisma.productRevision.findFirst({
      where: { id: revisionId, product: { tenantId } },
    });
    if (!revision) throw new NotFoundException("Product revision not found");
    this.assertMutableRevision(revision);
    const saved = await this.storage.save(
      file.buffer,
      FilePurpose.PRODUCT_MEDIA,
      detected.extension,
    );
    try {
      const media = await this.prisma.$transaction(async (tx) => {
        const current = await tx.productRevision.findFirst({
          where: { id: revisionId, productId: revision.productId },
        });
        if (!current) throw new NotFoundException("Product revision not found");
        this.assertMutableRevision(current);
        const asset = await tx.fileAsset.create({
          data: {
            tenantId,
            storageKey: saved.storageKey,
            originalName:
              file.originalname || `product-media${detected.extension}`,
            mimeType: detected.mimeType,
            sizeBytes: saved.sizeBytes,
            visibility: FileVisibility.PUBLIC,
            purpose: FilePurpose.PRODUCT_MEDIA,
            entityType: "ProductRevision",
            entityId: revisionId,
            createdById: user.sub,
          },
        });
        const nextRank =
          dto.rank ??
          ((
            await tx.productMedia.aggregate({
              where: { revisionId, archivedAt: null },
              _max: { rank: true },
            })
          )._max.rank || 0) + 1;
        const media = await tx.productMedia.create({
          data: {
            revisionId,
            kind: dto.kind,
            fileAssetId: asset.id,
            description: dto.description,
            seoTitle: dto.seoTitle,
            seoDescription: dto.seoDescription,
            rank: nextRank,
          },
        });
        await this.audit.write(tx, {
          actor: user,
          tenantId,
          action: "PRODUCT_MEDIA_UPLOADED",
          entityType: "ProductMedia",
          entityId: media.id,
          afterState: {
            productId: revision.productId,
            revisionId,
            mediaId: media.id,
            kind: media.kind,
          },
        });
        await this.tagAdminRevisionEdit(tx, revisionId, user, [`photos.${media.id}`]);
        return media;
      });
      await this.notifyAdminRevisionEdited(revisionId, user);
      return media;
    } catch (error) {
      await this.storage.remove(saved.storageKey);
      throw error;
    }
  }
  async uploadRateProof(user: AuthUser, revisionId: string, file: any) {
    const tenantId = await this.tenantForRevision(user, revisionId);
    if (!file?.buffer?.length)
      throw new ConflictException("A rate proof file is required");
    if (file.size > 10 * 1024 * 1024)
      throw new ConflictException("Rate proof files must be 10 MB or smaller");
    const header = file.buffer.subarray(0, 8);
    const detected =
      header.subarray(0, 4).toString() === "%PDF"
        ? { mimeType: "application/pdf", extension: ".pdf" }
        : header[0] === 0xff && header[1] === 0xd8 && header[2] === 0xff
          ? { mimeType: "image/jpeg", extension: ".jpg" }
          : header.equals(
                Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
              )
            ? { mimeType: "image/png", extension: ".png" }
            : file.buffer.subarray(0, 4).toString() === "RIFF" &&
                file.buffer.subarray(8, 12).toString() === "WEBP"
              ? { mimeType: "image/webp", extension: ".webp" }
              : null;
    if (!detected)
      throw new ConflictException(
        "Unsupported rate proof; upload PDF, JPEG, PNG, or WebP",
      );
    const revision = await this.prisma.productRevision.findFirst({
      where: { id: revisionId, product: { tenantId } },
      select: { id: true, productId: true, status: true },
    });
    if (!revision) throw new NotFoundException("Product revision not found");
    this.assertMutableRevision(revision);
    const saved = await this.storage.save(
      file.buffer,
      FilePurpose.OTHER,
      detected.extension,
    );
    try {
      const asset = await this.prisma.fileAsset.create({
        data: {
          tenantId,
          storageKey: saved.storageKey,
          originalName: file.originalname || `rate-proof${detected.extension}`,
          mimeType: detected.mimeType,
          sizeBytes: saved.sizeBytes,
          visibility: FileVisibility.PRIVATE,
          purpose: FilePurpose.OTHER,
          entityType: "ProductRateProof",
          entityId: revision.id,
          createdById: user.sub,
        },
      });
      return {
        fileAssetId: asset.id,
        originalName: asset.originalName,
        mimeType: asset.mimeType,
      };
    } catch (error) {
      await this.storage.remove(saved.storageKey);
      throw error;
    }
  }
  async archiveMedia(user: AuthUser, revisionId: string, mediaId: string) {
    const tenantId = await this.tenantForRevision(user, revisionId);
    const revision = await this.prisma.productRevision.findFirst({
      where: { id: revisionId, product: { tenantId } },
    });
    if (!revision) throw new NotFoundException("Product revision not found");
    this.assertMutableRevision(revision);
    const updated = await this.prisma.$transaction(async (tx) => {
      const current = await tx.productRevision.findFirst({
        where: { id: revisionId, productId: revision.productId },
      });
      if (!current) throw new NotFoundException("Product revision not found");
      this.assertMutableRevision(current);
      const media = await tx.productMedia.findFirst({
        where: { id: mediaId, revisionId },
      });
      if (!media) throw new NotFoundException("Media not found");
      const updated = await tx.productMedia.update({
        where: { id: mediaId },
        data: { archivedAt: new Date() },
      });
      await this.audit.write(tx, {
        actor: user,
        tenantId,
        action: "PRODUCT_MEDIA_ARCHIVED",
        entityType: "ProductMedia",
        entityId: mediaId,
        beforeState: {
          productId: revision.productId,
          revisionId,
          mediaId,
          kind: media.kind,
        },
        afterState: {
          productId: revision.productId,
          revisionId,
          mediaId,
          kind: media.kind,
          archivedAt: updated.archivedAt,
        },
      });
      await this.tagAdminRevisionEdit(tx, revisionId, user, [`photos.${mediaId}.archivedAt`]);
      return updated;
    });
    await this.notifyAdminRevisionEdited(revisionId, user);
    return updated;
  }
  async rankMedia(
    user: AuthUser,
    revisionId: string,
    mediaId: string,
    dto: UpdateProductMediaRankDto,
  ) {
    const tenantId = await this.tenantForRevision(user, revisionId);
    const revision = await this.prisma.productRevision.findFirst({
      where: { id: revisionId, product: { tenantId } },
    });
    if (!revision) throw new NotFoundException("Product revision not found");
    this.assertMutableRevision(revision);
    const updated = await this.prisma.$transaction(async (tx) => {
      const media = await tx.productMedia.findFirst({
        where: { id: mediaId, revisionId, archivedAt: null },
      });
      if (!media) throw new NotFoundException("Media not found");
      const updated = await tx.productMedia.update({
        where: { id: mediaId },
        data: { rank: dto.rank },
      });
      await this.audit.write(tx, {
        actor: user,
        tenantId,
        action: "PRODUCT_MEDIA_RANKED",
        entityType: "ProductMedia",
        entityId: mediaId,
        beforeState: { rank: media.rank },
        afterState: { rank: updated.rank, revisionId },
      });
      await this.tagAdminRevisionEdit(tx, revisionId, user, [`photos.${mediaId}.rank`]);
      return updated;
    });
    await this.notifyAdminRevisionEdited(revisionId, user);
    return updated;
  }
}
