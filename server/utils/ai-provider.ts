import OpenAI from "openai";
import { AI_PROVIDERS, EMBEDDING_DIMENSIONS, normalizeProvider, type AIProviderId } from "@shared/ai-providers";

export interface AISettingLike {
  provider?: string | null;
  apiKey?: string | null;
  endpoint?: string | null;
  model?: string | null;
  temperature?: string | number | null;
  maxTokens?: string | number | null;
}

export interface ResolvedAI {
  provider: AIProviderId;
  apiKey: string;
  baseURL: string;
  model: string;
  embeddingModel: string;
  temperature: number;
  maxTokens: number;
  /** extra body fields for chat.completions.create */
  extra: Record<string, any>;
}

/** Endpoint stored in the row is only honoured when it belongs to the chosen
 *  provider (old rows keep api.openai.com even after switching to Gemini). */
function pickEndpoint(provider: AIProviderId, stored?: string | null) {
  const def = AI_PROVIDERS[provider].endpoint;
  if (!stored) return def;
  if (provider === "gemini" && !/googleapis\.com/.test(stored)) return def;
  if (provider === "openai" && /googleapis\.com/.test(stored)) return def;
  return stored.replace(/\/+$/, "");
}

function pickModel(provider: AIProviderId, stored?: string | null) {
  const m = (stored || "").trim();
  if (!m) return AI_PROVIDERS[provider].defaultModel;
  if (provider === "gemini" && !m.startsWith("gemini")) return AI_PROVIDERS.gemini.defaultModel;
  if (provider === "openai" && m.startsWith("gemini")) return AI_PROVIDERS.openai.defaultModel;
  return m;
}

export function resolveAI(s: AISettingLike, fallbackMaxTokens = 2048): ResolvedAI {
  const provider = normalizeProvider(s.provider);
  let maxTokens = parseInt(String(s.maxTokens ?? fallbackMaxTokens), 10) || fallbackMaxTokens;
  const extra: Record<string, any> = {};
  if (provider === "gemini") {
    // Gemini 3 always "thinks"; thinking tokens count toward the output budget,
    // so keep effort low and leave room for the actual reply.
    extra.reasoning_effort = "low";
    maxTokens = Math.max(maxTokens, 2048);
  }
  return {
    provider,
    apiKey: s.apiKey || "",
    baseURL: pickEndpoint(provider, s.endpoint),
    model: pickModel(provider, s.model),
    embeddingModel: AI_PROVIDERS[provider].embeddingModel,
    temperature: parseFloat(String(s.temperature ?? "0.7")) || 0.7,
    maxTokens,
    extra,
  };
}

export function createAIClient(s: AISettingLike) {
  const r = resolveAI(s);
  return { client: new OpenAI({ apiKey: r.apiKey, baseURL: r.baseURL }), resolved: r };
}

export async function chatComplete(
  s: AISettingLike,
  messages: Array<{ role: "system" | "user" | "assistant"; content: string }>,
  overrides: { maxTokens?: number; temperature?: number } = {},
): Promise<string> {
  const { client, resolved } = createAIClient(s);
  const maxTokens = resolved.provider === "gemini"
    ? Math.max(overrides.maxTokens ?? resolved.maxTokens, 2048)
    : overrides.maxTokens ?? resolved.maxTokens;
  const completion = await client.chat.completions.create({
    model: resolved.model,
    messages,
    temperature: overrides.temperature ?? resolved.temperature,
    max_tokens: maxTokens,
    ...resolved.extra,
  } as any);
  return completion.choices?.[0]?.message?.content || "";
}

export async function embedText(s: AISettingLike, text: string): Promise<number[]> {
  const { client, resolved } = createAIClient(s);
  const res = await client.embeddings.create({
    model: resolved.embeddingModel,
    input: text.substring(0, 8000),
    dimensions: EMBEDDING_DIMENSIONS,
  } as any);
  return res.data[0].embedding;
}
