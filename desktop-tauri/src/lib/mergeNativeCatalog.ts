import type { CompanyGroup } from "./catalogTypes";
import { COMPANY_PRIORITY } from "./companyMeta.ts";
import { nativeAccountModelSupported } from "./nativeAccountModels.ts";
import { displayOrder } from "./openRouterCatalogRanking.ts";
import { STATIC_GROUPS } from "./staticModels.ts";

/** OpenRouter availability cannot remove models from personal-account CLIs. */
export function mergeNativeCatalog(groups: CompanyGroup[]): CompanyGroup[] {
  const merged = new Map(groups.map((group) => [group.company, group]));
  for (const fallback of STATIC_GROUPS) {
    const nativeModels = fallback.models.filter((model) =>
      nativeAccountModelSupported(fallback.company, model.id));
    if (!nativeModels.length) continue;
    const current = merged.get(fallback.company) ?? { ...fallback, models: [] };
    const models = new Map(nativeModels.map((model) => [model.id, model]));
    // Keep live metadata when available, and add only missing native entries.
    for (const model of current.models) models.set(model.id, model);
    merged.set(fallback.company, {
      ...current, models: displayOrder(fallback.company, [...models.values()]),
    });
  }
  return [...merged.values()].sort((a, b) =>
    (COMPANY_PRIORITY.get(a.company) ?? 999) - (COMPANY_PRIORITY.get(b.company) ?? 999));
}
