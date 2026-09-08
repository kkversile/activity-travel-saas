import { ActivityStatus, PrismaClient, ProductType, RatePlanStatus, TenantKind, UserRole, VendorVerificationStatus } from '@prisma/client';
import { hash } from 'bcryptjs';

const prisma = new PrismaClient();
const vendors = [
  { slug: 'kerala-trails', name: 'Kerala Trails Expeditions', email: 'kerala.trails@voya.demo', city: 'Thekkady', status: VendorVerificationStatus.VERIFIED, listings: ['Periyar Lake Bamboo Rafting', 'Thekkady Wildlife Jeep Safari'] },
  { slug: 'coastal-kayak-co', name: 'Coastal Kayak Co.', email: 'coastal.kayak@voya.demo', city: 'Alappuzha', status: VendorVerificationStatus.VERIFIED, listings: ['Alleppey Backwater Kayaking', 'Sunset Canoe Village Tour'] },
  { slug: 'fort-kochi-walks', name: 'Fort Kochi Heritage Walks', email: 'fort.kochi@voya.demo', city: 'Kochi', status: VendorVerificationStatus.VERIFIED, listings: ['Fort Kochi Heritage Walk', 'Chinese Fishing Nets Photo Tour'] },
  { slug: 'wayanad-wild', name: 'Wayanad Wild Escapes', email: 'wayanad.wild@voya.demo', city: 'Wayanad', status: VendorVerificationStatus.PENDING, listings: ['Wayanad Bamboo Forest Trek'] },
  { slug: 'munnar-new-adventures', name: 'Munnar New Adventures', email: 'munnar.new@voya.demo', city: 'Munnar', status: VendorVerificationStatus.PENDING, listings: ['Munnar Valley Cycling Tour'] },
];

async function main() {
  const passwordHash = await hash('Demo@123', 10);
  for (const vendor of vendors) {
    const tenant = await prisma.tenant.upsert({ where: { slug: vendor.slug }, update: { name: vendor.name }, create: { name: vendor.name, slug: vendor.slug, kind: TenantKind.VENDOR } });
    await prisma.user.upsert({ where: { email: vendor.email }, update: { tenantId: tenant.id, passwordHash, role: UserRole.VENDOR, active: true }, create: { email: vendor.email, passwordHash, fullName: vendor.name, role: UserRole.VENDOR, tenantId: tenant.id } });
    await prisma.vendorProfile.upsert({ where: { tenantId: tenant.id }, update: { verificationStatus: vendor.status }, create: { tenantId: tenant.id, legalBusinessName: `${vendor.name} Pvt. Ltd.`, operatingCity: vendor.city, operatingRegion: 'Kerala', category: 'Tours and Activities', verificationStatus: vendor.status, readinessScore: vendor.status === VendorVerificationStatus.VERIFIED ? 85 : 32, documentStatus: vendor.status === VendorVerificationStatus.VERIFIED ? { gstin: { status: 'VERIFIED', fileName: 'gstin-certificate.pdf' }, pan: { status: 'VERIFIED', fileName: 'pan-card.pdf' }, bankProof: { status: 'VERIFIED', fileName: 'bank-proof.pdf' }, tradeLicense: { status: 'VERIFIED', fileName: 'trade-license.pdf' } } : { gstin: { status: 'PENDING' }, pan: { status: 'PENDING' } } } });
    if (vendor.status !== VendorVerificationStatus.VERIFIED) continue;
    for (let i = 0; i < vendor.listings.length; i++) {
      const productName = vendor.listings[i];
      let activity = await prisma.activity.findFirst({ where: { tenantId: tenant.id, productName } });
      if (!activity) activity = await prisma.activity.create({ data: { tenantId: tenant.id, productName, type: ProductType.ACTIVITY, subType: 'GUIDED_EXPERIENCE', description: `${productName} operated by ${vendor.name}.`, shortDescription: `Book the ${productName.toLowerCase()} experience.`, highlights: ['Local expert guide', 'Instant confirmation', 'Small group'], subCategory: 'Tours and Activities', rank: i + 1, starRating: 4.6 + i / 10, cityName: vendor.city, stateName: 'Kerala', countryName: 'INDIA', address: `${vendor.city}, Kerala`, channels: ['B2B', 'B2C'], labels: ['New vendor'], status: ActivityStatus.LIVE, terms: ['Cancellation terms apply as per the selected rate plan.'], importantInfo: ['Carry a valid photo ID.'], thingsToCarry: ['Comfortable footwear', 'Water bottle'], sourcePayload: { source: 'Multi-vendor demo generator' } } });
      const code = `RP-${vendor.slug.toUpperCase().replace(/-/g, '')}-${i + 1}`;
      const existing = await prisma.ratePlan.findFirst({ where: { activityId: activity.id, ratePlanCode: code } });
      if (!existing) await prisma.ratePlan.create({ data: { activityId: activity.id, ratePlanCode: code, name: 'Standard Rate Plan', status: RatePlanStatus.ACTIVE, description: `Standard plan for ${productName}.`, validFrom: new Date(Date.now() - 30 * 86400000), validTo: new Date(Date.now() + 365 * 86400000), currency: 'INR', unitType: 'per_person', basePrice: 1200 + i * 400, minPax: 1, maxPax: 15, validDays: ['MONDAY','TUESDAY','WEDNESDAY','THURSDAY','FRIDAY','SATURDAY','SUNDAY'], inclusions: ['Experience as described'], exclusions: ['Personal expenses'], durationMinutes: 180, instantConfirmation: true, cutOffMinutes: 120 } });
    }
  }
  const total = await prisma.tenant.count({ where: { slug: { in: vendors.map(v => v.slug) } } });
  const approved = await prisma.vendorProfile.count({ where: { tenant: { slug: { in: vendors.map(v => v.slug) } }, verificationStatus: VendorVerificationStatus.VERIFIED } });
  const pending = await prisma.vendorProfile.count({ where: { tenant: { slug: { in: vendors.map(v => v.slug) } }, verificationStatus: VendorVerificationStatus.PENDING } });
  const listings = await prisma.activity.count({ where: { tenant: { slug: { in: vendors.map(v => v.slug) } } } });
  console.log(`Added ${total} demo vendors: ${approved} approved, ${pending} pending, ${listings} listings across approved vendors.`);
}
main().catch(e => { console.error(e); process.exitCode = 1; }).finally(() => prisma.$disconnect());
