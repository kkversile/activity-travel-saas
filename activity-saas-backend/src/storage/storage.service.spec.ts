import { StorageService } from './storage.service';
import { FilePurpose } from '@prisma/client';
import { mkdtemp, readdir, rm, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';

const send = jest.fn();
jest.mock('@aws-sdk/client-s3', () => ({
  S3Client: jest.fn().mockImplementation(() => ({ send, destroy: jest.fn() })),
  PutObjectCommand: jest.fn().mockImplementation((input) => ({ input })),
  GetObjectCommand: jest.fn().mockImplementation((input) => ({ input })),
  DeleteObjectCommand: jest.fn().mockImplementation((input) => ({ input })),
}));

describe('StorageService', () => {
  const original = { ...process.env }; let root: string;
  beforeEach(async () => {
    process.env = { ...original, STORAGE_DRIVER: 'local' };
    root = await mkdtemp(join(tmpdir(), 'voya-storage-test-')); process.env.STORAGE_ROOT = root;
    delete process.env.STORAGE_S3_PREFIX; send.mockReset();
  });
  afterEach(async () => { if (!root.startsWith(join(tmpdir(), 'voya-storage-test-'))) throw new Error('Unsafe test directory'); await rm(root, { recursive: true, force: true }); process.env = { ...original }; });
  it('round trips private documents and public media through the existing local keys', async () => {
    const storage = new StorageService(); const body = Buffer.from('illustrative document');
    const file = await storage.save(body, FilePurpose.VENDOR_DOCUMENT, '.pdf');
    expect(file.storageKey).toMatch(/^private\/vendor-documents\/[a-f0-9-]+\.pdf$/);
    expect(await storage.read(file.storageKey)).toEqual(body);
    await storage.remove(file.storageKey); await storage.remove(file.storageKey);
    await expect(storage.read(file.storageKey)).rejects.toMatchObject({ code: 'ENOENT' });
  });
  it.each(['../outside', '/absolute', 'C:/secret', 'private/../../secret', 'private\\secret', 'private//file', 'private/./file', ''])('rejects unsafe keys before file IO: %s', async (key) => {
    const storage = new StorageService();
    await expect(storage.read(key)).rejects.toThrow('Invalid storage key');
    await expect(storage.remove(key)).rejects.toThrow('Invalid storage key');
  });
  it('rejects path material in extensions', async () => {
    await expect(new StorageService().save(Buffer.from('x'), FilePurpose.PRODUCT_MEDIA, '/../../bad')).rejects.toThrow('Invalid storage extension');
  });
  function s3() {
    Object.assign(process.env, { STORAGE_DRIVER: 's3', STORAGE_S3_ENDPOINT: 'https://example.invalid', STORAGE_S3_BUCKET: 'voya-private', STORAGE_S3_ACCESS_KEY_ID: 'synthetic', STORAGE_S3_SECRET_ACCESS_KEY: 'synthetic' });
  }
  it('fails closed rather than silently falling back when S3 configuration is incomplete', () => {
    s3(); delete process.env.STORAGE_S3_SECRET_ACCESS_KEY;
    expect(() => new StorageService()).toThrow('explicit storage credentials');
  });
  it('rejects non-loopback plaintext endpoints', () => {
    s3(); process.env.STORAGE_S3_ENDPOINT = 'http://example.invalid';
    expect(() => new StorageService()).toThrow('HTTPS');
  });
  it('round trips private S3 objects without a public ACL or exposing bucket URLs', async () => {
    s3(); process.env.STORAGE_S3_PREFIX = 'release'; const storage = new StorageService();
    send.mockResolvedValueOnce({});
    const file = await storage.save(Buffer.from('private'), FilePurpose.BOOKING_VOUCHER, '.pdf');
    const input = send.mock.calls[0][0].input;
    expect(input).toMatchObject({ Bucket: 'voya-private', Key: 'release/' + file.storageKey, CacheControl: 'no-store', ContentType: 'application/pdf' });
    expect(input).not.toHaveProperty('ACL'); expect(file).not.toHaveProperty('url');
    send.mockResolvedValueOnce({ Body: { transformToByteArray: async () => Buffer.from('private') } });
    expect(await storage.read(file.storageKey)).toEqual(Buffer.from('private'));
    send.mockResolvedValueOnce({}); await storage.remove(file.storageKey); storage.onModuleDestroy();
  });
  it('propagates S3 write and delete failures for retry/diagnostics', async () => {
    s3(); const storage = new StorageService(); send.mockRejectedValue(new Error('Storage unavailable'));
    await expect(storage.save(Buffer.from('x'), FilePurpose.VENDOR_DOCUMENT, '.pdf')).rejects.toThrow('unavailable');
    await expect(storage.remove('private/document.pdf')).rejects.toThrow('unavailable');
  });
  it('probes local write/read/delete permissions without retaining files', async () => {
    const storage = new StorageService(); await storage.checkReadiness(new AbortController().signal);
    expect(await readdir(join(root, 'private/health'))).toEqual([]);
  });
  it('fails readiness when the configured storage cannot create its private directory', async () => {
    const file = join(root, 'not-a-directory'); await writeFile(file, 'occupied'); process.env.STORAGE_ROOT = file;
    await expect(new StorageService().checkReadiness(new AbortController().signal)).rejects.toThrow();
  });
  it('probes the private S3 backend and deletes its own probe', async () => {
    s3(); const storage = new StorageService(); let content: Buffer;
    send.mockImplementation(async (command) => {
      if (command.input.Body) content = command.input.Body;
      return { Body: { transformToByteArray: async () => content } };
    });
    await storage.checkReadiness(new AbortController().signal);
    expect(send).toHaveBeenCalledTimes(3);
    expect(send.mock.calls[0][0].input).toMatchObject({ Key: expect.stringMatching(/^private\/health\/[a-f0-9-]+\.probe$/), CacheControl: 'no-store' });
    expect(send.mock.calls[0][0].input).not.toHaveProperty('ACL');
    expect(send.mock.calls[2][0].input.Key).toBe(send.mock.calls[0][0].input.Key);
  });
  it('detects corrupt S3 reads and still attempts probe cleanup', async () => {
    s3(); send.mockResolvedValueOnce({}).mockResolvedValueOnce({ Body: { transformToByteArray: async () => Buffer.from('corrupt') } }).mockResolvedValueOnce({});
    await expect(new StorageService().checkReadiness(new AbortController().signal)).rejects.toThrow('round-trip failed');
    expect(send).toHaveBeenCalledTimes(3);
  });
});
