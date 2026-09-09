import type { VibesModel } from './types';

// The picker is a menu, so it must fill before — and without — a network answer.
// `/api/vibes/models` replaces this list whenever it responds, adding live pricing
// and, on full-catalogue plans, the rest of the OpenRouter snapshot. Keep the ids,
// families and tiers in step with `backend/config/vibes.php`; `available` here only
// means "offered", and the quote is still what decides whether a model can run.
const model = (id: string, family: string, name: string, tier: VibesModel['tier'],
  released: string, blurb: string, trial = false): VibesModel =>
  ({ id, family, name, tier, released, blurb, trial, available: true, inputPerMillion: null, outputPerMillion: null });

export const fallbackModels: VibesModel[] = [
  model('openai/gpt-6-astra', 'OpenAI', 'GPT-6 Astra', 'best', '2026-07-14', 'Deepest reasoning for hard, multi-file work.'),
  model('anthropic/claude-opus-5', 'Claude', 'Opus 5', 'best', '2026-05-20', 'Long, careful refactors and large codebases.'),
  model('anthropic/claude-sonnet-5', 'Claude', 'Sonnet 5', 'best', '2026-02-11', 'Strong everyday coding with quick replies.'),
  model('google/gemini-3.8-pro', 'Gemini', 'Gemini 3.8 Pro', 'best', '2026-04-02', 'Huge context for whole-project questions.'),
  model('x-ai/grok-4.6', 'Grok', 'Grok 4.6', 'best', '2026-03-05', 'Direct answers and confident debugging.'),
  model('openai/gpt-5.6-luna', 'OpenAI', 'GPT-5.6 Luna', 'newest', '2026-08-19', 'Balanced all-rounder, included in your trial.', true),
  model('deepseek/deepseek-v4-pro-0813', 'DeepSeek', 'DeepSeek V4 Pro', 'newest', '2026-08-13', 'Deliberate planning before it writes code.'),
  model('moonshotai/kimi-k2.7-code', 'Kimi', 'Kimi K2.7 Code', 'newest', '2026-08-06', 'Tuned for editing existing source files.'),
  model('minimax/minimax-m3', 'MiniMax', 'MiniMax M3', 'newest', '2026-07-28', 'Fresh open model with a wide context.', true),
  model('z-ai/glm-5', 'GLM', 'GLM-5', 'newest', '2026-06-30', 'Reliable tool use on structured tasks.'),
  model('mistralai/devstral-2512', 'Mistral', 'Devstral', 'newest', '2026-06-11', 'Built for repository-scale code changes.', true),
  model('google/gemini-3.8-flash', 'Gemini', 'Gemini 3.8 Flash', 'fast', '2026-04-02', 'Very quick replies for small changes.', true),
  model('qwen/qwen3.8-flash', 'Qwen', 'Qwen3.8 Flash', 'fast', '2026-05-15', 'The default behind Auto: fast and cheap.', true),
  model('anthropic/claude-haiku-4.5', 'Claude', 'Haiku 4.5', 'fast', '2025-10-01', 'Snappy Claude for short, focused edits.', true),
  model('x-ai/grok-4.6-fast', 'Grok', 'Grok 4.6 Fast', 'fast', '2026-03-05', 'Grok speed for quick back-and-forth.', true),
  model('openai/gpt-5.6-luna-mini', 'OpenAI', 'GPT-5.6 Luna Mini', 'fast', '2026-08-19', 'Smaller Luna for everyday questions.', true),
  model('meta-llama/llama-4-maverick', 'Llama', 'Llama 4 Maverick', 'value', '2025-04-05', 'Open weights, generous context, low cost.', true),
  model('deepseek/deepseek-chat-v3.1', 'DeepSeek', 'DeepSeek V3.1', 'value', '2025-08-21', 'Capable coding for very few Vibes.', true),
  model('qwen/qwen3-coder', 'Qwen', 'Qwen3 Coder', 'value', '2025-07-23', 'Code-first open model on a budget.', true),
  model('openai/gpt-oss-120b', 'OpenAI', 'GPT-OSS 120B', 'value', '2025-08-05', 'OpenAI open weights at open pricing.', true),
  model('moonshotai/kimi-k2', 'Kimi', 'Kimi K2', 'value', '2025-07-11', 'Large open model, small bill.', true),
  model('mistralai/mistral-small-3.2-24b-instruct', 'Mistral', 'Mistral Small 3.2', 'value', '2025-06-20', 'Light, cheap and dependable.', true),
];
