import type { VibesModel } from '../vibes/types';
import { brandFor, vendorOf } from './brands';

// Reviewed against OpenRouter /api/v1/models and Vibyra /api/vibes/models on
// 2026-09-12. Latest useful family variants, not every historical release.
// Review this list when updating the catalogue; don't infer successors from age
// alone (Haiku and Devstral remain the current options in their families).
export const PICKER_MODEL_IDS = new Set([
  'openai/gpt-6-astra',
  'openai/gpt-5.6-sol',
  'openai/gpt-5.6-terra',
  'openai/gpt-5.6-luna',
  'anthropic/claude-fable-5.1',
  'anthropic/claude-opus-5',
  'anthropic/claude-sonnet-5',
  'anthropic/claude-haiku-4.5',
  'google/gemini-3.8-flash',
  'google/gemini-3.5-flash-lite',
  'x-ai/grok-4.6',
  'deepseek/deepseek-v4.1-flash',
  'deepseek/deepseek-v4-pro-0813',
  'qwen/qwen3.8-max-0902',
  'qwen/qwen3.8-flash',
  'moonshotai/kimi-k3',
  'moonshotai/kimi-k2.7-code',
  'minimax/minimax-m3',
  'mistralai/mistral-medium-3-5',
  'mistralai/mistral-small-2603',
  'mistralai/devstral-2512',
]);

/** Menu curation only: stored chats, model identities and billing stay intact. */
export function pickerModels(models: VibesModel[]): VibesModel[] {
  return models.filter((model) => {
    const brand = brandFor(vendorOf(model.id));
    return (
      model.available &&
      PICKER_MODEL_IDS.has(model.id) &&
      Boolean(brand.path || brand.paths?.length)
    );
  });
}
