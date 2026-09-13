import { brandFor, vendorOf } from './brands';
import type { VibesModel } from '../vibes/types';

export interface Company { vendor: string; name: string; models: VibesModel[]; newCount: number }

// The companies most people come looking for, in the order they ask for them.
// Everything else follows on merit rather than alphabetically, because an
// alphabetical catalogue opens on AI21 and buries OpenAI thirty rows down.
const RANKED = ['openai', 'anthropic', 'google', 'x-ai', 'deepseek', 'qwen', 'moonshotai',
  'mistralai', 'meta-llama', 'z-ai', 'minimax', 'microsoft', 'amazon', 'nvidia', 'cohere', 'perplexity'];
const rankOf = (vendor: string) => { const at = RANKED.indexOf(vendor); return at < 0 ? RANKED.length : at; };

// Curated models are the ones with a written blurb and a tier, so they lead their
// company; the rest of the live catalogue follows newest first.
const TIERS = ['best', 'newest', 'fast', 'value'];
const tierOf = (model: VibesModel) => { const at = TIERS.indexOf(model.tier ?? ''); return at < 0 ? TIERS.length : at; };

/** Release time in milliseconds, from either the curated date or OpenRouter's epoch. */
export function releasedAt(model: VibesModel): number {
  const created = typeof model.created === 'number' && model.created > 0 ? model.created * 1000 : 0;
  const released = model.released ? Date.parse(model.released) : NaN;
  return Math.max(created, Number.isFinite(released) ? released : 0);
}

// One week. A badge that half the catalogue wears says nothing, so "New" means
// released in the last seven days and nothing looser.
export const NEW_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;
export function isNew(model: VibesModel, now = Date.now()): boolean {
  const at = releasedAt(model);
  // A future timestamp would otherwise read as new forever.
  return at > 0 && at <= now && now - at < NEW_WINDOW_MS;
}

/** Newest and most carefully chosen first, and stable across renders. */
export function compareModels(a: VibesModel, b: VibesModel): number {
  return tierOf(a) - tierOf(b) || releasedAt(b) - releasedAt(a) || a.name.localeCompare(b.name);
}

/**
 * Every company in the catalogue, each holding its own models. Grouping is by the
 * normalized vendor, so one maker is one card however many slugs it publishes
 * under, and no company is dropped for being unfamiliar - an unranked vendor
 * sorts on how much it offers rather than disappearing.
 */
export function groupCompanies(models: VibesModel[], now = Date.now()): Company[] {
  const byVendor = new Map<string, VibesModel[]>();
  for (const model of models) {
    if (unlisted(model)) continue;
    const vendor = vendorOf(model.id);
    const group = byVendor.get(vendor);
    if (group) group.push(model); else byVendor.set(vendor, [model]);
  }
  return [...byVendor].map(([vendor, list]) => ({
    vendor, name: brandFor(vendor).name,
    models: [...list].sort(compareModels),
    newCount: list.filter(model => isNew(model, now)).length,
  })).sort((a, b) => rankOf(a.vendor) - rankOf(b.vendor)
    || b.models.length - a.models.length || a.name.localeCompare(b.name));
}

// Companies whose models are not what Vibyra is for. Nothing here is a judgement
// on the model, only on whether a person picking an AI to write code with should
// have to read past it.
const UNLISTED = new Set(['baidu', 'upstage', 'stepfun', 'ibm-granite', 'inception']);
// `-latest` ids are moving pointers rather than models, so they duplicate whatever
// they currently resolve to.
// OpenAI's cut-down variants. They sit beside the model they are cut down from
// and are told apart only by a suffix, which is a decision nobody asked for.
const UNLISTED_MODELS = new Set(['openai/gpt-5.6-luna-mini', 'openai/gpt-5.4-nano', 'openai/gpt-oss-120b']);

/** Whether a model is kept out of the picker entirely. */
export const unlisted = (model: VibesModel) =>
  UNLISTED.has(vendorOf(model.id)) || UNLISTED_MODELS.has(model.id) || /-latest$/.test(model.id);

/** Matches a company name or a model name, so "anthropic" and "opus" both work. */
export const matches = (model: VibesModel, search: string) =>
  `${brandFor(vendorOf(model.id)).name} ${model.name} ${model.id}`.toLowerCase().includes(search);

// A company card opens on its best few rather than all fifty, and a broad search
// is capped, because the sheet mounts every row it is given.
export const PREVIEW = 6;
export const SEARCH_LIMIT = 60;
