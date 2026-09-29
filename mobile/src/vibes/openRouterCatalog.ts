import { isTerminalModel } from '../ui/terminalModelPolicy';
import type { FundedModel } from './types';

/** Public discovery only. These rows never authorize a paid launch or supply billing prices. */
export function parseOpenRouterCatalog(value: unknown): FundedModel[] {
  const data = (value as { data?: unknown })?.data;
  if (!Array.isArray(data)) throw new Error('The OpenRouter model list could not be read.');
  const models = new Map<string, FundedModel>();
  for (const row of data) {
    if (!row || typeof row.id !== 'string' || typeof row.name !== 'string' || !isTerminalModel(row.id) ||
      !Array.isArray(row.architecture?.output_modalities) || !row.architecture.output_modalities.includes('text')) continue;
    models.set(row.id, { id: row.id, name: row.name, family: row.id.split('/')[0], source: 'vibyra',
      tools: Array.isArray(row.supported_parameters) && row.supported_parameters.includes('tools'),
      created: typeof row.created === 'number' ? row.created : null,
      available: false, trial: false, inputPerMillion: null, outputPerMillion: null });
  }
  if (!models.size) throw new Error('No chat or code models were returned. Try again.');
  return [...models.values()];
}

let cached: { at: number; models: FundedModel[] } | undefined;
export async function openRouterCatalog(signal: AbortSignal): Promise<FundedModel[]> {
  if (cached && Date.now() - cached.at < 5 * 60_000) return cached.models;
  // No account token, credentials, prompts or project data leave the device.
  const response = await fetch('https://openrouter.ai/api/v1/models', { signal });
  if (!response.ok) throw new Error('OpenRouter models could not be loaded. Try again.');
  const models = parseOpenRouterCatalog(await response.json());
  cached = { at: Date.now(), models };
  return models;
}
