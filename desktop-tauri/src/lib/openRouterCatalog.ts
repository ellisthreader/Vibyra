// Live model catalog from OpenRouter, ported from the old app: fetch the
// tools-capable roster, keep general chat models from featured companies,
// rank by quality + recency, and group per company in display order.
// Cached in localStorage so the picker opens instantly and works offline.

import { COMPANY_META, COMPANY_PRIORITY, companyForModel, trimCompanyPrefix } from "./companyMeta";
import type { CatalogModel, CompanyGroup } from "./catalogTypes";
import { modelArtworkFile } from "./modelArtworkData";
import { seedCuratedModels } from "./catalogSeed";
import { catalogQuality, displayOrder, selectForCompany } from "./openRouterCatalogRanking";
import {
  normalizeOpenRouterReasoning,
  type RawOpenRouterReasoning,
} from "./openRouterReasoning";
import { STATIC_GROUPS } from "./staticModels";

export type { CatalogModel, CompanyGroup } from "./catalogTypes";

const MODELS_URL = "https://openrouter.ai/api/v1/models?supported_parameters=tools";
const CACHE_KEY = "vibyra.modelCatalog.v5";
const CACHE_MS = 15 * 60 * 1000;
const NEW_BADGE_MS = 45 * 24 * 60 * 60 * 1000;
const DEFAULT_LIMIT = 10;
const LIMITS = new Map([
  ["OpenAI", 16], ["Anthropic", 14], ["Google", 12], ["Qwen", 14],
  ["Mistral", 12], ["DeepSeek", 10], ["Meta", 10], ["Microsoft", 8],
  ["Cohere", 8], ["Perplexity", 8], ["Moonshot AI", 8], ["Z.AI", 8],
  ["Amazon", 8], ["AI21", 8], ["IBM", 8], ["OpenRouter", 8],
]);
const BLOCKED_TERMS = [
  "audio", "batch", "beta", "browser", "chat-latest", "clip", "deepresearch", "embedding",
  "experimental", "exp", "gemma", "guard", "image", "moderation", "multi-agent", "ocr",
  "omni", "oss", "preview", "rerank", "research", "safeguard", "search", "speech",
  "transcribe", "tts", "ui-tars", "vl", "web", "vision", "whisper",
];

interface RawModel {
  id?: string;
  name?: string;
  created?: number;
  context_length?: number;
  supported_parameters?: string[];
  architecture?: { output_modalities?: string[] };
  pricing?: { prompt?: string; completion?: string };
  top_provider?: { context_length?: number };
  reasoning?: RawOpenRouterReasoning;
}

export async function loadCatalog(
  force = false,
): Promise<{ groups: CompanyGroup[]; source: "live" | "cache" | "static" }> {
  const cached = readCache();
  if (!force && cached && Date.now() - cached.savedAt < CACHE_MS) {
    return { groups: cached.groups, source: "cache" };
  }
  try {
    const response = await fetch(MODELS_URL, { headers: { Accept: "application/json" } });
    if (!response.ok) throw new Error(`OpenRouter ${response.status}`);
    const json = (await response.json()) as { data?: RawModel[] };
    const groups = buildGroups(Array.isArray(json.data) ? json.data : []);
    if (groups.length === 0) throw new Error("empty catalog");
    localStorage.setItem(CACHE_KEY, JSON.stringify({ savedAt: Date.now(), groups }));
    return { groups, source: "live" };
  } catch {
    if (cached) return { groups: cached.groups, source: "cache" };
    return { groups: STATIC_GROUPS, source: "static" };
  }
}

function readCache(): { savedAt: number; groups: CompanyGroup[] } | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { savedAt?: number; groups?: CompanyGroup[] };
    if (!Array.isArray(parsed.groups) || typeof parsed.savedAt !== "number") return null;
    return { savedAt: parsed.savedAt, groups: parsed.groups };
  } catch {
    return null;
  }
}

