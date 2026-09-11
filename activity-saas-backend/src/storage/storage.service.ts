import { Injectable } from '@nestjs/common';
import { FilePurpose } from '@prisma/client';
import { randomUUID } from 'crypto';
import { mkdir, readFile, unlink, writeFile } from 'fs/promises';
import { join } from 'path';

@Injectable()
export class StorageService {
  private readonly root = join(process.cwd(), 'storage');
  private folder(purpose: FilePurpose) {
    if (purpose === FilePurpose.VENDOR_DOCUMENT) return 'private/vendor-documents';
    if (purpose === FilePurpose.BOOKING_VOUCHER) return 'private/vouchers';
    if (purpose === FilePurpose.FULFILMENT_DOCUMENT) return 'private/fulfilment';
    return 'public/product-media';
  }
  async save(buffer: Buffer, purpose: FilePurpose, extension = '') {
    const storageKey = `${this.folder(purpose)}/${randomUUID()}${extension.startsWith('.') ? extension : extension ? `.${extension}` : ''}`;
    const absolute = join(this.root, storageKey);
    await mkdir(join(absolute, '..'), { recursive: true });
    await writeFile(absolute, buffer, { flag: 'wx' });
    return { storageKey, sizeBytes: buffer.byteLength };
  }
  read(storageKey: string) { return readFile(join(this.root, storageKey)); }
  remove(storageKey: string) { return unlink(join(this.root, storageKey)).catch(() => undefined); }
}
