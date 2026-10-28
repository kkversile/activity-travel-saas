import { ActivityAiService } from './activity-ai.service';

describe('ActivityAiService', () => {
  afterEach(() => jest.restoreAllMocks());

  it('returns useful conservative suggestions when the provider omits descriptive content', async () => {
    const catalogue = {};
    const prisma = { auditLog: { count: jest.fn().mockResolvedValue(0), create: jest.fn().mockResolvedValue({}) } };
    const config = { get: jest.fn().mockImplementation((key: string, fallback?: string) => key === 'AI_ACTIVITY_ENABLED' ? 'true' : key === 'AI_IMAGE_SEARCH_ENABLED' ? 'false' : fallback) };
    const provider = { generate: jest.fn().mockResolvedValue({ model: 'mock', content: { Basic_Info: [{ product_name: 'Munnar Walk', city: 'Munnar', state: 'Kerala', country: 'India' }], Experience: [{}], Options: [{ description: 'Supplier confirmation required.' }] } }) };
    const service = new ActivityAiService(config as any, catalogue as any, prisma as any, provider as any);
    const result = await service.generate({ sub: 'u1', tenantId: 't1' } as any, { activityName: 'Munnar Walk', city: 'Munnar', state: 'Kerala', country: 'India', category: 'Nature walk', vendorNotes: '' } as any);
    expect(result.draft.Basic_Info[0].short_description).toBeTruthy();
    expect(result.draft.Experience[0].full_description).toBeTruthy();
    expect(result.draft.Experience[0].highlights.length).toBeGreaterThanOrEqual(2);
    expect(result.draft.Options).toHaveLength(1);
    expect(result.draft.Options[0]).toEqual(expect.objectContaining({ option_code: 'STANDARD', option_name: 'Standard experience', product_key: expect.any(String) }));
    expect(result.provenance.promptVersion).toBe('v5-google-maps-photo-assets');
    expect(provider.generate.mock.calls[0][0].system).toContain('Do not leave the descriptive suggestion fields blank');
    expect(provider.generate.mock.calls[0][0].system).toContain('exact Google Maps listing');
    expect(provider.generate.mock.calls[0][0].system).toContain('direct HTTPS image asset URL');
    expect(provider.generate.mock.calls[0][0].system).toContain('!6shttps:%2F%2Flh3.googleusercontent.com');
    expect(JSON.parse(provider.generate.mock.calls[0][0].user)).toEqual({ activityName: 'Munnar Walk', research: { query: 'Munnar Walk', sources: [], imageCandidates: [] } });
    await service.generate({ sub: 'u2', tenantId: 't1' } as any, { activityName: 'Munnar Walk', vendorNotes: 'Supplier-confirmed tea garden route.' } as any);
    expect(JSON.parse(provider.generate.mock.calls[1][0].user)).toEqual({ activityName: 'Munnar Walk', research: { query: 'Munnar Walk', sources: [], imageCandidates: [] } });
  });

  it('geocodes an AI-researched address before returning the draft', async () => {
    const catalogue = {};
    const prisma = { auditLog: { count: jest.fn().mockResolvedValue(0), create: jest.fn().mockResolvedValue({}) } };
    const config = { get: jest.fn().mockImplementation((key: string, fallback?: string) => key === 'AI_ACTIVITY_ENABLED' ? 'true' : key === 'AI_IMAGE_SEARCH_ENABLED' ? 'false' : fallback) };
    const provider = { generate: jest.fn().mockResolvedValue({ model: 'mock', content: { Basic_Info: [{ product_name: 'Harbour Walk', city: 'Gokarna', state: 'Karnataka', country: 'India', address: 'Tadadi Port, Gokarna' }], Experience: [{ full_description: 'A harbour walk.' }], Options: [{ option_code: 'STANDARD', option_name: 'Standard experience' }] } }) };
    const fetchMock = jest.spyOn(globalThis as any, 'fetch').mockResolvedValue({ ok: true, json: async () => [{ lat: '14.5441', lon: '74.3187' }] } as any);
    const service = new ActivityAiService(config as any, catalogue as any, prisma as any, provider as any);
    const result = await service.generate({ sub: 'u1', tenantId: 't1' } as any, { activityName: 'Harbour Walk', city: 'Gokarna', state: 'Karnataka', country: 'India', category: 'Nature walk' } as any);
    expect(String(fetchMock.mock.calls[0][0])).toContain('Tadadi+Port');
    expect(fetchMock.mock.calls[0][1]).toEqual(expect.objectContaining({ headers: expect.objectContaining({ 'User-Agent': expect.stringContaining('VOYA') }) }));
    expect(result.draft.Basic_Info[0]).toEqual(expect.objectContaining({ latitude: 14.5441, longitude: 74.3187 }));
  });

  it('filters Google placeholder avatars and uses reviewable images from an AI-retrieved source page', async () => {
    const catalogue = {};
    const prisma = { auditLog: { count: jest.fn().mockResolvedValue(0), create: jest.fn().mockResolvedValue({}) } };
    const config = { get: jest.fn().mockImplementation((key: string, fallback?: string) => key === 'AI_ACTIVITY_ENABLED' ? 'true' : fallback) };
    const provider = { generate: jest.fn().mockResolvedValue({ model: 'mock', content: {
      Basic_Info: [{ product_name: 'Gokarna Ocean Adventures', city: 'Gokarna', state: 'Karnataka', country: 'India' }],
      Experience: [{ full_description: 'Boat rides and water sports.', additional_information: ['https://gokarnaoceanadventures.com/'] }],
      Options: [{ option_code: 'STANDARD', option_name: 'Standard experience' }],
      Media: [{ kind: 'IMAGE', url: 'https://lh3.googleusercontent.com/ogw/default-user=s83', source_url: 'https://www.google.com/maps/', requires_review: true }],
    } }) };
    const fetchMock = jest.spyOn(globalThis as any, 'fetch')
      .mockResolvedValueOnce({ ok: true, text: async () => 'https://lh3.googleusercontent.com/ogw/default-user=s83' } as any)
      .mockResolvedValueOnce({ ok: true, text: async () => '' } as any)
      .mockResolvedValueOnce({ ok: true, text: async () => '<img src="/images/photos/boat.webp"><img src="/images/brand/logo.webp">' } as any);
    const service = new ActivityAiService(config as any, catalogue as any, prisma as any, provider as any);
    const result = await service.generate({ sub: 'u1', tenantId: 't1' } as any, { activityName: 'Gokarna Ocean Adventures', city: 'Gokarna', state: 'Karnataka', country: 'India', category: 'Water sports' } as any);
    expect(result.draft.Media).toEqual([expect.objectContaining({
      kind: 'IMAGE',
      url: 'https://gokarnaoceanadventures.com/images/photos/boat.webp',
      source_url: 'https://gokarnaoceanadventures.com/',
      requires_review: true,
    })]);
    expect(result.draft.Media.some((media: any) => media.url.includes('default-user'))).toBe(false);
  });

  it('decodes direct Google Maps photo assets embedded as percent-encoded !6s URLs', async () => {
    const catalogue = {};
    const prisma = { auditLog: { count: jest.fn().mockResolvedValue(0), create: jest.fn().mockResolvedValue({}) } };
    const config = { get: jest.fn().mockImplementation((key: string, fallback?: string) => key === 'AI_ACTIVITY_ENABLED' ? 'true' : fallback) };
    const provider = { generate: jest.fn().mockResolvedValue({ model: 'mock', content: {
      Basic_Info: [{ product_name: 'Munnar Adventure Park', city: 'Munnar', state: 'Kerala', country: 'India' }],
      Experience: [{ full_description: 'An adventure park.' }],
      Options: [{ option_code: 'STANDARD', option_name: 'Standard experience' }],
    } }) };
    const fetchMock = jest.spyOn(globalThis as any, 'fetch').mockResolvedValue({
      ok: true,
      text: async () => '!6shttps:%2F%2Flh3.googleusercontent.com%2Fphoto%2Fs1200%3Dw1200-h800-k-no!7i1200!8i800',
    } as any);
    const service = new ActivityAiService(config as any, catalogue as any, prisma as any, provider as any);
    const result = await service.generate({ sub: 'u1', tenantId: 't1' } as any, { activityName: 'Munnar Adventure Park', city: 'Munnar', state: 'Kerala', country: 'India', category: 'Adventure park' } as any);
    expect(result.draft.Media).toEqual([expect.objectContaining({
      kind: 'IMAGE',
      url: 'https://lh3.googleusercontent.com/photo/s1200=w1200-h800-k-no',
      source_url: expect.stringContaining('google.com/maps/search'),
      requires_review: true,
    })]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('uses a Maps photo embedded in an AI-returned listing URL when Google HTML is unavailable', async () => {
    const catalogue = {};
    const prisma = { auditLog: { count: jest.fn().mockResolvedValue(0), create: jest.fn().mockResolvedValue({}) } };
    const config = { get: jest.fn().mockImplementation((key: string, fallback?: string) => key === 'AI_ACTIVITY_ENABLED' ? 'true' : fallback) };
    const mapsUrl = 'https://www.google.com/maps/place/Munnar+Adventure/data=!6shttps:%2F%2Flh3.googleusercontent.com%2Fphoto%2Fs1200%3Dw1200-h800-k-no!7i1200!8i800';
    const provider = { generate: jest.fn().mockResolvedValue({ model: 'mock', content: {
      Basic_Info: [{ product_name: 'Munnar Adventure Park', city: 'Munnar', state: 'Kerala', country: 'India' }],
      Experience: [{ full_description: 'An adventure park.', additional_information: [mapsUrl] }],
      Options: [{ option_code: 'STANDARD', option_name: 'Standard experience' }],
    } }) };
    const fetchMock = jest.spyOn(globalThis as any, 'fetch').mockResolvedValue({ ok: false } as any);
    const service = new ActivityAiService(config as any, catalogue as any, prisma as any, provider as any);
    const result = await service.generate({ sub: 'u1', tenantId: 't1' } as any, { activityName: 'Munnar Adventure Park', city: 'Munnar', state: 'Kerala', country: 'India', category: 'Adventure park' } as any);
    expect(result.draft.Media).toEqual([expect.objectContaining({
      url: 'https://lh3.googleusercontent.com/photo/s1200=w1200-h800-k-no',
      source_url: mapsUrl,
    })]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('persists an accepted descriptive draft through the canonical catalogue APIs', async () => {
    const catalogue = { createDraft: jest.fn().mockResolvedValue({ id: 'p1', revisions: [{ id: 'r1', status: 'DRAFT' }], variants: [] }), updateRevision: jest.fn().mockResolvedValue({}), addMedia: jest.fn().mockResolvedValue({ id: 'm1' }), createVariant: jest.fn().mockResolvedValue({}), get: jest.fn().mockResolvedValue({ id: 'p1', revisions: [{ id: 'r1', status: 'DRAFT', media: [] }], variants: [] }) };
    const prisma = { product: { findFirst: jest.fn().mockResolvedValue(null) } };
    const config = { get: jest.fn().mockImplementation((_key: string, fallback?: string) => fallback) };
    const provider = { generate: jest.fn() };
    const service = new ActivityAiService(config as any, catalogue as any, prisma as any, provider as any);
    const result = await service.saveDraft({ sub: 'u1', tenantId: 't1' } as any, { generationId: 'AI-1', provenance: { webSearchUsed: true, promptVersion: 'v5-google-maps-photo-assets' }, draft: { Basic_Info: [{ product_name: 'Walk', type: 'ACTIVITY', sub_type: 'Tour', city: 'Munnar', state: 'Kerala', country: 'India', short_description: 'Draft' }], Experience: [{ full_description: 'Confirmed description', highlights: ['Family activity'] }], Options: [{ option_code: 'STD', option_name: 'Standard' }], Media: [{ kind: 'IMAGE', url: 'https://images.example.com/walk.jpg', description: 'A guided walk' }] }, acceptedChanges: [] });
    expect(result).toMatchObject({ stage: 'DRAFT_SAVED', productId: 'p1', duplicate: false }); expect(catalogue.createDraft).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ importMode: true, sourceImportKey: 'AI-AI-1' })); expect(catalogue.updateRevision).toHaveBeenCalledWith(expect.anything(), 'r1', expect.objectContaining({ description: 'Confirmed description', type: 'ACTIVITY', subType: 'GUIDED_TOUR', sourcePayload: expect.objectContaining({ ai: expect.objectContaining({ provenance: { webSearchUsed: true, promptVersion: 'v5-google-maps-photo-assets' } }) }) })); expect(catalogue.addMedia).toHaveBeenCalledWith(expect.anything(), 'r1', expect.objectContaining({ kind: 'IMAGE', externalUrl: 'https://images.example.com/walk.jpg', description: 'A guided walk', rank: 1 })); expect(catalogue.createVariant).toHaveBeenCalledTimes(1);
  });

  it('passes a complete supplier payload through the canonical JSON importer', async () => {
    const catalogue = { importJson: jest.fn().mockResolvedValue({ id: 'p2', status: 'DRAFT' }) };
    const prisma = { product: { findFirst: jest.fn() } };
    const config = { get: jest.fn().mockImplementation((_key: string, fallback?: string) => fallback) };
    const service = new ActivityAiService(config as any, catalogue as any, prisma as any, { generate: jest.fn() } as any);
    const draft = { Basic_Info: [{ product_key: 'AI-WALK', product_name: 'Walk', type: 'ACTIVITY', sub_type: 'GUIDED_TOUR', sub_category: 'Nature', city: 'Munnar', state: 'Kerala', country: 'India', meeting_model: 'FIXED_MEETING_POINT', short_description: 'A walk' }], Experience: [{ product_key: 'AI-WALK', full_description: 'Confirmed description' }], Options: [{ product_key: 'AI-WALK', option_code: 'STD', option_name: 'Standard' }] };
    const supplierData = { Rate_Plans: [{ product_key: 'AI-WALK', option_code: 'STD', rate_plan_code: 'RP-STD', rate_plan_name: 'Standard', valid_from: '2026-10-28', valid_to: '2027-10-28', pricing_unit: 'PER_PERSON', adult_price: '1200' }], Availability: [{ product_key: 'AI-WALK', option_code: 'STD', schedule_code: 'SCH-STD', effective_from: '2026-10-28', effective_to: '2027-10-28', operating_days: ['MON'], default_capacity: 50, operating_model: 'MULTIPLE_SLOTS', start_time: '09:00', end_time: '17:00' }] };
    const result = await service.completeImport({ sub: 'u1', tenantId: 't1' } as any, { generationId: 'AI-2', draft, supplierData, acceptedChanges: [] });
    expect(result).toMatchObject({ stage: 'IMPORT_COMPLETE', id: 'p2' });
    expect(catalogue.importJson).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ Rate_Plans: supplierData.Rate_Plans, Availability: supplierData.Availability }), 'AI-AI-2');
  });

  it('rejects complete import before calling the importer when supplier data is incomplete', async () => {
    const catalogue = { importJson: jest.fn() }; const prisma = { product: { findFirst: jest.fn() } }; const config = { get: jest.fn().mockImplementation((_key: string, fallback?: string) => fallback) };
    const service = new ActivityAiService(config as any, catalogue as any, prisma as any, { generate: jest.fn() } as any);
    await expect(service.completeImport({ sub: 'u1', tenantId: 't1' } as any, { generationId: 'AI-3', draft: { Basic_Info: [{ product_name: 'Walk' }], Experience: [{ full_description: 'Description' }], Options: [{ option_code: 'STD', option_name: 'Standard' }] }, supplierData: {}, acceptedChanges: [] })).rejects.toThrow('Complete the supplier fields');
    expect(catalogue.importJson).not.toHaveBeenCalled();
  });

  it('does not enforce the persistent per-user limit when disabled', async () => {
    const prisma = { auditLog: { count: jest.fn().mockResolvedValue(1), create: jest.fn() } };
    const config = { get: jest.fn().mockImplementation((key: string, fallback?: string) => ({ AI_ACTIVITY_ENABLED: 'true', AI_IMAGE_SEARCH_ENABLED: 'false', AI_RATE_LIMIT_ENABLED: 'false', AI_MAX_REQUESTS_PER_USER_PER_DAY: '1' }[key] ?? fallback)) };
    const provider = { generate: jest.fn().mockResolvedValue({ model: 'mock', content: { Basic_Info: [{ product_name: 'Walk' }], Experience: [{}], Options: [] } }) };
    const service = new ActivityAiService(config as any, {} as any, prisma as any, provider as any);
    await expect(service.generate({ sub: 'u1', tenantId: 't1' } as any, { activityName: 'Walk' } as any)).resolves.toBeTruthy();
    expect(provider.generate).toHaveBeenCalledTimes(1);
  });

  it('serializes the persistent check and record when Prisma transactions are available', async () => {
    const tx = { $queryRaw: jest.fn().mockResolvedValue([]), auditLog: { count: jest.fn().mockResolvedValue(0), create: jest.fn().mockResolvedValue({}) } };
    const prisma = { $queryRaw: jest.fn(), $transaction: jest.fn(async (callback: (value: any) => Promise<void>) => callback(tx)), auditLog: tx.auditLog };
    const config = { get: jest.fn().mockImplementation((key: string, fallback?: string) => ({ AI_ACTIVITY_ENABLED: 'true', AI_IMAGE_SEARCH_ENABLED: 'false', AI_RATE_LIMIT_ENABLED: 'true' }[key] ?? fallback)) };
    const provider = { generate: jest.fn().mockResolvedValue({ model: 'mock', content: { Basic_Info: [{ product_name: 'Walk' }], Experience: [{}], Options: [] } }) };
    const service = new ActivityAiService(config as any, {} as any, prisma as any, provider as any);
    await service.generate({ sub: 'u1', tenantId: 't1' } as any, { activityName: 'Walk' } as any);
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(tx.$queryRaw).toHaveBeenCalledTimes(1);
  });
});
