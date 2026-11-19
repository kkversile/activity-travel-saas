import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { FilePurpose } from '@prisma/client';
import { randomUUID } from 'crypto';
import { mkdir, readFile, unlink, writeFile } from 'fs/promises';
import { dirname, resolve } from 'path';
import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';

@Injectable()
export class StorageService implements OnModuleDestroy {
  private readonly root = resolve(process.env.STORAGE_ROOT || resolve(process.cwd(), 'storage'));
  private readonly driver = process.env.STORAGE_DRIVER || 'local';
  private readonly bucket?: string;
  private readonly prefix: string;
  private readonly s3?: S3Client;

  constructor() {
    if (!['local', 's3'].includes(this.driver)) throw new Error('STORAGE_DRIVER must be local or s3');
    this.prefix = (process.env.STORAGE_S3_PREFIX || '').replace(/\/$/, '');
    if (this.prefix) this.validateKey(this.prefix);
    if (this.driver === 's3') {
      const endpoint = new URL(process.env.STORAGE_S3_ENDPOINT || 'invalid:');
      const local = ['127.0.0.1', 'localhost', '[::1]'].includes(endpoint.hostname);
      if (endpoint.protocol !== 'https:' && !(local && endpoint.protocol === 'http:')) throw new Error('S3 requires HTTPS; HTTP is allowed only for loopback rehearsal');
      if (endpoint.username || endpoint.password || endpoint.search || endpoint.hash || endpoint.pathname !== '/') throw new Error('S3 endpoint must be a service origin without credentials, path or query');
      this.bucket = process.env.STORAGE_S3_BUCKET;
      const accessKeyId = process.env.STORAGE_S3_ACCESS_KEY_ID;
      const secretAccessKey = process.env.STORAGE_S3_SECRET_ACCESS_KEY;
      if (!this.bucket || !accessKeyId || !secretAccessKey) throw new Error('S3 bucket and explicit storage credentials are required');
      this.s3 = new S3Client({ endpoint: endpoint.origin, region: process.env.STORAGE_S3_REGION || 'us-east-1',
        credentials: { accessKeyId, secretAccessKey }, forcePathStyle: process.env.STORAGE_S3_FORCE_PATH_STYLE === 'true',
        requestChecksumCalculation: 'WHEN_REQUIRED', responseChecksumValidation: 'WHEN_REQUIRED' });
    }
  }

  private validateKey(key: string) {
    if (!key || key.length > 1024 || !/^[a-zA-Z0-9][a-zA-Z0-9/_.-]*$/.test(key) || key.split('/').some((part) => !part || part === '.' || part === '..')) {
      throw new Error('Invalid storage key');
    }
    return key;
  }
  private objectKey(key: string) { this.validateKey(key); return this.prefix ? `${this.prefix}/${key}` : key; }
  private localPath(key: string) { return resolve(this.root, this.validateKey(key)); }
  private folder(purpose: FilePurpose) {
    if (purpose === FilePurpose.VENDOR_DOCUMENT) return 'private/vendor-documents';
    if (purpose === FilePurpose.BOOKING_VOUCHER) return 'private/vouchers';
    if (purpose === FilePurpose.FULFILMENT_DOCUMENT) return 'private/fulfilment';
    return 'public/product-media';
  }
  async save(buffer: Buffer, purpose: FilePurpose, extension = '') {
    const suffix = extension && !extension.startsWith('.') ? `.${extension}` : extension;
    if (suffix && !/^\.[a-zA-Z0-9]{1,12}$/.test(suffix)) throw new Error('Invalid storage extension');
    const storageKey = `${this.folder(purpose)}/${randomUUID()}${suffix}`;
    if (this.s3) {
      const contentTypes: Record<string, string> = { '.pdf': 'application/pdf', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.json': 'application/json', '.csv': 'text/csv', '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' };
      // All objects remain private, including public product media. The existing
      // authorized/public file API decides what may be served, never a bucket ACL.
      await this.s3.send(new PutObjectCommand({ Bucket: this.bucket, Key: this.objectKey(storageKey), Body: buffer,
        ContentType: contentTypes[suffix.toLowerCase()] || 'application/octet-stream',
        CacheControl: purpose === FilePurpose.PRODUCT_MEDIA ? 'max-age=86400' : 'no-store' }));
    } else {
      const absolute = this.localPath(storageKey);
      await mkdir(dirname(absolute), { recursive: true });
      await writeFile(absolute, buffer, { flag: 'wx' });
    }
    return { storageKey, sizeBytes: buffer.byteLength };
  }
  async read(storageKey: string) {
    if (!this.s3) return readFile(this.localPath(storageKey));
    const result = await this.s3.send(new GetObjectCommand({ Bucket: this.bucket, Key: this.objectKey(storageKey) }));
    if (!result.Body) throw new Error('Storage object has no body');
    return Buffer.from(await result.Body.transformToByteArray());
  }
  async remove(storageKey: string) {
    if (this.s3) { await this.s3.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: this.objectKey(storageKey) })); return; }
    try { await unlink(this.localPath(storageKey)); } catch (error: any) { if (error.code !== 'ENOENT') throw error; }
  }
  onModuleDestroy() { this.s3?.destroy(); }
}
