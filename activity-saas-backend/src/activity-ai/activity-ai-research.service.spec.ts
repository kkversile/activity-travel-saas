import { ActivityAiResearchService } from './activity-ai-research.service';

describe('ActivityAiResearchService', () => {
  afterEach(() => jest.restoreAllMocks());

  it('searches the exact activity name with location and a dedicated maps address query', async () => {
    const fetchMock = jest.spyOn(globalThis as any, 'fetch')
      .mockResolvedValueOnce({ ok: true, text: async () => JSON.stringify({}) } as any)
      .mockResolvedValueOnce({ ok: true, text: async () => '<a class="result__a" href="https://duckduckgo.com/l/?uddg=https%3A%2F%2Fexample.com%2Factivity">Exact activity</a>' } as any)
      .mockResolvedValueOnce({ ok: true, text: async () => '<a class="result__a" href="https://duckduckgo.com/l/?uddg=https%3A%2F%2Fmaps.example.com%2Factivity">Maps activity</a>' } as any)
      .mockResolvedValueOnce({ ok: true, text: async () => 'vqd="123"' } as any)
      .mockResolvedValueOnce({ ok: true, text: async () => JSON.stringify({ results: [] }) } as any);

    const packet = await new ActivityAiResearchService().search('Goa Water Sports Activities and Boat Tours', {
      city: 'Goa', state: 'Goa', country: 'India', category: 'Water sports & activities',
    });

    const requestedUrls = fetchMock.mock.calls.map(([url]) => String(url));
    expect(requestedUrls.some((url) => url.includes('%22Goa%20Water%20Sports%20Activities%20and%20Boat%20Tours%22'))).toBe(true);
    expect(requestedUrls.some((url) => url.includes('address%20Google%20Maps'))).toBe(true);
    expect(packet.sources).toEqual(expect.arrayContaining([
      expect.objectContaining({ url: 'https://example.com/activity' }),
      expect.objectContaining({ url: 'https://maps.example.com/activity' }),
    ]));
  });
});
