// Deliberately synthetic prerequisites for the complete historical verifier matrix.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { PrismaClient } = require('@prisma/client');
const { NestFactory } = require('@nestjs/core');
const { SchedulerRegistry } = require('@nestjs/schedule');
const url = new URL(process.env.DATABASE_URL || 'invalid:');
assert(url.hostname==='127.0.0.1'&&url.port==='55439'&&['/voya_readiness_fresh_20261119','/voya_readiness_clean_20261119'].includes(url.pathname)&&url.username==='voya_local','Only the dedicated synthetic readiness database is allowed');
Object.assign(process.env,{NODE_ENV:'test',JWT_SECRET:'readiness-isolated-development-secret-20261119',SECRET_ENCRYPTION_KEY:'45'.repeat(32),
  STORAGE_DRIVER:'local',STORAGE_ROOT:path.join(os.tmpdir(),'voya-readiness-storage-20261119'),SMTP_HOST:'',SMTP_USER:'',SMTP_PASSWORD:'',EMAIL_OTP_WEBHOOK_URL:'',AI_ACTIVITY_ENABLED:'false',DISABLE_SCHEDULED_WORKERS:'true'});
const { AppModule }=require('../dist/app.module');
const { BookingsService }=require('../dist/bookings/bookings.service');
const { VendorOutletsService }=require('../dist/vendor-outlets/vendor-outlets.service');
const { ensurePublicIdentifier,publicIdentifier,allocatePublicCode,PublicEntity }=require('../dist/common/public-identifiers');
const prisma=new PrismaClient();let app;
const actor=(u)=>({sub:u.id,email:u.email,fullName:u.fullName,role:u.role,tenantId:u.tenantId,organizationRole:u.organizationRole,active:true});
async function main(){
  const owner=await prisma.user.findUniqueOrThrow({where:{email:'vendor@voya.demo'}});
  const admin=await prisma.user.findUniqueOrThrow({where:{email:'superadmin@voya.demo'}});
  const agent=await prisma.user.findUniqueOrThrow({where:{email:'agent@voya.demo'}});
  if(!await publicIdentifier(prisma,PublicEntity.VENDOR,owner.tenantId)) await ensurePublicIdentifier(prisma,PublicEntity.VENDOR,owner.tenantId,await allocatePublicCode(prisma,PublicEntity.VENDOR,'SUP-',4));
  if(!await publicIdentifier(prisma,PublicEntity.AGENT,agent.tenantId)) await ensurePublicIdentifier(prisma,PublicEntity.AGENT,agent.tenantId,await allocatePublicCode(prisma,PublicEntity.AGENT,'AGT-',4));
  const otherVendor=await prisma.tenant.upsert({where:{slug:'separate-readiness-supplier'},update:{},create:{slug:'separate-readiness-supplier',name:'Separate Readiness Supplier',kind:'VENDOR'}});
  await prisma.vendorOutlet.upsert({where:{tenantId_outletCode:{tenantId:otherVendor.id,outletCode:'MAIN'}},update:{},create:{tenantId:otherVendor.id,outletCode:'MAIN',name:'Separate synthetic outlet',isDefault:true}});
  await prisma.user.upsert({where:{email:'separate@readiness.invalid'},update:{},create:{email:'separate@readiness.invalid',fullName:'Separate synthetic owner',passwordHash:owner.passwordHash,role:'VENDOR',organizationRole:'OWNER',tenantId:otherVendor.id}});
  await prisma.vendorOnboardingApplication.upsert({where:{tenantId:owner.tenantId},update:{status:'APPROVED'},create:{tenantId:owner.tenantId,status:'APPROVED',currentStep:8,businessDisplayName:'Readiness demonstration vendor',legalBusinessName:'Demonstration only'}});
  const plan=await prisma.ratePlan.findFirstOrThrow({where:{ratePlanCode:'RP-DEMO-001'},include:{variant:{include:{product:true}},commercialVersions:{where:{status:'ACTIVE'}}}});
  const product=plan.variant.product;
  await prisma.product.update({where:{id:product.id},data:{status:'LIVE'}});
  await prisma.ratePlan.update({where:{id:plan.id},data:{status:'ACTIVE',dateLevelCutoffTime:'23:59'}});
  await prisma.ratePlanCommercialVersion.updateMany({where:{ratePlanId:plan.id,status:'ACTIVE'},data:{bookingMode:'INSTANT',confirmationSlaMinutes:null}});
  const revenue=await prisma.commercialRule.findFirstOrThrow({where:{code:'SEED-VOYA-REVENUE-ZERO'}});
  await prisma.commercialRuleVersion.updateMany({where:{ruleId:revenue.id,status:'ACTIVE'},data:{config:{model:'MARKUP_PERCENT',percent:'10'}}});
  const channel=await prisma.distributionChannel.findUniqueOrThrow({where:{code:'VOYA_AGENT'}});
  await prisma.distributionChannel.update({where:{id:channel.id},data:{active:true}});
  await prisma.channelContract.upsert({where:{channelId_versionNumber:{channelId:channel.id,versionNumber:1}},update:{status:'ACTIVE'},create:{channelId:channel.id,versionNumber:1,name:'Synthetic readiness contract',status:'ACTIVE',effectiveFrom:new Date('2020-01-01'),capabilities:['CATALOG_READ','AVAILABILITY_READ','PRICING_READ','EVENT_READ'],allowedCurrencies:['INR'],availabilityHorizonDays:365,createdById:admin.id,activatedById:admin.id,activatedAt:new Date(),metadata:{demonstrationOnly:true}}});
  await prisma.productChannelMapping.upsert({where:{channelId_productId:{channelId:channel.id,productId:product.id}},update:{status:'ACTIVE'},create:{channelId:channel.id,productId:product.id,externalProductCode:'READINESS-PRODUCT',status:'ACTIVE',createdById:admin.id,activatedAt:new Date()}});
  await prisma.variantChannelMapping.upsert({where:{channelId_variantId:{channelId:channel.id,variantId:plan.variantId}},update:{status:'ACTIVE'},create:{channelId:channel.id,variantId:plan.variantId,externalVariantCode:'READINESS-OPTION',status:'ACTIVE',createdById:admin.id,activatedAt:new Date()}});
  const mapping=await prisma.ratePlanChannelMapping.upsert({where:{ratePlanId_channelId:{ratePlanId:plan.id,channelId:channel.id}},update:{status:'ACTIVE',enabled:true,externalRatePlanCode:'READINESS-RATE'},create:{ratePlanId:plan.id,channelId:channel.id,status:'ACTIVE',enabled:true,externalRatePlanCode:'READINESS-RATE',createdById:admin.id,activatedAt:new Date()}});
  await prisma.channelInventoryRule.upsert({where:{ratePlanChannelMappingId:mapping.id},update:{},create:{ratePlanChannelMappingId:mapping.id,exposureMode:'EXACT_REMAINING',capacityBuffer:0}});
  await prisma.scheduleTemplate.upsert({where:{variantId_scheduleCode:{variantId:plan.variantId,scheduleCode:'READINESS-LEGACY-REVIEW'}},update:{},create:{variantId:plan.variantId,scheduleCode:'READINESS-LEGACY-REVIEW',name:'Illustrative legacy schedule requiring review',timezone:'Asia/Kolkata',effectiveFrom:new Date('2020-01-01'),capacityUnit:'PERSON',capacityUnitReviewRequired:true,sourcePayload:{demonstrationOnly:true}}});
  app=await NestFactory.create(AppModule,{logger:['error']});await app.init();
  for(const name of app.get(SchedulerRegistry).getCronJobs().keys())app.get(SchedulerRegistry).deleteCronJob(name);
  const outlets=app.get(VendorOutletsService);const outlet=await prisma.vendorOutlet.findFirstOrThrow({where:{tenantId:owner.tenantId,isDefault:true}});
  if(!outlet.bankAccountId){
    const proof=await prisma.fileAsset.findFirstOrThrow({where:{tenantId:owner.tenantId,originalName:'bank-proof.pdf'}});
    const bank=await outlets.createBankAccount(actor(owner),{accountNumber:'000111222333',bankName:'DEMONSTRATION BANK ONLY',ifsc:'DEMO0000123',accountHolder:'Readiness demonstration only',accountType:'CURRENT',currency:'INR',proofDocumentId:proof.id});
    await outlets.reviewBankAccount(actor(admin),bank.id,{status:'VERIFIED',note:'SYNTHETIC LOCAL READINESS ONLY. Not a genuine bank verification or payment destination.'});
    await outlets.assignBank(actor(owner),outlet.id,{bankAccountId:bank.id});
  }
  const existing=await prisma.booking.findFirst({where:{agentTenantId:agent.tenantId,idempotencyKey:'readiness-baseline-booking'}});
  let booking=existing;
  if(!booking){
    const tomorrow=new Date();tomorrow.setUTCHours(0,0,0,0);tomorrow.setUTCDate(tomorrow.getUTCDate()+2);
    const session=await prisma.serviceSession.findFirstOrThrow({where:{serviceDate:{gte:tomorrow},scheduleTemplate:{variantId:plan.variantId,scheduleCode:'SEED-SUNRISE-SHARED'},status:'OPEN'},orderBy:{serviceDate:'asc'}});
    const dto={ratePlanId:plan.id,sessionId:session.id,travellers:[{travellerType:'ADULT',quantity:1}],travellerDetails:[{travellerType:'ADULT',quantity:1,fullName:'Demonstration visitor',isLead:true}],customerName:'Readiness demonstration visitor',customerEmail:'visitor@readiness.invalid'};
    const service=app.get(BookingsService);const preview=await service.preview(actor(agent),dto);
    assert(preview.eligible,JSON.stringify(preview.gates.filter((gate)=>gate.status==='FAIL')));
    booking=await service.create(actor(agent),{...dto,expectedQuoteFingerprint:preview.quoteFingerprint,expectedCancellationPolicyFingerprint:preview.cancellationPolicyFingerprint,expectedContextFingerprint:preview.contextFingerprint,cancellationPolicyAcknowledged:true,priceChangeAcknowledged:true},'readiness-baseline-booking');
  }
  assert(await prisma.bookingSnapshot.findUnique({where:{bookingId:booking.id}}),'Canonical snapshot must come from the real booking service');
  const { VoucherGenerationService } = require('../dist/fulfilment/voucher-generation.service');
  const generation = app.get(VoucherGenerationService);
  for (let i = 0; i < 100; i++) {
    const result = await generation.processNext();
    if (!result.processed) break;
    assert(result.status !== 'FAILED', 'Synthetic prerequisite voucher generation failed');
  }
  const report={checkedAt:new Date(),database:url.pathname,syntheticOnly:true,canonicalBookingCreatedThroughService:true,bookingId:booking.id,externalMail:false,realMoney:false,bankVerification:'Demonstration fixture, not a genuine verification'};
  const evidence=path.resolve('../outputs/release-readiness-20261119');fs.mkdirSync(evidence,{recursive:true});fs.writeFileSync(path.join(evidence,'fixture-preparation.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));
}
main().catch((error)=>{console.error(error.stack||error.message);process.exitCode=1;}).finally(async()=>{await app?.close();await prisma.$disconnect();});
