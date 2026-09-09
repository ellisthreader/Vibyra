import { modelArtworkFile } from "./modelArtworkData.ts";
import type { CatalogModel } from "./catalogTypes";

const NEWEST_RESERVE = 4;
const CLAUDE_FAMILIES = ["opus", "fable", "sonnet", "haiku"];

export function catalogQuality(id: string, label: string, free: boolean): number {
  const text = `${id} ${label}`.toLowerCase();
  let score = 70;
  if (modelArtworkFile(id, label)) score += 60;
  if (/\b(opus|ultra|max|pro)\b/.test(text)) score += 45;
  if (/\b(gpt|claude|gemini|grok|deepseek|qwen|mistral)\b/.test(text)) score += 12;
  if (/\b(agent|code|coding|reasoning|thinking)\b/.test(text)) score += 10;
  if (/\b(sonnet|medium|large|70b|120b)\b/.test(text)) score += 8;
  if (/\b(flash|mini|haiku|nano|lite|small|free)\b/.test(text) || free) score -= 18;
  return score;
}

function compare(a: CatalogModel, b: CatalogModel): number {
  return b.score - a.score || b.contextLength - a.contextLength || a.label.localeCompare(b.label);
}

function generationOf(id: string): number {
  return Number(id.match(/-(\d+(?:\.\d+)?)/)?.[1] ?? 0);
}

function claudeRank(id: string): number {
  const bare = id.replace(/^anthropic\//, "");
  const family = CLAUDE_FAMILIES.findIndex((name) => bare.includes(name));
  return (family === -1 ? 9 : family) * 2 + (/-fast\b/.test(bare) ? 1 : 0);
}

/** Native walls read newest-generation-first and keep family order stable. */
export function displayOrder(company: string, models: CatalogModel[]): CatalogModel[] {
  if (company === "Anthropic") {
    return [...models].sort(
      (a, b) =>
        generationOf(b.id) - generationOf(a.id) ||
        claudeRank(a.id) - claudeRank(b.id) ||
        a.label.localeCompare(b.label),
    );
  }
  if (company === "OpenAI") {
    return [...models].sort(
      (a, b) => generationOf(b.id) - generationOf(a.id) || a.label.localeCompare(b.label),
    );
  }
  return models;
}

/** Keep the newest models even when quality ranking would push them out. */
export function selectForCompany(models: CatalogModel[], limit: number): CatalogModel[] {
  const newest = [...models]
    .sort((a, b) => b.created - a.created || compare(a, b))
    .slice(0, Math.min(NEWEST_RESERVE, limit));
  const selected = new Map(newest.map((model) => [model.id, model]));
  for (const model of [...models].sort(compare)) {
    if (selected.size >= limit) break;
    selected.set(model.id, model);
  }
  return Array.from(selected.values()).sort(compare);
}
