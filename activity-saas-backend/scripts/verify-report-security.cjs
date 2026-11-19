// Mutation regression restricted to a disposable loopback staging copy.
const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),{randomUUID}=require('node:crypto');
const target=new URL(process.env.DATABASE_URL||'invalid:');
assert(target.hostname==='127.0.0.1'&&target.port==='55445'&&/^\/voya_readiness_reports_\d+$/.test(target.pathname)&&target.username==='voya_staging');
Object.assign(process.env,{NODE_ENV:'test',JWT_SECRET:'report-security-isolated-verification-20261119',SECRET_ENCRYPTION_KEY:'45'.repeat(32),SMTP_HOST:'',SMTP_USER:'',SMTP_PASSWORD:'',EMAIL_OTP_WEBHOOK_URL:'',AI_ACTIVITY_ENABLED:'false',VENDOR_REPORT_SCHEDULER_ENABLED:'false',STORAGE_DRIVER:'local',STORAGE_ROOT:path.join(os.tmpdir(),'voya-report-security-'+randomUUID())});
const {PrismaClient}=require('@prisma/client'),{JwtService}=require('@nestjs/jwt'),{NestFactory}=require('@nestjs/core'),{ValidationPipe}=require('@nestjs/common'),{SchedulerRegistry}=require('@nestjs/schedule');
const {AppModule}=require('../dist/app.module'),{VendorToolsService}=require('../dist/vendor-tools/vendor-tools.service'),{RequestContextService}=require('../dist/common/request-context.service'),{CorrelationIdMiddleware}=require('../dist/common/correlation-id.middleware');
const p=new PrismaClient(),jwt=new JwtService({secret:process.env.JWT_SECRET});let app,base;const checks=[];
async function hashes(){const r={};for(const t of ['Booking','BookingEconomicsSnapshot','FinancialEvent','Payout','SettlementBatch','SettlementLine','SettlementEventAllocation','SettlementHold','PayoutAttempt','PayoutReleaseApprovalRequest','CommissionInvoice','FinanceConfiguration','FileAsset'])r[t]=(await p.$queryRawUnsafe(`SELECT md5(coalesce(string_agg(to_jsonb(t)::text,E'\\n' ORDER BY to_jsonb(t)::text),'')) AS hash FROM "${t}" t`))[0].hash;return r;}
async function call(user,route,status=200,method='GET',body){
 const token=jwt.sign({sub:user.id,tenantId:user.tenantId,role:user.role,organizationRole:user.organizationRole},{expiresIn:'10m'});
 const response=await fetch(base+route,{method,headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});
 const raw=await response.text();assert.equal(response.status,status,`${user.organizationRole} ${method} ${route}: ${response.status}`);checks.push({role:user.organizationRole,method,route,status});try{return JSON.parse(raw);}catch{return raw;}
}
async function main(){
 const before=await hashes(),owner=await p.user.findUniqueOrThrow({where:{email:'owner@harbour-trails.example.com'}}),tenantId=owner.tenantId;
 const outlets=await p.vendorOutlet.findMany({where:{tenantId,status:'ACTIVE'},orderBy:{createdAt:'asc'},take:2});assert.equal(outlets.length,2);const [a,b]=outlets;
 const roles={OWNER:owner};
 for(const role of ['CATALOGUE','OPERATIONS','FINANCE','VIEWER']){
  const u=await p.user.create({data:{tenantId,email:randomUUID()+'@report-fixture.invalid',fullName:'Demonstration report access',passwordHash:'disabled-login',role:'VENDOR',organizationRole:role}});
  await p.userOutletAccess.create({data:{tenantId,userId:u.id,outletId:a.id}});roles[role]=u;
 }
 const foreign=await p.user.findFirstOrThrow({where:{role:'VENDOR',organizationRole:'OWNER',tenantId:{not:tenantId},active:true}});
 async function saved(type,outletId=a.id,status='READY',startedAt=null){return p.vendorReportExport.create({data:{tenantId,outletId,name:'DEMONSTRATION report authorization',type,format:'CSV',status,rows:[['Demonstration only']],startedAt}});}
 const finance=await saved('PAYOUTS'),other=await saved('PAYOUTS',b.id),catalogue=await saved('PRODUCTS'),manifest=await saved('GUEST_MANIFEST');
 app=await NestFactory.create(AppModule,{logger:false});const middleware=new CorrelationIdMiddleware(app.get(RequestContextService));app.use((req,res,next)=>middleware.use(req,res,next));app.setGlobalPrefix('api');app.useGlobalPipes(new ValidationPipe({whitelist:true,transform:true}));await app.init();for(const key of app.get(SchedulerRegistry).getCronJobs().keys())app.get(SchedulerRegistry).deleteCronJob(key);await app.listen(0,'127.0.0.1');base='http://127.0.0.1:'+app.getHttpServer().address().port+'/api';
 for(const [role,u]of Object.entries(roles)){
  const cap=await call(u,'/vendor/report-capabilities');assert.equal(cap.canSchedule,role==='OWNER');
  assert.equal(cap.allowedTypes.includes('PAYOUTS'),['OWNER','FINANCE'].includes(role));
  if(['CATALOGUE','OPERATIONS','VIEWER'].includes(role)){
   for(const type of ['PAYOUTS','COMMISSION_INVOICES','TDS_TCS_CERTIFICATES'])await call(u,'/vendor/reports',403,'POST',{type,outletId:a.id});
   const rows=await call(u,'/vendor/reports?outletId='+a.id);assert(!rows.some(row=>['PAYOUTS','COMMISSION_INVOICES','TDS_TCS_CERTIFICATES'].includes(row.type)));
   await call(u,`/vendor/reports/${finance.id}/download?outletId=${a.id}`,404);
  }
  if(role!=='OWNER'){
   await call(u,'/vendor/report-schedules',403,'POST',{reportName:'DEMONSTRATION forbidden recipient',reportType:'PAYOUTS',frequency:'DAILY',recipient:'sink@fixture.invalid',runTime:'09:00',outletId:a.id});
   const s=await call(u,'/vendor/report-schedules?outletId='+a.id);assert.deepEqual(s.items,[]);
  }
 }
 await call(roles.FINANCE,`/vendor/reports/${finance.id}/download?outletId=${a.id}`);
 await call(roles.FINANCE,`/vendor/reports/${other.id}/download?outletId=${a.id}`,404);
 await call(foreign,`/vendor/reports/${finance.id}/download`,404);
 await call(roles.FINANCE,`/vendor/reports/${catalogue.id}/download?outletId=${a.id}`,404);
 await call(roles.CATALOGUE,`/vendor/reports/${catalogue.id}/download?outletId=${a.id}`);
 await call(roles.OPERATIONS,`/vendor/reports/${manifest.id}/download?outletId=${a.id}`);
 const csvFixture=await p.vendorReportExport.create({data:{tenantId,outletId:a.id,name:'DEMONSTRATION CSV boundary',type:'PAYOUTS',format:'CSV',status:'READY',rows:[['Reference','Amount','Identifier'],['=2+3','-100.00','00042']]}});
 const csv=await call(roles.FINANCE,`/vendor/reports/${csvFixture.id}/download?outletId=${a.id}`);
 assert(csv.includes('"\t=2+3","-100.00","00042"'));
 assert.deepEqual((await p.vendorReportExport.findUniqueOrThrow({where:{id:csvFixture.id}})).rows,[['Reference','Amount','Identifier'],['=2+3','-100.00','00042']]);
 const schedule=await call(owner,'/vendor/report-schedules',201,'POST',{reportName:'DEMONSTRATION paused report',reportType:'PAYOUTS',frequency:'DAILY',recipient:'sink@fixture.invalid',runTime:'09:00',outletId:a.id});assert.equal(schedule.status,'PAUSED');
 await call(roles.CATALOGUE,`/vendor/report-schedules/${schedule.id}?outletId=${a.id}`,403,'PATCH',{status:'ACTIVE'});
 await call(owner,`/vendor/report-schedules/${schedule.id}?outletId=${a.id}`,503,'PATCH',{status:'ACTIVE'});
 const queued=await call(roles.FINANCE,'/vendor/reports',202,'POST',{type:'PAYOUTS',format:'CSV',outletId:a.id});
 for(let i=0;i<40;i++){const item=await p.vendorReportExport.findUniqueOrThrow({where:{id:queued.id}});if(item.status==='READY')break;assert.notEqual(item.status,'FAILED');await new Promise(r=>setTimeout(r,50));}
 await call(roles.FINANCE,`/vendor/reports/${queued.id}/download?outletId=${a.id}`);
 const stale=await saved('PRODUCTS',a.id,'PROCESSING',new Date(Date.now()-20*60_000)),recent=await saved('PRODUCTS',a.id,'PROCESSING',new Date()),undated=await saved('PRODUCTS',a.id,'PROCESSING');
 await app.get(VendorToolsService).resumePendingReportExports();
 for(const record of [stale,undated])assert.equal((await p.vendorReportExport.findUniqueOrThrow({where:{id:record.id}})).status,'FAILED');
 assert.equal((await p.vendorReportExport.findUniqueOrThrow({where:{id:recent.id}})).status,'PROCESSING');
 assert.deepEqual(await hashes(),before);
 const result={checkedAt:new Date(),pass:true,database:target.pathname.slice(1),httpChecks:checks.length,csvFormulaTextProtected:true,csvSignedAmountsAndStoredRowsPreserved:true,financeRoleAccess:true,employeeFinanceDenials:true,tenantOutletDownloadIsolation:true,ownerOnlyRecipientManagement:true,reportSchedulerRemainsDisabled:true,interruptedExportsRecoverable:true,protectedFinanceAndFileHashes:13,checks};
 if(process.env.REPORT_SECURITY_EVIDENCE)fs.writeFileSync(process.env.REPORT_SECURITY_EVIDENCE,JSON.stringify(result,null,2));console.log(JSON.stringify({...result,checks:undefined}));
}
main().catch(e=>{console.error(e.message);process.exitCode=1}).finally(async()=>{await app?.close();await p.$disconnect();});
