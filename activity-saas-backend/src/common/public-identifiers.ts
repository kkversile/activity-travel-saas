import { randomUUID } from "crypto";

export type PublicIdentifierClient = {
  publicIdentifier?: {
    findUnique(args: any): Promise<any>;
    findMany(args: any): Promise<any[]>;
    upsert(args: any): Promise<any>;
  };
  publicIdentifierSequence?: {
    upsert(args: any): Promise<any>;
  };
};

export const PublicEntity = {
  VENDOR: "VENDOR",
  VENDOR_DOCUMENT: "VENDOR_DOCUMENT",
  AGENT: "AGENT",
  PRODUCT: "PRODUCT",
  VARIANT: "VARIANT",
  RATE_PLAN: "RATE_PLAN",
  MASTER_PRODUCT: "MASTER_PRODUCT",
  MASTER_OPTION: "MASTER_OPTION",
  BOOKING: "BOOKING",
  COMMERCIAL_RULE: "COMMERCIAL_RULE",
  SELECTION_RULE_SET: "SELECTION_RULE_SET",
  PROMOTION: "PROMOTION",
  PLATFORM_COUPON: "PLATFORM_COUPON",
  COMMISSION_INVOICE: "COMMISSION_INVOICE",
  SETTLEMENT_BATCH: "SETTLEMENT_BATCH",
  PAYOUT: "PAYOUT",
  REFUND: "REFUND",
  WALLET_LEDGER: "WALLET_LEDGER",
  APPROVAL: "APPROVAL",
  USER: "USER",
  AUDIT_EVENT: "AUDIT_EVENT",
  DISTRIBUTION_CHANNEL: "DISTRIBUTION_CHANNEL",
} as const;

export type PublicEntityType = (typeof PublicEntity)[keyof typeof PublicEntity];

export async function publicIdentifier(
  client: PublicIdentifierClient,
  entityType: string,
  entityId: string | null | undefined,
) {
  if (!entityId) return null;
  if (!client.publicIdentifier) return null;
  const row = await client.publicIdentifier.findUnique({
    where: { entityType_entityId: { entityType, entityId } },
  });
  return row?.publicCode ?? null;
}

export async function publicIdentifierMap(
  client: PublicIdentifierClient,
  entityType: string,
  entityIds: string[],
) {
  if (!entityIds.length || !client.publicIdentifier) return new Map<string, string>();
  const rows = await client.publicIdentifier.findMany({
    where: { entityType, entityId: { in: entityIds } },
    select: { entityId: true, publicCode: true },
  });
  return new Map(rows.map((row) => [row.entityId, row.publicCode]));
}

export async function ensurePublicIdentifier(
  client: PublicIdentifierClient,
  entityType: string,
  entityId: string,
  publicCode: string,
) {
  if (!client.publicIdentifier) return null;
  return client.publicIdentifier.upsert({
    where: { entityType_entityId: { entityType, entityId } },
    // Existing IDs are immutable. Re-running an ensure must never silently
    // rename a code that may already be present in exports or integrations.
    update: {},
    create: { id: randomUUID(), entityType, entityId, publicCode },
  });
}

export async function allocatePublicCode(
  client: PublicIdentifierClient,
  entityType: string,
  prefix: string,
  width: number,
) {
  if (!client.publicIdentifier) {
    const fallback = String(Date.now()).slice(-width).padStart(width, "0");
    return `${prefix}${fallback}`;
  }
  const rows = await client.publicIdentifier.findMany({
    where: { entityType, publicCode: { startsWith: prefix } },
    select: { publicCode: true },
  });
  const nextAvailable = Math.max(0, ...rows.map((row) => publicCodeNumber(row.publicCode))) + 1;
  if (client.publicIdentifierSequence) {
    // A database upsert with an atomic increment serializes concurrent
    // allocators for this entity/prefix. The unique publicCode index remains
    // the final integrity guard if a code was inserted outside this allocator.
    const sequence = await client.publicIdentifierSequence.upsert({
      where: { entityType_prefix: { entityType, prefix } },
      create: { entityType, prefix, lastValue: nextAvailable },
      update: { lastValue: { increment: 1 } },
      select: { lastValue: true },
    });
    return `${prefix}${String(sequence.lastValue).padStart(width, "0")}`;
  }
  const next = nextAvailable;
  return `${prefix}${String(next).padStart(width, "0")}`;
}

export async function allocateVendorVoucherShortCode(client: PublicIdentifierClient) {
  if (!client.publicIdentifierSequence) throw new Error('Vendor voucher-code sequence is not configured');
  const sequence = await client.publicIdentifierSequence.upsert({
    where: { entityType_prefix: { entityType: 'VENDOR_SHORT_CODE', prefix: 'VSC-' } },
    create: { entityType: 'VENDOR_SHORT_CODE', prefix: 'VSC-', lastValue: 1 },
    update: { lastValue: { increment: 1 } },
    select: { lastValue: true },
  });
  let value = Number(sequence.lastValue) - 1;
  if (!Number.isSafeInteger(value) || value < 0 || value >= 26 ** 3)
    throw new Error('Vendor voucher short-code space is exhausted');
  let code = '';
  for (let position = 0; position < 3; position++) {
    code = String.fromCharCode(65 + value % 26) + code;
    value = Math.floor(value / 26);
  }
  return code;
}

export function stateCode(state: string | null | undefined) {
  const value = String(state ?? "").trim().toUpperCase();
  const known: Record<string, string> = {
    GOA: "GA",
    MAHARASHTRA: "MH",
    KARNATAKA: "KA",
    ANDAMAN: "AN",
    "ANDAMAN AND NICOBAR": "AN",
    UTTARPRADESH: "UP",
    "UTTAR PRADESH": "UP",
    TELANGANA: "TG",
    KERALA: "KL",
    TAMILNADU: "TN",
    "TAMIL NADU": "TN",
    DELHI: "DL",
    RAJASTHAN: "RJ",
    GUJARAT: "GJ",
    WESTBENGAL: "WB",
    "WEST BENGAL": "WB",
  };
  if (known[value]) return known[value];
  const compact = value.replace(/[^A-Z]/g, "");
  return compact.slice(0, 2).padEnd(2, "X") || "XX";
}

export function publicCodeNumber(code: string | null | undefined) {
  const match = String(code ?? "").match(/(\d+)(?!.*\d)/);
  return match ? Number(match[1]) : 0;
}

export function isoWeekInfo(input: Date) {
  const date = new Date(Date.UTC(input.getUTCFullYear(), input.getUTCMonth(), input.getUTCDate()));
  const weekday = date.getUTCDay() || 7;
  const start = new Date(date);
  start.setUTCDate(date.getUTCDate() - weekday + 1);
  const end = new Date(start);
  end.setUTCDate(start.getUTCDate() + 7);
  const thursday = new Date(date);
  thursday.setUTCDate(date.getUTCDate() + 4 - weekday);
  const year = thursday.getUTCFullYear();
  const yearStart = new Date(Date.UTC(year, 0, 1));
  const week = Math.ceil(((thursday.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return { year, week, start, end };
}

export function vendorPayoutPublicCode(vendorPublicCode: string, date: Date) {
  const vendorNumber = vendorPublicCode.match(/^SUP-(\d{4})$/)?.[1];
  if (!vendorNumber) return null;
  const { year, week } = isoWeekInfo(date);
  return `PO-${vendorNumber}-${String(year).slice(-2)}${String(week).padStart(2, "0")}`;
}
