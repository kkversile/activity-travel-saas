import { validate } from 'class-validator';
import { ProductRevisionStatus, ProductStatus, ProductType, UserRole, VariantStatus } from '@prisma/client';
import { ArchiveVariantDto, CreateProductDraftDto, CreateProductRevisionDto, ProductRevisionDto, UpdateVariantDto } from './catalogue.dto';
import { CatalogueService, sourcePayloadForRole } from './catalogue.service';

const vendor = { sub: 'u1', email: 'vendor@test', role: UserRole.VENDOR, tenantId: 't1' } as any;
const admin = { sub: 'a1', email: 'admin@test', role: UserRole.SUPER_ADMIN, tenantId: null } as any;
const baseRevision = { id: 'r1', productId: 'p1', versionNumber: 1, status: ProductRevisionStatus.DRAFT, productName: 'Test', type: ProductType.ACTIVITY, subType: 'TOUR', description: 'Description', media: [], faqs: [], sourcePayload: null } as any;

function make() {
  const tx: any = { productRevision: { findFirst: jest.fn(), findUnique: jest.fn(), update: jest.fn(), updateMany: jest.fn(), create: jest.fn(), aggregate: jest.fn().mockResolvedValue({ _max: { versionNumber: 2 } }), findUniqueOrThrow: jest.fn() }, productMedia: { create: jest.fn(), findFirst: jest.fn(), update: jest.fn(), createMany: jest.fn(), aggregate: jest.fn().mockResolvedValue({ _max: { rank: 0 } }) }, fileAsset: { create: jest.fn() }, productVariant: { updateMany: jest.fn(), findUniqueOrThrow: jest.fn() }, product: { update: jest.fn(), findUniqueOrThrow: jest.fn() }, $queryRaw: jest.fn() };
  const prisma: any = { productRevision: { findFirst: jest.fn(), findFirstOrThrow: jest.fn() }, productMedia: { create: jest.fn() }, fileAsset: { findFirst: jest.fn() }, productVariant: { findFirst: jest.fn() }, product: { findFirst: jest.fn().mockResolvedValue({ id: 'p1', tenantId: 't1' }) }, $transaction: jest.fn((cb: any) => cb(tx)) };
  const storage: any = { save: jest.fn().mockResolvedValue({ storageKey: 'product-media/x.jpg', sizeBytes: 10 }), remove: jest.fn() };
  const audit: any = { write: jest.fn() }; const outbox: any = { enqueue: jest.fn() }; const catalogueEmail: any = { notifyAdminEdited: jest.fn().mockResolvedValue(undefined) };
  return { service: new CatalogueService(prisma, audit, outbox, storage, undefined, undefined, undefined, undefined, undefined, undefined, catalogueEmail), prisma, tx, storage, audit, outbox, catalogueEmail };
}

