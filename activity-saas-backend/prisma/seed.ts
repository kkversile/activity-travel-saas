import { PrismaClient, ActivityStatus, BookingStatus, ChargeType, MediaKind, PayoutStatus, ProductType, RatePlanStatus, TenantKind, TravellerType, UserRole, VendorVerificationStatus } from '@prisma/client';
import { hash } from 'bcryptjs';

const prisma = new PrismaClient();

type ActivitySeed = {
  productName: string;
  type: ProductType;
  subType: string;
  status: ActivityStatus;
  description: string;
  shortDescription: string;
  highlights: string[];
  subCategory: string;
  rank: number;
  starRating: number;
  cityName: string;
  countryName: string;
  stateName: string;
  address?: string;
  cityCode?: string;
  lat?: number;
  lon?: number;
  channels: string[];
  labels: string[];
};

function dateOnly(offsetDays: number) {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() + offsetDays);
  return d;
}

async function main() {
  const tenant = await prisma.tenant.upsert({
    where: { slug: 'blue-mountain-adventures' },
    update: {},
    create: { name: 'Blue Mountain Adventures', slug: 'blue-mountain-adventures', kind: TenantKind.VENDOR },
  });

  const passwordHash = await hash('Demo@123', 10);
  await prisma.user.upsert({
    where: { email: 'vendor@voya.demo' },
    update: { passwordHash, tenantId: tenant.id, role: UserRole.VENDOR, active: true },
    create: { email: 'vendor@voya.demo', passwordHash, fullName: 'Binu Mathew', role: UserRole.VENDOR, tenantId: tenant.id },
  });
  await prisma.user.upsert({
    where: { email: 'admin@voya.demo' },
    update: { passwordHash, role: UserRole.ADMIN, active: true },
    create: { email: 'admin@voya.demo', passwordHash, fullName: 'Voya Admin', role: UserRole.ADMIN },
  });

  await prisma.vendorProfile.upsert({
    where: { tenantId: tenant.id },
    update: {},
    create: {
      tenantId: tenant.id,
      legalBusinessName: 'Blue Mountain Adventures Pvt. Ltd.',
      operatingCity: 'Munnar',
      operatingRegion: 'Kerala',
      gstin: '32AACCB1234F1Z5',
      category: 'Trekking, Nature & Wildlife',
      verificationStatus: VendorVerificationStatus.VERIFIED,
      readinessScore: 81,
      payoutAccountMasked: 'HDFC •••• 4821',
      documentStatus: {
        gstin: { status: 'VERIFIED', expiresInDays: 14 },
        pan: { status: 'VERIFIED' },
        bankProof: { status: 'PENDING' },
        tradeLicense: { status: 'PENDING' },
      },
    },
  });

  const samples: ActivitySeed[] = [
    {
      productName: 'Sunrise Trek to Top Station', type: ProductType.ACTIVITY, subType: 'TICKET_ONLY', status: ActivityStatus.LIVE,
      description: 'Guided early-morning trek through the Munnar highlands with sunrise viewpoints and local guide support.',
      shortDescription: 'A sunrise trek through Munnar with guided viewpoints and breakfast.',
      highlights: ['Sunrise viewpoint', 'Local trek guide', 'Breakfast included'], subCategory: 'Outdoor Sports/Activities', rank: 1, starRating: 4.8,
      cityName: 'Munnar', countryName: 'INDIA', stateName: 'Kerala', address: 'Top Station Road, Munnar', lat: 10.0889333, lon: 77.0595248,
      channels: ['Direct — Voya', 'Klook', 'GetYourGuide'], labels: ['Best sellers'],
    },
    {
      productName: 'Athirappilly Excursion from Kochi to Munnar', type: ProductType.ACTIVITY, subType: 'SIGHTSEEING', status: ActivityStatus.LIVE,
      description: 'Feel refreshed amidst nature with an en-route excursion to Athirappilly Waterfalls while travelling from Kochi to Munnar.',
      shortDescription: 'Scenic Kochi–Munnar drive with an Athirappilly Waterfalls stop.',
      highlights: ['Athirappilly Waterfalls en route', 'Scenic drive', 'Seven-hour road journey'], subCategory: 'Guided Tours', rank: 2, starRating: 4.9,
      cityName: 'Munnar', countryName: 'INDIA', stateName: 'Kerala', address: 'Athirappilly, Kerala', lat: 10.2851, lon: 76.5697,
      channels: ['B2B', 'B2C'], labels: ['Best sellers'],
    },
    {
      productName: 'Photoshoot at Tata Tea Museum', type: ProductType.ACTIVITY, subType: 'TICKET_ONLY', status: ActivityStatus.UNDER_REVIEW,
      description: 'Tea-estate photoshoot experience with edited images and optional museum visit.', shortDescription: 'Tea-estate photoshoot in Munnar.',
      highlights: ['Tea estate photo shoot', '10 edited images'], subCategory: 'photography', rank: 3, starRating: 4.8,
      cityName: 'Munnar', countryName: 'INDIA', stateName: 'Kerala', lat: 10.0941757, lon: 77.05072, channels: ['B2B', 'B2C'], labels: ['Most Popular'],
    },
    {
      productName: 'Traditional Meal of Kerala', type: ProductType.MEALS, subType: 'MEALS', status: ActivityStatus.DRAFT,
      description: 'Traditional Kerala meal experience served at Clay Oven Restaurant on the Kochi–Munnar route.', shortDescription: 'Authentic Kerala lunch served on a banana leaf.',
      highlights: ['Traditional Kerala meal', 'Lunch service window'], subCategory: 'meal/dining', rank: 4, starRating: 4.5,
      cityName: 'Munnar', countryName: 'INDIA', stateName: 'Kerala', lat: 10.0889333, lon: 77.0595248, channels: ['B2B', 'B2C'], labels: ['Must buy'],
    },
    {
      productName: 'Bus Tickets from Bangalore to Munnar', type: ProductType.TRANSFER, subType: 'POINT_TO_POINT', status: ActivityStatus.LIVE,
      description: 'Overnight semi-sleeper bus transfer between Bangalore and Munnar.', shortDescription: 'Comfortable overnight semi-sleeper bus transfer.',
      highlights: ['Semi-sleeper bus', 'Overnight transfer'], subCategory: 'Point-to-Point Transfers', rank: 5, starRating: 5,
      cityName: 'Munnar', countryName: 'INDIA', stateName: 'Kerala', cityCode: '333', channels: ['B2B', 'B2C'], labels: ['Trending'],
    },
  ];

  const activities: Record<string, { id: string }> = {};
  for (const sample of samples) {
    let activity = await prisma.activity.findFirst({ where: { tenantId: tenant.id, productName: sample.productName } });
    if (!activity) {
      activity = await prisma.activity.create({
        data: {
          tenantId: tenant.id,
          productName: sample.productName,
          type: sample.type,
          subType: sample.subType,
          description: sample.description,
          shortDescription: sample.shortDescription,
          highlights: sample.highlights,
          channels: sample.channels,
          labels: sample.labels,
          subCategory: sample.subCategory,
          rank: sample.rank,
          starRating: sample.starRating,
          cityName: sample.cityName,
          countryName: sample.countryName,
          stateName: sample.stateName,
          address: sample.address,
          cityCode: sample.cityCode,
          lat: sample.lat,
          lon: sample.lon,
          status: sample.status,
          terms: ['Cancellation terms apply as per the selected rate plan.'],
          importantInfo: ['Carry a valid photo ID.'],
          thingsToCarry: ['Comfortable footwear', 'Water bottle'],
          sourcePayload: { source: 'Activity Product Master / Final sheet', importedFieldsRetained: true },
        },
      });
    }
    activities[sample.productName] = activity;
  }

  const trek = activities['Sunrise Trek to Top Station'];
  let trekPlan = await prisma.ratePlan.findFirst({ where: { activityId: trek.id, ratePlanCode: 'RP-DEMO-001' } });
  if (!trekPlan) {
    trekPlan = await prisma.ratePlan.create({
      data: {
        activityId: trek.id,
        ratePlanCode: 'RP-DEMO-001',
        name: 'Standard Rate Plan',
        status: RatePlanStatus.ACTIVE,
        description: 'Flexible per-person rate for the sunrise trek.',
        validFrom: dateOnly(-30),
        validTo: dateOnly(365),
        currency: 'INR',
        unitType: 'per_person',
        basePrice: 1499,
        minPax: 1,
        maxPax: 15,
        affiliates: ['Holidays'],
        validDays: ['MONDAY','TUESDAY','WEDNESDAY','THURSDAY','FRIDAY','SATURDAY','SUNDAY'],
        suitableFor: ['ADULT','CHILD','SENIOR'],
        inclusions: ['Trek guide', 'Breakfast', 'Entry support'],
        exclusions: ['Personal expenses', 'Travel insurance'],
        durationMinutes: 240,
        timeOfDay: 'MORNING',
        pickupIncluded: true,
        pickupTimings: '05:15 AM',
        dropoffIncluded: true,
        dropoffTimings: '10:30 AM',
        vehicleType: 'SUV (Innova/Xylo)',
        privateShared: 'Shared',
        ticketOnly: true,
        offlineVoucher: true,
        instantConfirmation: true,
        pickupType: 'MEET_AT_PICKUP',
        pickupInput: 'Munnar town pickup point',
        cutOffMinutes: 120,
        adultRequired: true,
        minAdultRequired: 1,
        sourcePayload: { ratePlanId: 'RP-DEMO-001', mappedFrom: 'AK onward fields' },
        travellerRules: {
          create: [
            { type: TravellerType.ADULT, displayName: 'Adult', minAge: 12, maxAge: 99, minCount: 1, maxCount: 15, price: 1499 },
            { type: TravellerType.CHILD, displayName: 'Child', minAge: 5, maxAge: 11, minCount: 0, maxCount: 6, price: 999 },
            { type: TravellerType.SENIOR, displayName: 'Senior', minAge: 60, maxAge: 99, minCount: 0, maxCount: 15, price: 1299 },
          ],
        },
        cancellationRules: {
          create: [
            { minDaysBefore: 6, maxDaysBefore: null, chargeValue: 0, chargeType: ChargeType.PERCENTAGE },
            { minDaysBefore: 1, maxDaysBefore: 5, chargeValue: 50, chargeType: ChargeType.PERCENTAGE },
            { minDaysBefore: 0, maxDaysBefore: 0, chargeValue: 100, chargeType: ChargeType.PERCENTAGE },
          ],
        },
      },
    });
  }

  for (let day = 0; day < 7; day++) {
    for (const [startTime, capacity, available] of [['06:00', 12, day === 5 ? 0 : 8], ['09:30', 12, day === 5 ? 2 : 10]] as const) {
      await prisma.availabilitySlot.upsert({
        where: { ratePlanId_slotDate_startTime: { ratePlanId: trekPlan.id, slotDate: dateOnly(day), startTime } },
        update: {},
        create: { ratePlanId: trekPlan.id, slotDate: dateOnly(day), startTime, capacity, available },
      });
    }
  }

  // Additional commercial plans keep the local Availability workspace realistic.
  // They are keyed by activity + code so rerunning the seed is safe and idempotent.
  const extraPlanSeeds = [
    ['Sunrise Trek to Top Station', 'RP-TREK-PRIVATE', 'Private SUV Experience', 4999],
    ['Sunrise Trek to Top Station', 'RP-TREK-SUNSET', 'Sunset Trek Variant', 1799],
    ['Athirappilly Excursion from Kochi to Munnar', 'RP-ATHI-STANDARD', 'Standard Waterfall Excursion', 899],
    ['Athirappilly Excursion from Kochi to Munnar', 'RP-ATHI-PRIVATE', 'Private Vehicle Excursion', 3499],
    ['Photoshoot at Tata Tea Museum', 'RP-PHOTO-BASIC', 'Basic Photoshoot', 1299],
    ['Photoshoot at Tata Tea Museum', 'RP-PHOTO-PREMIUM', 'Premium Photoshoot', 2499],
    ['Traditional Meal of Kerala', 'RP-MEAL-LUNCH', 'Kerala Lunch Experience', 999],
    ['Traditional Meal of Kerala', 'RP-MEAL-DINNER', 'Kerala Dinner Experience', 1199],
    ['Bus Tickets from Bangalore to Munnar', 'RP-BUS-SEMI', 'Semi Sleeper Transfer', 1499],
  ] as const;

  for (const [activityName, ratePlanCode, name, basePrice] of extraPlanSeeds) {
    const activity = activities[activityName];
    const plan = await prisma.ratePlan.upsert({
      where: { activityId_ratePlanCode: { activityId: activity.id, ratePlanCode } },
      update: {},
      create: {
        activityId: activity.id,
        ratePlanCode,
        name,
        status: RatePlanStatus.ACTIVE,
        description: `${name} demo rate plan`,
        validFrom: dateOnly(-30),
        validTo: dateOnly(365),
        currency: 'INR',
        unitType: 'per_person',
        basePrice,
        minPax: 1,
        maxPax: 15,
        validDays: ['MONDAY','TUESDAY','WEDNESDAY','THURSDAY','FRIDAY','SATURDAY','SUNDAY'],
        inclusions: ['Service as described'],
        exclusions: ['Personal expenses'],
        durationMinutes: 180,
        instantConfirmation: true,
        cutOffMinutes: 120,
      },
    });

    for (let day = 0; day < 3; day++) {
      await prisma.availabilitySlot.upsert({
        where: { ratePlanId_slotDate_startTime: { ratePlanId: plan.id, slotDate: dateOnly(day), startTime: '10:00' } },
        update: {},
        create: { ratePlanId: plan.id, slotDate: dateOnly(day), startTime: '10:00', capacity: 20, available: 16 },
      });
    }
  }

  const existingPromo = await prisma.promotion.findFirst({ where: { activityId: trek.id, name: 'Low Occupancy Booster' } });
  if (!existingPromo) {
    await prisma.promotion.create({
      data: { activityId: trek.id, name: 'Low Occupancy Booster', discountPercent: 18, startsAt: new Date(), endsAt: new Date(Date.now() + 48 * 3600_000), maxDiscountedBookings: 10, active: true },
    });
  }

  const bookingSeed = [
    ['BK-77291', 'MakeMyTrip', 'Sunrise Trek to Top Station', 4, 5996, BookingStatus.CONFIRMED, 1],
    ['BK-77288', 'Klook', 'Sunrise Trek to Top Station', 2, 2998, BookingStatus.PENDING, 2],
    ['BK-77286', 'GetYourGuide', 'Photoshoot at Tata Tea Museum', 6, 18600, BookingStatus.PENDING, 3],
    ['BK-77280', 'Direct — Voya', 'Traditional Meal of Kerala', 3, 4500, BookingStatus.CONFIRMED, 4],
    ['BK-77275', 'Viator', 'Athirappilly Excursion from Kochi to Munnar', 3, 2697, BookingStatus.CANCELLED, 1],
  ] as const;

  for (const [bookingCode, channel, activityName, pax, amount, status, day] of bookingSeed) {
    const activity = activities[activityName];
    await prisma.booking.upsert({
      where: { bookingCode },
      update: {},
      create: {
        tenantId: tenant.id,
        activityId: activity.id,
        ratePlanId: activityName === 'Sunrise Trek to Top Station' ? trekPlan.id : null,
        bookingCode,
        channel,
        serviceDate: dateOnly(day),
        pax,
        paxBreakdown: { adult: pax },
        amount,
        status,
        customerName: `Demo Guest ${bookingCode.slice(-2)}`,
        customerEmail: `guest${bookingCode.slice(-2)}@example.com`,
      },
    });
  }

  const payoutSeed = [
    { reference: 'PO-2026-001', amount: 184220, status: PayoutStatus.SCHEDULED, dueDate: dateOnly(4) },
    { reference: 'PO-2026-000', amount: 42900, status: PayoutStatus.IN_TRANSIT, dueDate: dateOnly(2) },
    { reference: 'PO-2026-099', amount: 126500, status: PayoutStatus.PAID, dueDate: dateOnly(-7) },
  ];
  for (const p of payoutSeed) {
    const exists = await prisma.payout.findFirst({ where: { tenantId: tenant.id, reference: p.reference } });
    if (!exists) await prisma.payout.create({ data: { tenantId: tenant.id, ...p } });
  }

  console.log('Seeded demo vendor: vendor@voya.demo / Demo@123');
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
