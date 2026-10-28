import { GroqProvider, parseJsonContent, stripOuterQuotes } from './groq.provider';

describe('GroqProvider', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  it('removes deployment-added quotes from API configuration', () => {
    expect(stripOuterQuotes('"gsk_example"')).toBe('gsk_example');
    expect(stripOuterQuotes("'openai/gpt-oss-20b'")).toBe('openai/gpt-oss-20b');
    expect(stripOuterQuotes('openai/gpt-oss-20b')).toBe('openai/gpt-oss-20b');
  });

  it('accepts a single JSON code fence from a provider that ignores the JSON-only instruction', () => {
    expect(parseJsonContent('```json\n{"ok":true}\n```')).toEqual({ ok: true });
    expect(parseJsonContent('Here is the draft:\n{"ok":true}')).toEqual({ ok: true });
  });

  it('sends normalized quoted credentials to Groq', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ model: 'openai/gpt-oss-20b', choices: [{ message: { content: '{}' } }] }),
    });
    global.fetch = fetchMock as any;
    const config = { get: jest.fn().mockImplementation((key: string, fallback?: string) => ({ GROQ_API_KEY: '"test-key"', GROQ_MODEL: '"openai/gpt-oss-20b"' }[key] ?? fallback)) };
    await new GroqProvider(config as any).generate({ system: 'system', user: 'generate JSON' });
    expect(fetchMock.mock.calls[0][1].headers.authorization).toBe('Bearer test-key');
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).model).toBe('openai/gpt-oss-20b');
  });

  it('uses Groq browser search for the supported GPT-OSS model without structured output mode', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ model: 'openai/gpt-oss-20b', choices: [{ message: { content: '{"Basic_Info":[],"Experience":[],"Options":[],"Rate_Plans":[],"Availability":[],"Media":[],"Booking_Questions":[],"Fulfilment":[]}' } }] }),
    });
    global.fetch = fetchMock as any;
    const config = { get: jest.fn().mockImplementation((key: string, fallback?: string) => ({ GROQ_API_KEY: 'test-key', GROQ_MODEL: 'openai/gpt-oss-20b', GROQ_BROWSER_SEARCH_ENABLED: 'true' }[key] ?? fallback)) };
    const result = await new GroqProvider(config as any).generate({ system: 'system', user: 'search for this activity' });
    const request = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(request.tool_choice).toBe('auto');
    expect(request.tools).toEqual([{ type: 'browser_search' }]);
    expect(request.response_format).toBeUndefined();
    expect(result.metadata).toEqual({ webSearch: true });
  });

  it('keeps JSON mode when web search is enabled with an unsupported model', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ model: 'llama-3.3-70b-versatile', choices: [{ message: { content: '{}' } }] }),
    });
    global.fetch = fetchMock as any;
    const config = { get: jest.fn().mockImplementation((key: string, fallback?: string) => ({ GROQ_API_KEY: 'test-key', GROQ_MODEL: 'llama-3.3-70b-versatile', GROQ_BROWSER_SEARCH_ENABLED: 'true' }[key] ?? fallback)) };
    const result = await new GroqProvider(config as any).generate({ system: 'system', user: 'generate JSON' });
    const request = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(request.response_format).toEqual({ type: 'json_object' });
    expect(request.tools).toBeUndefined();
    expect(result.metadata).toEqual({ webSearch: false });
  });

  it('does not retry a provider 429 when retries are explicitly set to zero', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: false,
      status: 429,
      text: async () => JSON.stringify({ error: { message: 'rate limited' } }),
    });
    global.fetch = fetchMock as any;
    const config = { get: jest.fn().mockImplementation((key: string, fallback?: string) => ({ GROQ_API_KEY: 'test-key', GROQ_MODEL: 'openai/gpt-oss-20b', AI_MAX_RETRIES: '0' }[key] ?? fallback)) };
    await expect(new GroqProvider(config as any).generate({ system: 'system', user: 'generate JSON' })).rejects.toThrow('temporarily rate limited');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
