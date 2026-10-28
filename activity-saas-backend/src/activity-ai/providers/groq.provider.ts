import { BadGatewayException, GatewayTimeoutException, Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AiProvider, AiProviderResult } from './ai-provider.interface';

@Injectable()
export class GroqProvider implements AiProvider {
  constructor(private readonly config: ConfigService) {}
  async generate(input: { system: string; user: string }): Promise<AiProviderResult> {
    const apiKey = stripOuterQuotes(this.config.get<string>('GROQ_API_KEY'));
    if (!apiKey) throw new ServiceUnavailableException('AI activity creation is not configured on this server.');
    const model = stripOuterQuotes(this.config.get<string>('GROQ_MODEL', 'openai/gpt-oss-20b')) || 'openai/gpt-oss-20b';
    const timeoutMs = Number(stripOuterQuotes(this.config.get<string>('AI_REQUEST_TIMEOUT_MS', '30000'))) || 30000;
    const configuredRetries = Number(stripOuterQuotes(this.config.get<string>('AI_MAX_RETRIES', '1')));
    const maxRetries = Math.min(2, Math.max(0, Number.isFinite(configuredRetries) ? configuredRetries : 1));
    // Web research is performed by ActivityAiResearchService before this call.
    // Keep Groq browser tools separately opt-in so an old environment variable
    // cannot trigger tool calls that conflict with JSON mode.
    const webSearchEnabled = stripOuterQuotes(this.config.get<string>('GROQ_BROWSER_SEARCH_ENABLED', 'false')).toLowerCase() === 'true';
    const webSearchModels = new Set(['openai/gpt-oss-20b', 'openai/gpt-oss-120b', 'openai/gpt-oss-safeguard-20b']);
    const useWebSearch = webSearchEnabled && webSearchModels.has(model);
    for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
      const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const requestBody: Record<string, unknown> = {
          model,
          temperature: useWebSearch ? 0.3 : 0.2,
          max_completion_tokens: Number(stripOuterQuotes(this.config.get<string>('AI_MAX_COMPLETION_TOKENS', useWebSearch ? '5000' : '3500'))) || (useWebSearch ? 5000 : 3500),
          messages: [{ role: 'system', content: input.system }, { role: 'user', content: input.user }],
        };
        // Groq browser search and structured outputs cannot be used together. When enabled,
        // require the supported model to research the activity and return a final JSON object
        // after it has completed its internal browser-search loop.
        if (useWebSearch) {
          // Let the model decide whether browser search is needed. Forcing a
          // tool call makes otherwise valid JSON-only generations fail with
          // Groq's `tool_use_failed` response.
          requestBody.tool_choice = 'auto';
          requestBody.tools = [{ type: 'browser_search' }];
          requestBody.reasoning_effort = 'low';
        } else {
          requestBody.response_format = { type: 'json_object' };
        }
        const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
          method: 'POST', headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
          body: JSON.stringify(requestBody), signal: controller.signal,
        });
        if (response.status === 401) throw new ServiceUnavailableException('The configured Groq API key was rejected. Replace GROQ_API_KEY with a valid key.');
        if ((response.status === 429 || response.status >= 500) && attempt < maxRetries) { await new Promise((resolve) => setTimeout(resolve, 250 * (attempt + 1))); continue; }
        if (response.status === 429) throw new BadGatewayException('The AI provider is temporarily rate limited. Try again shortly.');
        if (!response.ok) {
          const providerBody = await response.text();
          let reason = '';
          try { reason = String((JSON.parse(providerBody) as any)?.error?.message || ''); } catch {}
          throw new BadGatewayException(reason ? `The AI provider rejected the request (${response.status}): ${reason}` : `The AI provider could not generate an activity draft (${response.status}).`);
        }
        const payload = await response.json() as { choices?: Array<{ message?: { content?: string } }>; model?: string; usage?: Record<string, unknown> };
        const raw = payload.choices?.[0]?.message?.content;
        if (!raw) throw new BadGatewayException('The AI provider returned an empty response.');
        let content: unknown;
        try { content = parseJsonContent(raw); } catch { throw new BadGatewayException('The AI provider returned invalid JSON.'); }
        return { content, model: payload.model || model, usage: payload.usage, metadata: { webSearch: useWebSearch } };
      } catch (error) {
        if (error instanceof ServiceUnavailableException || (error instanceof BadGatewayException && !/unavailable/i.test(error.message))) throw error;
        if (error instanceof Error && error.name === 'AbortError') throw new GatewayTimeoutException('AI generation timed out.');
        if (attempt < maxRetries) { await new Promise((resolve) => setTimeout(resolve, 250 * (attempt + 1))); continue; }
        throw new BadGatewayException('The AI provider is unavailable.');
      } finally { clearTimeout(timer); }
    }
    throw new BadGatewayException('The AI provider is unavailable.');
  }
}

/**
 * ConfigService can expose dotenv values with their surrounding quotes when a
 * deployment injects a quoted .env value. Quotes are syntax, not part of the
 * API key/model, so normalize them at the provider boundary.
 */
export function stripOuterQuotes(value?: string): string {
  const trimmed = String(value ?? '').trim();
  if (trimmed.length >= 2) {
    const first = trimmed[0];
    const last = trimmed[trimmed.length - 1];
    if ((first === '"' && last === '"') || (first === "'" && last === "'")) return trimmed.slice(1, -1).trim();
  }
  return trimmed;
}

export function parseJsonContent(raw: string): unknown {
  const trimmed = raw.trim();
  try { return JSON.parse(trimmed); } catch {}
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  if (fenced) return JSON.parse(fenced[1]);
  const objectStart = trimmed.indexOf('{');
  const objectEnd = trimmed.lastIndexOf('}');
  if (objectStart >= 0 && objectEnd > objectStart) return JSON.parse(trimmed.slice(objectStart, objectEnd + 1));
  throw new Error('Invalid JSON content');
}
