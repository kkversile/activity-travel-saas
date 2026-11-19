// Actual SDK round trips against our dedicated loopback S3 emulator, no cloud.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { S3Client, CreateBucketCommand, HeadObjectCommand } = require('@aws-sdk/client-s3');
process.env.STORAGE_DRIVER = 's3';
process.env.STORAGE_S3_ENDPOINT = 'http://127.0.0.1:55450';
process.env.STORAGE_S3_REGION = 'us-east-1';
process.env.STORAGE_S3_BUCKET = 'voya-readiness-20261119';
process.env.STORAGE_S3_ACCESS_KEY_ID = 'readiness';
process.env.STORAGE_S3_SECRET_ACCESS_KEY = 'readiness';
process.env.STORAGE_S3_FORCE_PATH_STYLE = 'true';
process.env.STORAGE_S3_PREFIX = 'roundtrip';
const { StorageService } = require('../dist/storage/storage.service');
const { FilePurpose } = require('@prisma/client');
const client = new S3Client({ endpoint: process.env.STORAGE_S3_ENDPOINT, region: 'us-east-1', credentials: { accessKeyId: 'readiness', secretAccessKey: 'readiness' }, forcePathStyle: true, requestChecksumCalculation: 'WHEN_REQUIRED' });
async function main() {
  try { await client.send(new CreateBucketCommand({ Bucket: process.env.STORAGE_S3_BUCKET })); } catch (error) { if (!['BucketAlreadyOwnedByYou','BucketAlreadyExists'].includes(error.name)) throw error; }
  const storage = new StorageService(); const files = [];
  try {
    for (const purpose of [FilePurpose.VENDOR_DOCUMENT, FilePurpose.BOOKING_VOUCHER, FilePurpose.FULFILMENT_DOCUMENT, FilePurpose.PRODUCT_MEDIA]) {
      const body = Buffer.from('DEMONSTRATION STORAGE ONLY: ' + purpose);
      const file = await storage.save(body, purpose, '.pdf'); files.push(file);
      assert.deepEqual(await storage.read(file.storageKey), body);
      const url = `${process.env.STORAGE_S3_ENDPOINT}/${process.env.STORAGE_S3_BUCKET}/roundtrip/${file.storageKey}`;
      const anonymous = await fetch(url);
      assert.equal(anonymous.status, 403, 'Bucket objects must not be anonymously accessible, even public API media');
      const metadata = await client.send(new HeadObjectCommand({ Bucket: process.env.STORAGE_S3_BUCKET, Key: 'roundtrip/' + file.storageKey }));
      assert.equal(metadata.ContentType, 'application/pdf');
    }
    const parallel = await Promise.all(Array.from({ length: 20 }, (_, i) => storage.save(Buffer.from('parallel-' + i), FilePurpose.PRODUCT_MEDIA, '.png')));
    files.push(...parallel); assert.equal(new Set(parallel.map((file) => file.storageKey)).size, 20);
    for (const [i,file] of parallel.entries()) assert.equal((await storage.read(file.storageKey)).toString(), 'parallel-' + i);
    await assert.rejects(storage.read('../private'), /Invalid storage key/);
    const report = { checkedAt: new Date(), endpoint: 'loopback Moto S3 emulator :55450', cloudCredentialsUsed: false, purposeRoundtrips: 4, privateAnonymousReadsDenied: 4, parallelUploads: 20, keyCollisionCount: 0, authorization: 'Existing FilesService remains the access-control boundary' };
    const evidence = process.env.VOYA_REHEARSAL_EVIDENCE_DIR || '../outputs/release-readiness-20261119';fs.mkdirSync(evidence,{recursive:true});
    fs.writeFileSync(path.join(evidence,'object-storage.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));
  } finally { await Promise.all(files.map((file) => storage.remove(file.storageKey))); storage.onModuleDestroy(); client.destroy(); }
}
main().catch((error)=>{console.error(error.message);process.exitCode=1;client.destroy();});