function buildGroups(raw: RawModel[]): CompanyGroup[] {
  const byCompany = new Map<string, CatalogModel[]>();
  for (const model of raw) {
    const normalized = normalizeModel(model);
    if (!normalized) continue;
    const list = byCompany.get(normalized.company) ?? [];
    list.push(normalized);
    byCompany.set(normalized.company, list);
  }
  seedCuratedModels(byCompany);
  return Array.from(byCompany.entries())
    .map(([company, models]) => ({
      company,
      providerKey: COMPANY_META.get(company)?.providerKey ?? "openrouter",
      accent: COMPANY_META.get(company)?.accent ?? "#94a3b8",
      models: displayOrder(company, selectForCompany(models, LIMITS.get(company) ?? DEFAULT_LIMIT)),
    }))
    .sort(
      (a, b) =>
        (COMPANY_PRIORITY.get(a.company) ?? 999) - (COMPANY_PRIORITY.get(b.company) ?? 999),
    );
}

function normalizeModel(model: RawModel): CatalogModel | null {
  const id = String(model.id ?? "").trim();
  if (!/^[a-z0-9][a-z0-9._-]*\/[a-z0-9][a-z0-9._:-]*$/i.test(id) || id.length > 140) return null;
  const params = (model.supported_parameters ?? []).map((p) => p.toLowerCase());
  if (!params.includes("tools")) return null;
  const output = model.architecture?.output_modalities;
  if (Array.isArray(output) && (output.length !== 1 || output[0] !== "text")) return null;
  const company = companyForModel(id, String(model.name ?? ""));
  if (!COMPANY_PRIORITY.has(company)) return null;
  const label = trimCompanyPrefix(String(model.name ?? id), company).slice(0, 96);
  if (isBlocked(id, label)) return null;
  // The OpenAI wall is icons-only: a GPT model without artwork doesn't show.
  if (company === "OpenAI" && !modelArtworkFile(id, label)) return null;
  const prompt = price(model.pricing?.prompt);
  const completion = price(model.pricing?.completion);
  const free = id.endsWith(":free") || (prompt === 0 && completion === 0);
  const created = Number(model.created) || 0;
  const reasoning = normalizeOpenRouterReasoning(model.reasoning);
  return {
    id,
    label,
    company,
    contextLength: Number(model.context_length ?? model.top_provider?.context_length ?? 0) || 0,
    tier: tierOf(prompt, completion, free),
    isNew: created * 1000 > Date.now() - NEW_BADGE_MS,
    created,
    supportsReasoning: params.includes("reasoning"),
    reasoningEfforts: reasoning.efforts,
    defaultReasoningEffort: reasoning.defaultEffort,
    reasoningMandatory: reasoning.mandatory,
    score: catalogQuality(id, label, free) * 1_000_000_000 + created,
  };
}

function isBlocked(id: string, label: string): boolean {
  if (/^anthropic\/claude-opus-5(?:-fast|:)/i.test(id)) return true;
  // OpenAI "Pro" tier variants aren't what the codex CLI runs day to day.
  if (/^openai\/[^:]*-pro(?::|$)/i.test(id)) return true;
  const text = `${id} ${label}`.toLowerCase();
  return BLOCKED_PATTERNS.some((pattern) => pattern.test(text));
}

// Compiled once — isBlocked runs for every model of every catalog refresh,
// and compiling ~30 regexes per model was a visible startup hitch.
const BLOCKED_PATTERNS = BLOCKED_TERMS.map(
  (term) => new RegExp(`(^|[^a-z0-9])${term}([^a-z0-9]|$)`, "i"),
);

function tierOf(prompt: number | null, completion: number | null, free: boolean): CatalogModel["tier"] {
  if (free) return "free";
  if (prompt === null || completion === null) return "premium";
  if (completion <= 0.000005 && prompt <= 0.000001) return "budget";
  if (completion <= 0.00002 && prompt <= 0.000005) return "balanced";
  return "premium";
}

function price(value: string | undefined): number | null {
  const numeric = Number.parseFloat(String(value ?? ""));
  return Number.isFinite(numeric) && numeric >= 0 ? numeric : null;
}
