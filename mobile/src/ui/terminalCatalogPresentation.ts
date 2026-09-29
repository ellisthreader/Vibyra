import { isTerminalModel } from './terminalModelPolicy';
import type { FundedModel } from '../vibes/types';
import { brandFor, vendorOf } from './brands';

const featured = ['openai', 'anthropic', 'google', 'x-ai', 'deepseek', 'meta-llama', 'mistralai', 'qwen', 'moonshotai', 'minimax', 'z-ai', 'perplexity'];

/** Hide transport variants, not distinct models; preserve the chosen model's exact ID. */
export function terminalCatalogModels(models: FundedModel[]): FundedModel[] {
  const ids = new Set(models.map(model => model.id));
  return models.filter(model => isTerminalModel(model.id) && !/(?:[:/-]batch)(?:$|[:/])/i.test(model.id) && !/\(batch\)/i.test(model.name) &&
    !(model.id.startsWith('~') && ids.has(model.id.slice(1))))
    .sort((a, b) => (b.created ?? 0) - (a.created ?? 0) || b.name.localeCompare(a.name, undefined, { numeric: true }));
}

export function fundedCompanies(models: FundedModel[], browseOnly = false) {
  const groups = new Map<string, { vendor: string; name: string; section: string; models: { id: string; name: string; disabled: boolean; detail: string }[] }>();
  for (const model of terminalCatalogModels(models)) {
    const vendor = vendorOf(model.id);
    const group = groups.get(vendor) ?? { vendor, name: brandFor(vendor).name,
      section: featured.includes(vendor) ? 'Featured companies' : 'More companies', models: [] };
    group.models.push({ id: model.id, name: model.name.replace(/^[^:]+: /, ''), disabled: !browseOnly && !model.available,
      detail: !browseOnly && !model.available ? model.unavailableReason ?? 'Temporarily unavailable' : `Uses Vibyra tokens${model.tools ? '' : ' · Chat only'}` });
    groups.set(vendor, group);
  }
  const rank = (vendor: string) => featured.includes(vendor) ? featured.indexOf(vendor) : featured.length;
  return [...groups.values()].sort((a, b) => rank(a.vendor) - rank(b.vendor) || a.name.localeCompare(b.name));
}
