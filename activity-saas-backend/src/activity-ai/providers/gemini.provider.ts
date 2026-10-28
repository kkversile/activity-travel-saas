import { BadGatewayException, GatewayTimeoutException, Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AiProvider, AiProviderResult } from './ai-provider.interface';
import { parseJsonContent, stripOuterQuotes } from './groq.provider';

type GeminiResponse = {
  candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  modelVersion?: string;
  usageMetadata?: Record<string, unknown>;
};

@Injectable()
export class GeminiProvider implements AiProvider {
  constructor(private readonly config: ConfigService) {}

  async generate(input: { system: string; user: string }): Promise<AiProviderResult> {
    const apiKey = stripOuterQuotes(this.config.get<string>('GEMINI_API_KEY'));
    if (!apiKey) throw new ServiceUnavailableException('AI activity creation is not configured on this server.');

    const model = stripOuterQuotes(this.config.get<string>('GEMINI_MODEL', 'gemini-3.8-flash')) || 'gemini-3.8-flash';
    const timeoutMs = Number(stripOuterQuotes(this.config.get<string>('AI_REQUEST_TIMEOUT_MS', '30000'))) || 30000;
    const maxRetries = Math.min(2, Math.max(0, Number(stripOuterQuotes(this.config.get<string>('AI_MAX_RETRIES', '1'))) || 1));
    const maxOutputTokens = Number(stripOuterQuotes(this.config.get<string>('AI_MAX_COMPLETION_TOKENS', '3500'))) || 3500;
    const thinkingBudget = Math.max(0, Number(stripOuterQuotes(this.config.get<string>('GEMINI_THINKING_BUDGET', '0'))) || 0);
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;

    for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const response = await fetch(endpoint, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            systemInstruction: { parts: [{ text: input.system }] },
            contents: [{ role: 'user', parts: [{ text: input.user }] }],
            generationConfig: {
              temperature: 0.2,
              maxOutputTokens,
              responseMimeType: 'application/json',
              thinkingConfig: { thinkingBudget },
            },
          }),
          signal: controller.signal,
        });

        if (response.status === 401 || response.status === 403) {
          throw new ServiceUnavailableException('The configured Gemini API key was rejected. Replace GEMINI_API_KEY with a valid key.');
        }
        if ((response.status === 429 || response.status >= 500) && attempt < maxRetries) {
          await new Promise((resolve) => setTimeout(resolve, 250 * (attempt + 1)));
          continue;
        }
        if (response.status === 429) throw new BadGatewayException('The AI provider is temporarily rate limited. Try again shortly.');
        if (!response.ok) {
          const providerBody = await response.text();
          let reason = '';
          try {
            const parsed = JSON.parse(providerBody) as { error?: { message?: string } };
            reason = String(parsed.error?.message || '');
          } catch {}
          throw new BadGatewayException(reason ? `The AI provider rejected the request (${response.status}): ${reason}` : `The AI provider could not generate an activity draft (${response.status}).`);
        }

        const payload = await response.json() as GeminiResponse;
        const raw = payload.candidates?.[0]?.content?.parts?.map((part) => part.text || '').join('').trim();
        if (!raw) throw new BadGatewayException('The AI provider returned an empty response.');
        let content: unknown;
        try {
          content = parseJsonContent(raw);
        } catch {
          throw new BadGatewayException('The AI provider returned invalid JSON.');
        }
        return {
          content,
          model: payload.modelVersion || model,
          usage: payload.usageMetadata,
          metadata: { webSearch: false, provider: 'gemini' },
        };
      } catch (error) {
        if (error instanceof ServiceUnavailableException || error instanceof BadGatewayException) throw error;
        if (error instanceof Error && error.name === 'AbortError') throw new GatewayTimeoutException('AI generation timed out.');
        if (attempt < maxRetries) {
          await new Promise((resolve) => setTimeout(resolve, 250 * (attempt + 1)));
          continue;
        }
        throw new BadGatewayException('The AI provider is unavailable.');
      } finally {
        clearTimeout(timer);
      }
    }
    throw new BadGatewayException('The AI provider is unavailable.');
  }
}