describe('Phase 2.2 revision and media immutability', () => {
  it('strips Admin-only product metadata from vendor-created products', () => { const submitted = { admin: { rankingBoost: 'PLUS_TWO' }, adminEdit: { editedByAdmin: true, lastEditedByName: 'Spoofed' }, prototype: { durationValue: '3' } }; expect(sourcePayloadForRole(UserRole.VENDOR, submitted)).toEqual({ prototype: { durationValue: '3' } }); expect(sourcePayloadForRole(UserRole.ADMIN, submitted)).toEqual(submitted); });
  it('updates a DRAFT revision under a row lock and audits the result', async () => { const s = make(); s.prisma.productRevision.findFirst.mockResolvedValue(baseRevision); s.tx.productRevision.findUnique.mockResolvedValue(baseRevision); s.tx.productRevision.update.mockResolvedValue({ ...baseRevision, description: 'Updated' }); await expect(s.service.updateRevision(vendor, 'r1', { description: 'Updated' } as any)).resolves.toMatchObject({ description: 'Updated' }); expect(s.tx.$queryRaw).toHaveBeenCalled(); expect(s.tx.productRevision.update).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'r1' } })); expect(s.audit.write).toHaveBeenCalled(); });
  it('prevents vendor revision edits from replacing Admin ranking metadata', async () => { const s = make(); const current = { ...baseRevision, sourcePayload: { admin: { rankingBoost: 'PLUS_TWO' }, prototype: { followItinerary: true } } }; s.prisma.productRevision.findFirst.mockResolvedValue(current); s.tx.productRevision.findUnique.mockResolvedValue(current); s.tx.productRevision.update.mockImplementation(({ data }: any) => Promise.resolve({ ...current, ...data })); await s.service.updateRevision(vendor, 'r1', { sourcePayload: { admin: { rankingBoost: 'NONE' }, prototype: { followItinerary: false } } } as any); expect(s.tx.productRevision.update).toHaveBeenCalledWith(expect.objectContaining({ data: { sourcePayload: { admin: { rankingBoost: 'PLUS_TWO' }, prototype: { followItinerary: false } } } })); });
  it('preserves the trusted Admin edit marker when a vendor saves revision metadata', async () => {
    const s = make();
    const current = { ...baseRevision, sourcePayload: { adminEdit: { editedByAdmin: true, lastEditedByName: 'Ops Admin' }, prototype: { followItinerary: true } } };
    s.prisma.productRevision.findFirst.mockResolvedValue(current);
    s.tx.productRevision.findUnique.mockResolvedValue(current);
    s.tx.productRevision.update.mockImplementation(({ data }: any) => Promise.resolve({ ...current, ...data }));
    await s.service.updateRevision(vendor, 'r1', { sourcePayload: { adminEdit: { editedByAdmin: false }, prototype: { followItinerary: false } } } as any);
    expect(s.tx.productRevision.update).toHaveBeenCalledWith(expect.objectContaining({ data: { sourcePayload: { adminEdit: { editedByAdmin: true, lastEditedByName: 'Ops Admin' }, prototype: { followItinerary: false } } } }));
  });
  it('detects Admin changes stored only inside product source payloads', async () => {
    const s = make();
    const standardAdmin = { sub: 'admin-1', email: 'admin@test', fullName: 'Ops Admin', role: UserRole.ADMIN, tenantId: null } as any;
    const current = { ...baseRevision, tenantId: 't1', sourcePayload: { prototype: { durationValue: '2', durationUnit: 'hours' } } };
    s.prisma.productRevision.findFirst.mockResolvedValue({ product: { tenantId: 't1' } });
    s.tx.productRevision.findUnique.mockResolvedValue(current);
    s.tx.productRevision.update.mockImplementation(({ data }: any) => Promise.resolve({ ...current, ...data }));
    await s.service.updateRevision(standardAdmin, 'r1', { sourcePayload: { prototype: { durationValue: '3', durationUnit: 'hours' } } } as any);
    expect(s.audit.write).toHaveBeenCalledWith(s.tx, expect.objectContaining({ action: 'PRODUCT_REVISION_ADMIN_EDITED', metadata: expect.objectContaining({ changedFields: ['sourcePayload.prototype.durationValue'] }) }));
    expect(s.catalogueEmail.notifyAdminEdited).toHaveBeenCalledWith('r1', 'Ops Admin');
  });
  it('tags, audits, queues notification for, and emails a vendor after normal Admin content edits', async () => {
    const s = make();
    const standardAdmin = { sub: 'admin-1', email: 'admin@test', fullName: 'Ops Admin', role: UserRole.ADMIN, tenantId: null } as any;
    const current = { ...baseRevision, tenantId: 't1', description: 'Original description', sourcePayload: { prototype: { followItinerary: true } } };
    s.prisma.productRevision.findFirst.mockResolvedValue({ product: { tenantId: 't1' } });
    s.tx.productRevision.findUnique.mockResolvedValue(current);
    s.tx.productRevision.update.mockImplementation(({ data }: any) => Promise.resolve({ ...current, ...data }));
    await expect(s.service.updateRevision(standardAdmin, 'r1', { description: 'Admin corrected description' } as any)).resolves.toMatchObject({ description: 'Admin corrected description', sourcePayload: expect.objectContaining({ adminEdit: expect.objectContaining({ editedByAdmin: true, lastEditedById: 'admin-1', lastEditedByName: 'Ops Admin' }) }) });
    expect(s.audit.write).toHaveBeenCalledWith(s.tx, expect.objectContaining({ action: 'PRODUCT_REVISION_ADMIN_EDITED', metadata: { editedByAdmin: true, changedFields: ['description'] } }));
    expect(s.outbox.enqueue).toHaveBeenCalledWith(s.tx, expect.objectContaining({ tenantId: 't1', eventType: 'PRODUCT_ADMIN_EDITED', payload: expect.objectContaining({ productId: 'p1', revisionId: 'r1', editorId: 'admin-1', changedFields: ['description'] }) }));
    expect(s.catalogueEmail.notifyAdminEdited).toHaveBeenCalledWith('r1', 'Ops Admin');
  });
  it('tags and notifies the vendor when an Admin edits revision media', async () => {
    const s = make();
    const standardAdmin = { sub: 'admin-1', email: 'admin@test', fullName: 'Ops Admin', role: UserRole.ADMIN, tenantId: null } as any;
    s.prisma.productRevision.findFirst.mockResolvedValue({ ...baseRevision, product: { tenantId: 't1' } });
    s.tx.productRevision.findFirst.mockResolvedValue(baseRevision);
    s.tx.productRevision.findUnique.mockResolvedValue({ ...baseRevision, product: { tenantId: 't1' }, sourcePayload: null });
    s.tx.productMedia.create.mockResolvedValue({ id: 'm1', revisionId: 'r1', kind: 'VIDEO' });
    await expect(s.service.addMedia(standardAdmin, 'r1', { kind: 'VIDEO', externalUrl: 'https://example.com/video' } as any)).resolves.toMatchObject({ id: 'm1' });
    expect(s.tx.productRevision.update).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'r1' }, data: { sourcePayload: expect.objectContaining({ adminEdit: expect.objectContaining({ editedByAdmin: true, lastEditedByName: 'Ops Admin', changedFields: ['photos.m1'] }) }) } }));
    expect(s.audit.write).toHaveBeenCalledWith(s.tx, expect.objectContaining({ action: 'PRODUCT_ADMIN_EDITED', entityId: 'r1' }));
    expect(s.outbox.enqueue).toHaveBeenCalledWith(s.tx, expect.objectContaining({ eventType: 'PRODUCT_ADMIN_EDITED', aggregateId: 'r1' }));
    expect(s.catalogueEmail.notifyAdminEdited).toHaveBeenCalledWith('r1', 'Ops Admin');
  });
  it('rejects an update when submit wins before the row lock is released', async () => { const s = make(); s.prisma.productRevision.findFirst.mockResolvedValue({ ...baseRevision, status: ProductRevisionStatus.DRAFT }); s.tx.productRevision.findUnique.mockResolvedValue({ ...baseRevision, status: ProductRevisionStatus.UNDER_REVIEW }); await expect(s.service.updateRevision(vendor, 'r1', { description: 'stale' } as any)).rejects.toMatchObject({ status: 409 }); expect(s.tx.productRevision.update).not.toHaveBeenCalled(); });
  it.each([ProductRevisionStatus.UNDER_REVIEW, ProductRevisionStatus.REJECTED, ProductRevisionStatus.PUBLISHED, ProductRevisionStatus.SUPERSEDED])('blocks external media on %s revisions', async (status) => { const s = make(); s.prisma.productRevision.findFirst.mockResolvedValue({ ...baseRevision, status }); await expect(s.service.addMedia(vendor, 'r1', { kind: 'IMAGE', externalUrl: 'https://example.com/a.jpg' })).rejects.toMatchObject({ status: 409 }); expect(s.tx.productMedia.create).not.toHaveBeenCalled(); });
  it.each([ProductRevisionStatus.UNDER_REVIEW, ProductRevisionStatus.REJECTED, ProductRevisionStatus.PUBLISHED])('blocks media archive on %s revisions', async (status) => { const s = make(); s.prisma.productRevision.findFirst.mockResolvedValue({ ...baseRevision, status }); await expect(s.service.archiveMedia(vendor, 'r1', 'm1')).rejects.toMatchObject({ status: 409 }); expect(s.tx.productMedia.update).not.toHaveBeenCalled(); });
  it('rejects unverified external images on DRAFT revisions', async () => { const s = make(); s.prisma.productRevision.findFirst.mockResolvedValue(baseRevision); await expect(s.service.addMedia(vendor, 'r1', { kind: 'IMAGE', externalUrl: 'https://example.com/a.jpg' })).rejects.toMatchObject({ status: 409 }); expect(s.tx.productMedia.create).not.toHaveBeenCalled(); });
  it('cleans physical storage when media transaction fails', async () => { const s = make(); s.prisma.productRevision.findFirst.mockResolvedValue(baseRevision); s.tx.productRevision.findFirst.mockResolvedValue(baseRevision); s.tx.fileAsset.create.mockRejectedValue(new Error('db failure')); await expect(s.service.uploadMedia(vendor, 'r1', { buffer: Buffer.from([0xff, 0xd8, 0xff, 0x00]), size: 4, originalname: 'claimed.png' }, { kind: 'IMAGE' } as any)).rejects.toThrow('db failure'); expect(s.storage.remove).toHaveBeenCalledWith('product-media/x.jpg'); });
  it('does not accept upload media on UNDER_REVIEW even when the file is valid', async () => { const s = make(); s.prisma.productRevision.findFirst.mockResolvedValue({ ...baseRevision, status: ProductRevisionStatus.UNDER_REVIEW }); await expect(s.service.uploadMedia(vendor, 'r1', { buffer: Buffer.from([0xff, 0xd8, 0xff]), size: 3 }, { kind: 'IMAGE' } as any)).rejects.toMatchObject({ status: 409 }); expect(s.storage.save).not.toHaveBeenCalled(); });
  it('defaults correction source to a newer rejected revision', async () => { const s = make(); const rejected = { ...baseRevision, id: 'r2', versionNumber: 2, status: ProductRevisionStatus.REJECTED, description: 'Vendor correction', media: [] }; s.tx.productRevision.findFirst.mockResolvedValueOnce(null).mockResolvedValueOnce(null).mockResolvedValueOnce(rejected); s.tx.productRevision.create.mockResolvedValue({ id: 'r3', productId: 'p1', versionNumber: 3, status: ProductRevisionStatus.DRAFT }); await expect(s.service.createRevision(vendor, 'p1')).resolves.toMatchObject({ versionNumber: 3 }); expect(s.tx.productRevision.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ description: 'Vendor correction', versionNumber: 3 }) })); });
  it('rejects an explicit source revision belonging to another Product', async () => { const s = make(); s.tx.productRevision.findFirst.mockResolvedValueOnce(null).mockResolvedValueOnce(null); await expect(s.service.createRevision(vendor, 'p1', { sourceRevisionId: 'other-product-revision' })).rejects.toMatchObject({ status: 409 }); expect(s.tx.productRevision.create).not.toHaveBeenCalled(); });
  it('rejects stale Variant updates atomically', async () => { const s = make(); s.prisma.productVariant.findFirst.mockResolvedValue({ id: 'v1', productId: 'p1', product: { tenantId: 't1' }, status: VariantStatus.ACTIVE, archivedAt: null, version: 3 }); s.tx.productVariant.updateMany.mockResolvedValue({ count: 0 }); await expect(s.service.updateVariant(vendor, 'v1', { expectedVersion: 2, name: 'stale' })).rejects.toMatchObject({ status: 409 }); });
  it('blocks edits and archives of options attached to immutable revisions', async () => {
    const s = make();
    s.prisma.productVariant.findFirst.mockResolvedValue({ id: 'v1', productId: 'p1', revisionId: 'r1', product: { tenantId: 't1' }, status: VariantStatus.ACTIVE, archivedAt: null, version: 3 });
    s.tx.productRevision.findUniqueOrThrow.mockResolvedValue({ id: 'r1', status: ProductRevisionStatus.PUBLISHED });
    await expect(s.service.updateVariant(vendor, 'v1', { expectedVersion: 3, name: 'changed' })).rejects.toMatchObject({ status: 409 });
    await expect(s.service.archiveVariant(vendor, 'v1', { expectedVersion: 3 })).rejects.toMatchObject({ status: 409 });
    expect(s.tx.productVariant.updateMany).not.toHaveBeenCalled();
  });
  it('rejects the second archive with a stale expected version', async () => { const s = make(); s.prisma.productVariant.findFirst.mockResolvedValue({ id: 'v1', productId: 'p1', product: { tenantId: 't1' }, status: VariantStatus.ACTIVE, archivedAt: null, version: 3 }); s.tx.productVariant.updateMany.mockResolvedValue({ count: 0 }); await expect(s.service.archiveVariant(vendor, 'v1', { expectedVersion: 3 })).rejects.toMatchObject({ status: 409 }); });
  it('requires expectedVersion and omits variantCode from update DTO', async () => { const updateErrors = await validate(Object.assign(new UpdateVariantDto(), { name: 'x' })); expect(updateErrors.some((error) => error.property === 'expectedVersion')).toBe(true); expect('variantCode' in new UpdateVariantDto()).toBe(false); const archiveErrors = await validate(new ArchiveVariantDto()); expect(archiveErrors.some((error) => error.property === 'expectedVersion')).toBe(true); expect(new CreateProductRevisionDto()).toBeDefined(); });
  it('accepts channel strings for create and revision updates while rejecting non-string values', async () => { const createErrors = await validate(Object.assign(new CreateProductDraftDto(), { channels: ['WEBSITE_APP', 'TRAVEL_AGENTS', 'API_PARTNERS'] })); const updateErrors = await validate(Object.assign(new ProductRevisionDto(), { channels: ['LEGACY_CHANNEL', 12] })); expect(createErrors.some((error) => error.property === 'channels')).toBe(false); expect(updateErrors.some((error) => error.property === 'channels')).toBe(true); });
  it('keeps the product live while a corrected revision remains a draft', async () => { const s = make(); const published = { ...baseRevision, id: 'r1', status: ProductRevisionStatus.PUBLISHED }; const rejected = { ...baseRevision, id: 'r2', versionNumber: 2, status: ProductRevisionStatus.REJECTED, media: [] }; s.tx.productRevision.findFirst.mockResolvedValueOnce(null).mockResolvedValueOnce(published).mockResolvedValueOnce(rejected).mockResolvedValueOnce(rejected); s.tx.productRevision.create.mockResolvedValue({ id: 'r3', productId: 'p1', versionNumber: 3, status: ProductRevisionStatus.DRAFT }); await expect(s.service.createRevision(vendor, 'p1', { sourceRevisionId: 'r2' })).resolves.toMatchObject({ status: ProductRevisionStatus.DRAFT }); expect(s.tx.product.update).not.toHaveBeenCalled(); });
});
