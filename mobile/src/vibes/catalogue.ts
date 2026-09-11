import { snapshotModels } from './catalogueSnapshot';
import type { Effort, VibesModel } from './types';

// The picker is a menu, so it must fill before — and without — a network answer.
// `/api/vibes/models` replaces this list whenever it responds, adding live pricing
// and, on full-catalogue plans, the rest of the OpenRouter snapshot. Keep the ids,
// families and tiers in step with `backend/config/vibes.php`; `available` here only
// means "offered", and the quote is still what decides whether a model can run.
// `trial` is what a free account may spend its trial credit on, and it follows the
// same price ceiling the backend applies (`vibes.free_tier`): at or under
// $1.00/M in and $5.00/M out, which admits every curated model but the four
// flagships. `FREE_EXTRA` below mirrors `vibes.free_extra`, the models included by
// decision rather than by price; it is empty on both sides now, because a trial of
// a few Vibes cannot fund a flagship turn anyway and showing one as included only
// to refuse it at send is worse than drawing the lock. Keep both in step with the
// config — the server decides what is actually funded, and this list only decides
// what the picker draws a lock on.
//
// `efforts` mirrors the ladder OpenRouter publishes for that model, so the effort
// control is right offline and in the browser preview too. An empty ladder is a
// fact, not a gap: most of these models expose no levels to choose between.
const model = (id: string, family: string, name: string, tier: VibesModel['tier'],
  released: string, blurb: string, trial = false, efforts: Effort[] = [], defaultEffort: Effort | null = null,
  mandatory = false): VibesModel =>
  ({ id, family, name, tier, released, blurb, trial, available: true, inputPerMillion: null, outputPerMillion: null,
    reasoning: { efforts, defaultEffort, mandatory }, created: null });
const FULL: Effort[] = ['low', 'medium', 'high', 'xhigh', 'max'];
const BASIC: Effort[] = ['low', 'medium', 'high'];

const curated: VibesModel[] = [
  model('openai/gpt-6-astra', 'OpenAI', 'GPT-6 Astra', 'best', '2026-07-14', 'Deepest reasoning for hard, multi-file work.', false, FULL, 'medium', true),
  model('anthropic/claude-opus-5', 'Claude', 'Opus 5', 'best', '2026-05-20', 'Long, careful refactors and large codebases.', false, FULL, 'high', false),
  model('anthropic/claude-sonnet-5', 'Claude', 'Sonnet 5', 'best', '2026-02-11', 'Strong everyday coding with quick replies.', false, FULL, 'high', false),
  model('google/gemini-3.8-pro', 'Gemini', 'Gemini 3.8 Pro', 'best', '2026-04-02', 'Huge context for whole-project questions.'),
  model('x-ai/grok-4.6', 'Grok', 'Grok 4.6', 'best', '2026-03-05', 'Direct answers and confident debugging.', false, ['low', 'medium', 'high', 'xhigh'], 'high', true),
  model('openai/gpt-5.6-luna', 'OpenAI', 'GPT-5.6 Luna', 'newest', '2026-08-19', 'Balanced all-rounder, included in your trial.', true, ['none', 'low', 'medium', 'high', 'xhigh', 'max'], 'medium', false),
  model('deepseek/deepseek-v4-pro-0813', 'DeepSeek', 'DeepSeek V4 Pro', 'newest', '2026-08-13', 'Deliberate planning before it writes code.', true, ['low', 'high', 'max'], 'high', false),
  model('moonshotai/kimi-k2.7-code', 'Kimi', 'Kimi K2.7 Code', 'newest', '2026-08-06', 'Tuned for editing existing source files.', true),
  model('minimax/minimax-m3', 'MiniMax', 'MiniMax M3', 'newest', '2026-07-28', 'Fresh open model with a wide context.', true),
  model('z-ai/glm-5', 'GLM', 'GLM-5', 'newest', '2026-06-30', 'Reliable tool use on structured tasks.', true),
  model('mistralai/devstral-2512', 'Mistral', 'Devstral', 'newest', '2026-06-11', 'Built for repository-scale code changes.', true),
  model('google/gemini-3.8-flash', 'Gemini', 'Gemini 3.8 Flash', 'fast', '2026-04-02', 'Very quick replies for small changes.', true, BASIC, 'medium', true),
  model('qwen/qwen3.8-flash', 'Qwen', 'Qwen3.8 Flash', 'fast', '2026-05-15', 'The default behind Auto: fast and cheap.', true),
  model('anthropic/claude-haiku-4.5', 'Claude', 'Haiku 4.5', 'fast', '2025-10-01', 'Snappy Claude for short, focused edits.', true),
  model('x-ai/grok-4.6-fast', 'Grok', 'Grok 4.6 Fast', 'fast', '2026-03-05', 'Grok speed for quick back-and-forth.', false),
  model('openai/gpt-5.6-luna-mini', 'OpenAI', 'GPT-5.6 Luna Mini', 'fast', '2026-08-19', 'Smaller Luna for everyday questions.', true),
  model('meta-llama/llama-4-maverick', 'Llama', 'Llama 4 Maverick', 'value', '2025-04-05', 'Open weights, generous context, low cost.', true),
  model('deepseek/deepseek-chat-v3.1', 'DeepSeek', 'DeepSeek V3.1', 'value', '2025-08-21', 'Capable coding for very few Vibes.', true),
  model('qwen/qwen3-coder', 'Qwen', 'Qwen3 Coder', 'value', '2025-07-23', 'Code-first open model on a budget.', true),
  model('openai/gpt-oss-120b', 'OpenAI', 'GPT-OSS 120B', 'value', '2025-08-05', 'OpenAI open weights at open pricing.', true, BASIC, 'medium', true),
  model('moonshotai/kimi-k2', 'Kimi', 'Kimi K2', 'value', '2025-07-11', 'Large open model, small bill.', true),
  model('mistralai/mistral-small-3.2-24b-instruct', 'Mistral', 'Mistral Small 3.2', 'value', '2025-06-20', 'Light, cheap and dependable.', true),
];

// Curated ids that OpenRouter does not actually serve. Checked against the live
// `/api/v1/models`: quoting one of these fails with "temporarily unavailable",
// and the live catalogue already hides them by reporting no price, so the shipped
// list must not promise them either. Recheck when regenerating the snapshot.
const UNSERVED = new Set(['google/gemini-3.8-pro', 'x-ai/grok-4.6-fast']);

// Mirrors `vibes.free_extra`: included for free by decision, past any ceiling a
// sane rule would set. GPT-5.5 is $30/M out, dearer than Opus 5, which stays locked.
const FREE_EXTRA = new Set<string>([]);

/**
 * What the picker shows before the server answers: the curated models, which carry
 * a tier and a written blurb, followed by the rest of the shipped snapshot. A
 * curated entry wins on id, so a model never appears twice and never loses its
 * blurb to a plainer row.
 */
export const fallbackModels: VibesModel[] = [
  ...curated.map(model => (UNSERVED.has(model.id) ? { ...model, available: false } : model)),
  ...snapshotModels.filter(model => !curated.some(entry => entry.id === model.id))]
  .map(model => (FREE_EXTRA.has(model.id) ? { ...model, trial: true } : model));
