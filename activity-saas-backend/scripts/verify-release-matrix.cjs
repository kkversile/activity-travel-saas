// All data-changing historical verifiers are confined to our synthetic database.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { execFileSync } = require('node:child_process');
const { spawnSync } = require('node:child_process');
const url = new URL(process.env.DATABASE_URL || 'invalid:');
assert(url.hostname === '127.0.0.1' && url.port === '55439' && url.pathname === '/voya_readiness_clean_20261119' && url.username === 'voya_local', 'Only the dedicated clean synthetic readiness template is allowed');
Object.assign(process.env, { NODE_ENV: 'test', JWT_SECRET: 'readiness-isolated-development-secret-20261119', SECRET_ENCRYPTION_KEY: '45'.repeat(32),
  STORAGE_DRIVER: 'local', STORAGE_ROOT: path.join(os.tmpdir(),'voya-readiness-storage-20261119'), DISABLE_SCHEDULED_WORKERS: 'true',
  SMTP_HOST: '', SMTP_USER: '', SMTP_PASSWORD: '', EMAIL_OTP_WEBHOOK_URL: '', AI_ACTIVITY_ENABLED: 'false' });
const evidence = path.resolve('../outputs/release-readiness-20261119'); fs.mkdirSync(evidence,{recursive:true});
const tasks=['verify:phase4-1','verify:phase4-2','verify:phase5','verify:phase6','verify:phase6-2','verify:phase7','verify:phase7-1',
  'verify:phase8','verify:phase8-1','verify:phase8-2','verify:phase9','verify:phase10','verify:phase10-1','verify:phase10-2',
  'verify:phase11','verify:phase11-1','verify:phase11-2','verify:phase12','verify:phase12-1'];
const requested=process.argv.find((arg)=>arg.startsWith('--only='))?.split('=')[1].split(',');
const selected=requested||tasks; assert(selected.every((task)=>tasks.includes(task)));
const scripts=require('../package.json').scripts;
const results=[];
for(const task of selected){
  const file=scripts[task].match(/^(?:tsx|node -r ts-node\/register\/transpile-only) (scripts\/[a-zA-Z0-9-]+\.ts)$/)?.[1]; assert(file,'Unexpected verifier command');
  const log=path.join(evidence,task.replaceAll(':','-')+'.log'); const fd=fs.openSync(log,'w'); const start=Date.now();
  // Nest's constructor injection requires decorator metadata, which the tsx
  // transform omits. Use the TypeScript compiler for the real service harness.
  // Real workers consume queued jobs. Give every phase its own PostgreSQL copy,
  // so earlier verifiers cannot consume another phase's voucher or settlement.
  const database = 'voya_readiness_phase_' + task.replace(/[^0-9a-z]/g, '_') + '_' + Date.now();
  const pg = process.env.VOYA_PG_BIN || 'C:/Program Files/PostgreSQL/16/bin';
  const pgEnv = { ...process.env, PGHOST: '127.0.0.1', PGPORT: '55439', PGUSER: 'voya_local', PGPASSWORD: '' };
  execFileSync(path.join(pg, 'createdb.exe'), ['--template=voya_readiness_clean_20261119', database], { env: pgEnv, windowsHide: true });
  const isolatedUrl = new URL(url); isolatedUrl.pathname = '/' + database;
  const child=spawnSync(process.execPath,['-r',require.resolve('ts-node/register/transpile-only'),file],{env:{...process.env,DATABASE_URL:isolatedUrl.toString()},stdio:['ignore',fd,fd],timeout:180000,windowsHide:true});fs.closeSync(fd);
  const result={task,exitCode:child.status,seconds:(Date.now()-start)/1000,pass:child.status===0,error:child.error?.message};results.push(result);
  console.log(JSON.stringify(result));
  if (child.status === 0) execFileSync(path.join(pg, 'dropdb.exe'), [database], { env: pgEnv, windowsHide: true });
  else result.retainedFailureDatabase = database;
}
fs.writeFileSync(path.join(evidence,requested?'phase-matrix-retry.json':'phase-matrix.json'),JSON.stringify({checkedAt:new Date(),database:'isolated loopback :55439'+url.pathname,liveConnections:false,results},null,2));
if(results.some((result)=>!result.pass))process.exitCode=1;
