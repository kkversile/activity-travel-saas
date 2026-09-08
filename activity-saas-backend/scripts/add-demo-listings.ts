import { ActivityStatus, PrismaClient, ProductType, RatePlanStatus } from '@prisma/client';

const prisma = new PrismaClient();
const names = [
  'Munnar Tea Garden Walk', 'Eravikulam National Park Safari', 'Kundala Lake Kayaking',
  'Kolukkumalai Sunrise Jeep Tour', 'Munnar Spice Plantation Visit', 'Mattupetty Dam Family Tour',
  'Chokramudi Peak Guided Hike', 'Munnar Elephant Encounter', 'Kerala Cooking Class in Munnar',
  'Tea Museum and Tasting Experience',
];

async function main() {
  const tenant = await prisma.tenant.findUnique({ where: { slug: 'blue-mountain-adventures' } });
  if (!tenant) throw new Error('Seed the Blue Mountain Adventures vendor first');
  for (let i = 0; i < names.length; i++) {
    const productName = names[i];
    let activity = await prisma.activity.findFirst({ where: { tenantId: tenant.id, productName } });
    if (!activity) activity = await prisma.activity.create({ data: {
      tenantId: tenant.id, productName, type: i === 8 ? ProductType.MEALS : ProductType.ACTIVITY,
      subType: 'GUIDED_EXPERIENCE', description: `${productName} operated by Blue Mountain Adventures in Munnar.`,
      shortDescription: `Book the ${productName.toLowerCase()} experience.`, highlights: ['Local guide', 'Small group experience', 'Instant confirmation'],
      subCategory: 'Tours and Activities', rank: 20 + i, starRating: 4.5 + (i % 5) / 10,
      cityName: 'Munnar', stateName: 'Kerala', countryName: 'INDIA', address: 'Munnar, Kerala',
      channels: ['B2B', 'B2C'], labels: i % 2 ? ['Trending'] : ['New'],
      status: i < 6 ? ActivityStatus.LIVE : ActivityStatus.UNDER_REVIEW,
      terms: ['Cancellation terms apply as per the selected rate plan.'], importantInfo: ['Carry a valid photo ID.'],
      thingsToCarry: ['Comfortable footwear', 'Water bottle'], sourcePayload: { source: 'Demo listing generator' },
    } });
    const ratePlanCode = `RP-DEMO-LISTING-${String(i + 1).padStart(2, '0')}`;
    const existing = await prisma.ratePlan.findFirst({ where: { activityId: activity.id, ratePlanCode } });
    if (!existing) await prisma.ratePlan.create({ data: {
      activityId: activity.id, ratePlanCode, name: 'Standard Experience', status: RatePlanStatus.ACTIVE,
      description: `Standard rate plan for ${productName}.`, validFrom: new Date(Date.now() - 30 * 86400000),
      validTo: new Date(Date.now() + 365 * 86400000), currency: 'INR', unitType: 'per_person', basePrice: 999 + i * 250,
      minPax: 1, maxPax: 15, validDays: ['MONDAY','TUESDAY','WEDNESDAY','THURSDAY','FRIDAY','SATURDAY','SUNDAY'],
      inclusions: ['Experience as described'], exclusions: ['Personal expenses'], durationMinutes: 180,
      instantConfirmation: true, cutOffMinutes: 120,
    } });
  }
  const count = await prisma.activity.count({ where: { tenantId: tenant.id } });
  const plans = await prisma.ratePlan.count({ where: { activity: { tenantId: tenant.id } } });
  console.log(`Blue Mountain Adventures now has ${count} listings and ${plans} rate plans.`);
}

main().catch((error) => { console.error(error); process.exitCode = 1; }).finally(() => prisma.$disconnect());
