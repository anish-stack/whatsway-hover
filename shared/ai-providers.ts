/** AI providers supported by HoverChat. All are called through the
 *  OpenAI-compatible Chat Completions API (Gemini exposes one at
 *  generativelanguage.googleapis.com/v1beta/openai/). */
export const AI_PROVIDERS = {
  gemini: {
    label: "Google Gemini",
    endpoint: "https://generativelanguage.googleapis.com/v1beta/openai",
    defaultModel: "gemini-3.8-flash",
    embeddingModel: "gemini-embedding-001",
    keyPlaceholder: "AIza...",
    keyHelp: "Get a key at aistudio.google.com/apikey",
    models: [
      { value: "gemini-3.8-flash", label: "Gemini 3.8 Flash (recommended)" },
      { value: "gemini-3.6-flash", label: "Gemini 3.6 Flash" },
      { value: "gemini-3.5-flash-lite", label: "Gemini 3.5 Flash-Lite (cheapest)" },
      { value: "gemini-3.1-flash-lite", label: "Gemini 3.1 Flash-Lite" },
      { value: "gemini-3.1-pro-preview", label: "Gemini 3.1 Pro (preview)" },
    ],
  },
  openai: {
    label: "OpenAI",
    endpoint: "https://api.openai.com/v1",
    defaultModel: "gpt-4o-mini",
    embeddingModel: "text-embedding-3-small",
    keyPlaceholder: "sk-...",
    keyHelp: "Get a key at platform.openai.com/api-keys",
    models: [
      { value: "gpt-4.1", label: "GPT-4.1" },
      { value: "gpt-4.1-mini", label: "GPT-4.1 Mini" },
      { value: "gpt-4.1-nano", label: "GPT-4.1 Nano" },
      { value: "gpt-4o", label: "GPT-4o" },
      { value: "gpt-4o-mini", label: "GPT-4o Mini" },
    ],
  },
} as const;

export type AIProviderId = keyof typeof AI_PROVIDERS;
export const DEFAULT_AI_PROVIDER: AIProviderId = "gemini";
/** Embedding vector size used for every provider so stored vectors stay comparable in length. */
export const EMBEDDING_DIMENSIONS = 1536;

export function normalizeProvider(p?: string | null): AIProviderId {
  return p && p in AI_PROVIDERS ? (p as AIProviderId) : "openai";
}
