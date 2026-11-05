import { BookingQuestionType, PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const travellerQuestionDefinitions = [
  { label: 'Lead name', code: 'lead_name', appliesPerTraveller: false },
  { label: 'Mobile', code: 'mobile', appliesPerTraveller: false },
  { label: 'Pickup hotel', code: 'pickup_hotel', appliesPerTraveller: false },
  { label: "Every traveller's name", code: 'traveller_name', appliesPerTraveller: true },
  { label: 'Govt ID', code: 'govt_id', appliesPerTraveller: true },
  { label: 'Age / DOB', code: 'age_dob', appliesPerTraveller: true },
] as const;

const cancellationPresetRules: Record<string, Array<{ minDaysBefore: number; maxDaysBefore: number | null; chargeValue: number; chargeType: string }>> = {
  FLEXIBLE: [
    { minDaysBefore: 1, maxDaysBefore: null, chargeValue: 0, chargeType: 'PERCENTAGE' },
    { minDaysBefore: 0, maxDaysBefore: 1, chargeValue: 100, chargeType: 'PERCENTAGE' },
  ],
  MODERATE: [
    { minDaysBefore: 2, maxDaysBefore: null, chargeValue: 0, chargeType: 'PERCENTAGE' },
    { minDaysBefore: 1, maxDaysBefore: 2, chargeValue: 50, chargeType: 'PERCENTAGE' },
    { minDaysBefore: 0, maxDaysBefore: 1, chargeValue: 100, chargeType: 'PERCENTAGE' },
  ],
  STRICT: [
    { minDaysBefore: 7, maxDaysBefore: null, chargeValue: 0, chargeType: 'PERCENTAGE' },
    { minDaysBefore: 3, maxDaysBefore: 6, chargeValue: 50, chargeType: 'PERCENTAGE' },
    { minDaysBefore: 0, maxDaysBefore: 2, chargeValue: 100, chargeType: 'PERCENTAGE' },
  ],
  NON_REFUNDABLE: [
    { minDaysBefore: 0, maxDaysBefore: null, chargeValue: 100, chargeType: 'PERCENTAGE' },
  ],
};

const safeCategoryBySubtype: Record<string, string> = {
  SIGHTSEEING: 'DAY_TOURS_SIGHTSEEING',
  GUIDED_TOUR: 'DAY_TOURS_SIGHTSEEING',
  'Adventure Park': 'THEME_WATER_PARKS',
  'Adventure park': 'THEME_WATER_PARKS',
};

const safeCategorySignals: Array<{ category: string; patterns: RegExp[] }> = [
  {
    category: 'THEME_WATER_PARKS',
    patterns: [/adventure park/i, /water park/i],
  },
  {
    category: 'ADVENTURE_WATER_SPORTS',
    patterns: [/water sports?/i, /water-based/i, /water adventures?/i, /jetski/i, /kayaking/i, /snorkeling/i],
  },
  {
    category: 'CAMPING_TREKS',
    patterns: [/\btrek\b/i, /\btrekking\b/i],
  },
  {
    category: 'DAY_TOURS_SIGHTSEEING',
    patterns: [/tea garden/i, /sunrise walk/i, /sightseeing/i],
  },
];

const listValues = (values: string[]) => [...new Set(values.map((value) => value.trim()).filter(Boolean))];

const normalizedCancellationRules = (rules: Array<{ minDaysBefore: number; maxDaysBefore: number | null; chargeValue: unknown; chargeType: string }>) => rules
  .map((rule) => ({ minDaysBefore: Number(rule.minDaysBefore), maxDaysBefore: rule.maxDaysBefore == null ? null : Number(rule.maxDaysBefore), chargeValue: Number(rule.chargeValue), chargeType: rule.chargeType }))
  .sort((left, right) => right.minDaysBefore - left.minDaysBefore);

function deriveSafeCancellationPreset(revision: { cancellationPreset: string | null; variants: Array<{ ratePlans: Array<{ cancellationRules: Array<{ minDaysBefore: number; maxDaysBefore: number | null; chargeValue: unknown; chargeType: string }> }> }> }) {
  if (revision.cancellationPreset?.trim()) return undefined;
  const plans = revision.variants.flatMap((variant) => variant.ratePlans);
  if (!plans.length || plans.some((plan) => !plan.cancellationRules.length)) return undefined;
  const presetEntries = Object.entries(cancellationPresetRules);
  const matchedPresets = plans.map((plan) => {
    const actual = JSON.stringify(normalizedCancellationRules(plan.cancellationRules));
    return presetEntries.find(([, expected]) => JSON.stringify(expected) === actual)?.[0];
  });
  return matchedPresets.every(Boolean) && new Set(matchedPresets).size === 1 ? matchedPresets[0] : undefined;
}

function deriveSafeCategory(revision: { subType: string; productName: string; subCategory: string | null; description: string; shortDescription: string | null }) {
  const bySubtype = safeCategoryBySubtype[revision.subType];
  if (bySubtype) return bySubtype;

  const searchableText = [revision.productName, revision.subCategory || '', revision.description, revision.shortDescription || ''].join(' ');
  const highConfidenceMatch = safeCategorySignals.find(({ category, patterns }) => category === 'THEME_WATER_PARKS' && patterns.some((pattern) => pattern.test(searchableText)));
  if (highConfidenceMatch) return highConfidenceMatch.category;
  const matches = safeCategorySignals.filter(({ patterns }) => patterns.some((pattern) => pattern.test(searchableText)));
  return matches.length === 1 ? matches[0].category : undefined;
}

async function main() {
  const revisions = await prisma.productRevision.findMany({
    where: { status: 'DRAFT', product: { deletedAt: null }, currentForProducts: { some: {} } },
    include: { variants: { where: { status: 'ACTIVE', archivedAt: null }, select: { inclusions: true, exclusions: true, ratePlans: { where: { status: 'ACTIVE' }, select: { cancellationRules: true } } } }, bookingQuestions: { where: { archivedAt: null } } },
  });

  const changed: Array<{ revisionId: string; productId: string; fields: string[] }> = [];

  for (const revision of revisions) {
    const derivedIncluded = listValues(revision.variants.flatMap((variant) => variant.inclusions));
    const derivedNotIncluded = listValues(revision.variants.flatMap((variant) => variant.exclusions));
    const fields: string[] = [];

    await prisma.$transaction(async (tx) => {
      const data: { category?: string; included?: string[]; notIncluded?: string[]; cancellationPreset?: string; followItinerary?: boolean } = {};
      const safeCategory = deriveSafeCategory(revision);
      if (!revision.category && safeCategory) { data.category = safeCategory; fields.push('category'); }
      if (!revision.included.length && derivedIncluded.length) { data.included = derivedIncluded; fields.push('included'); }
      if (!revision.notIncluded.length && derivedNotIncluded.length) { data.notIncluded = derivedNotIncluded; fields.push('notIncluded'); }
      const safeCancellationPreset = deriveSafeCancellationPreset(revision);
      if (safeCancellationPreset) { data.cancellationPreset = safeCancellationPreset; fields.push('cancellationPreset'); }
      const effectiveCategory = revision.category || safeCategory;
      if (revision.followItinerary && ['THEME_WATER_PARKS', 'AMUSEMENT_PARKS', 'MONUMENTS_MUSEUMS'].includes(effectiveCategory || '')) { data.followItinerary = false; fields.push('followItinerary:false'); }
      if (Object.keys(data).length) await tx.productRevision.update({ where: { id: revision.id }, data });

      if (revision.travellerDetails?.trim()) {
        const selected = new Set(revision.travellerDetails.split(',').map((item) => item.trim().toLowerCase()).filter(Boolean));
        for (const [rank, definition] of travellerQuestionDefinitions.entries()) {
          if (selected.has(definition.label.toLowerCase())) {
            await tx.productBookingQuestion.upsert({
              where: { productRevisionId_code: { productRevisionId: revision.id, code: definition.code } },
              update: { label: definition.label, type: BookingQuestionType.TEXT, required: true, appliesPerTraveller: definition.appliesPerTraveller, rank, archivedAt: null },
              create: { productRevisionId: revision.id, code: definition.code, label: definition.label, type: BookingQuestionType.TEXT, required: true, appliesPerTraveller: definition.appliesPerTraveller, rank },
            });
            if (!revision.bookingQuestions.some((question) => question.code === definition.code)) fields.push(`bookingQuestion:${definition.code}`);
          } else {
            await tx.productBookingQuestion.updateMany({ where: { productRevisionId: revision.id, code: definition.code, archivedAt: null }, data: { archivedAt: new Date() } });
          }
        }
      }
    });

    if (fields.length) changed.push({ revisionId: revision.id, productId: revision.productId, fields: [...new Set(fields)] });
  }

  console.log(JSON.stringify({ inspectedDraftRevisions: revisions.length, changed }, null, 2));
}

main().catch((error) => { console.error(error); process.exitCode = 1; }).finally(() => prisma.$disconnect());
