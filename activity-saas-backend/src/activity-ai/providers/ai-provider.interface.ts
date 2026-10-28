export type AiProviderResult = { content: unknown; model: string; usage?: Record<string, unknown>; metadata?: Record<string, unknown> };
export interface AiProvider { generate(input: { system: string; user: string }): Promise<AiProviderResult>; }
