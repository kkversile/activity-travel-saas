import { GeminiProvider } from './gemini.provider';

describe('GeminiProvider', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  it('sends the system instruction and JSON response configuration to Gemini', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ modelVersion: 'gemini-3.8-flash', candidates: [{ content: { parts: [{ text: '{"Basic_Info":[]}' }] } }] }),
    });
    global.fetch = fetchMock as any;
    const config = { get: jest.fn().mockImplementation((key: string, fallback?: string) => ({ GEMINI_API_KEY: 'test-key', GEMINI_MODEL: 'gemini-3.8-flash', AI_MAX_RETRIES: '0' }[key] ?? fallback)) };

    const result = await new GeminiProvider(config as any).generate({ system: 'system rules', user: 'activity details' });
    const [url, init] = fetchMock.mock.calls[0];
    const request = JSON.parse(init.body);
    expect(url).toContain('/v1beta/models/gemini-3.8-flash:generateContent?key=test-key');
    expect(request.systemInstruction.parts[0].text).toBe('system rules');
    expect(request.contents[0].parts[0].text).toBe('activity details');
    expect(request.generationConfig.responseMimeType).toBe('application/json');
    expect(result.content).toEqual({ Basic_Info: [] });
    expect(result.metadata).toEqual({ webSearch: false, provider: 'gemini' });
  });

  it('reports an invalid Gemini key without exposing it', async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 403, text: async () => '{"error":{"message":"bad key"}}' }) as any;
    const config = { get: jest.fn().mockImplementation((key: string, fallback?: string) => ({ GEMINI_API_KEY: 'secret-key', GEMINI_MODEL: 'gemini-3.8-flash' }[key] ?? fallback)) };
    await expect(new GeminiProvider(config as any).generate({ system: 's', user: 'u' })).rejects.toThrow('configured Gemini API key was rejected');
  });
});
