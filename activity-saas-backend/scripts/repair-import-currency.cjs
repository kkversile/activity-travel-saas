// Deliberate two-step metadata repair. Importing this module never opens a DB.
const crypto=require('node:crypto');
const include={revisions:{orderBy:{id:'asc'},select:{id:true,sourcePayload:true}},variants:{orderBy:{id:'asc'},include:{ratePlans:{orderBy:{id:'asc'},include:{channelMappings:true,commercialVersions:{orderBy:{id:'asc'},include:{travellerPrices:{orderBy:{id:'asc'}}}}}}}}};
const digest=value=>crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
function candidate(product) {
  if(product.deletedAt || !product.sourceImportKey || !product.importFingerprint || product.currency!=='INR')return null;
  const plans=product.variants.flatMap(v=>v.ratePlans);
  if(!plans.length || plans.some(p=>!p.commercialVersions.some(v=>v.sourcePayload?.createdFromProductImport) || ['specialContract','agentSpecific','promotional','protectedFromActivityEditor'].some(k=>p.sourcePayload?.[k]) || p.channelMappings?.some(m=>m.status==='ACTIVE' || m.enabled===true)))return null;
  const currencies=[...new Set(plans.flatMap(p=>[p.currency,...p.commercialVersions.filter(v=>['DRAFT','ACTIVE'].includes(v.status)).map(v=>v.currency)]))];
  if(currencies.length!==1 || !/^[A-Z]{3}$/.test(currencies[0]) || currencies[0]==='INR')return null;
  // An explicitly retained original choice must never be inferred away.
  if(product.revisions.some(r=>{const choice=r.sourcePayload?.importOriginalCurrency;return choice && String(choice).toUpperCase()!==currencies[0];}))return null;
  return {productId:product.id,tenantId:product.tenantId,sourceImportKey:product.sourceImportKey,from:'INR',to:currencies[0],snapshotHash:digest(product),approved:false,reviewDecision:'',reviewNote:''};
}
async function planRepair(db,target) {
  return db.$transaction(async tx=>{
    await tx.$executeRawUnsafe('SET TRANSACTION READ ONLY');
    const rows=await tx.product.findMany({where:{deletedAt:null,sourceImportKey:{not:null},currency:'INR'},orderBy:{id:'asc'},include});
    return {format:1,target,createdAt:new Date().toISOString(),reviewedBy:'',candidates:rows.map(candidate).filter(Boolean)};
  },{timeout:60000});
}
async function applyRepair(db,manifest,target) {
  if(manifest.format!==1 || manifest.target!==target || typeof manifest.reviewedBy!=='string' || manifest.reviewedBy.trim().length<3)throw new Error('A reviewed manifest for this exact database is required.');
  const selected=manifest.candidates.filter(c=>c.approved===true);
  if(new Set(selected.map(c=>c.productId)).size!==selected.length)throw new Error('Duplicate product approvals are not permitted.');
  return db.$transaction(async tx=>{
    const prepared=[];
    for(const row of [...selected].sort((a,b)=>a.productId.localeCompare(b.productId))) {
      if(row.reviewDecision!=='CONFIRMED_IMPORT_DEFAULT_BUG' || typeof row.reviewNote!=='string' || row.reviewNote.trim().length<12)throw new Error('Each approved record needs a confirmed import-default decision and review note.');
      await tx.$queryRawUnsafe('SELECT id FROM "Product" WHERE id=$1 FOR UPDATE',row.productId);
      const product=await tx.product.findUnique({where:{id:row.productId},include});
      if(product?.currency===row.to) {
        const previous=await tx.auditLog.findFirst({where:{entityId:row.productId,action:'PRODUCT_IMPORT_CURRENCY_REPAIRED'},orderBy:{createdAt:'desc'}});
        if(previous?.metadata?.snapshotHash===row.snapshotHash && previous?.afterState?.currency===row.to)continue;
      }
      const fresh=product && candidate(product);
      if(!fresh || fresh.snapshotHash!==row.snapshotHash || fresh.to!==row.to || fresh.tenantId!==row.tenantId || fresh.sourceImportKey!==row.sourceImportKey || row.from!=='INR')throw new Error('Repair inputs changed or are no longer eligible. Generate and review a new manifest.');
      prepared.push(row);
    }
    for(const row of prepared) {
      await tx.product.update({where:{id:row.productId},data:{currency:row.to}});
      await tx.auditLog.create({data:{tenantId:row.tenantId,action:'PRODUCT_IMPORT_CURRENCY_REPAIRED',entityType:'Product',entityId:row.productId,reason:row.reviewNote.trim(),beforeState:{currency:row.from},afterState:{currency:row.to},metadata:{snapshotHash:row.snapshotHash,reviewedBy:manifest.reviewedBy,sourceImportKey:row.sourceImportKey,metadataOnly:true}}});
    }
    return {applied:prepared.length,alreadyApplied:selected.length-prepared.length};
  },{isolationLevel:'Serializable',timeout:60000});
}
module.exports={candidate,planRepair,applyRepair};
if(require.main===module) {
  (async()=>{
    const fs=require('node:fs'),args=process.argv.slice(2),values={};
    for(let i=0;i<args.length;i++){const flag=args[i];if(flag==='--allow-remote-apply'){values[flag]=true;continue;}if(!['--database-url','--plan','--apply'].includes(flag)||!args[i+1])throw new Error('Use --database-url URL and exactly one of --plan OUTPUT or --apply REVIEWED_MANIFEST.');values[flag]=args[++i];}
    if(!values['--database-url'] || !!values['--plan']===!!values['--apply'])throw new Error('An explicit database URL and one operation are required; environment DATABASE_URL is never used.');
    const url=new URL(values['--database-url']);if(!['postgres:','postgresql:'].includes(url.protocol))throw new Error('PostgreSQL URL required.');
    const target=`${url.hostname}:${url.port||5432}${url.pathname}`;
    if(values['--apply'] && !values['--allow-remote-apply'] && !(url.hostname==='127.0.0.1' && url.port==='55445' && /^\/voya_import_fixes_\d+$/.test(url.pathname)))throw new Error('Apply defaults to disposable local staging only. A separately approved remote operation requires --allow-remote-apply and a matching reviewed manifest.');
    const {PrismaClient}=require('@prisma/client'),db=new PrismaClient({datasources:{db:{url:values['--database-url']}}});
    try {if(values['--plan']){const result=await planRepair(db,target);fs.writeFileSync(values['--plan'],JSON.stringify(result,null,2),{flag:'wx',mode:0o600});console.log(JSON.stringify({dryRun:true,candidates:result.candidates.length,target}));}else console.log(JSON.stringify(await applyRepair(db,JSON.parse(fs.readFileSync(values['--apply'],'utf8')),target)));}finally{await db.$disconnect();}
  })().catch(e=>{console.error(e.message);process.exitCode=1;});
}
