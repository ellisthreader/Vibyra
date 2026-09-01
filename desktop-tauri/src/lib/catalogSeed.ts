// OpenRouter is not the authority on what Vibyra can run. A curated model —
// one we hold artwork for — is a model an account-owned CLI accepts, so a
// provider catalog that has not listed it yet must not be the reason nobody
// can pick it.
//
// Value imports carry ".ts" so this stays loadable by the node test runner.

import { STATIC_GROUPS } from "./staticModels.ts";
import { nativeAccountModelSupported } from "./modelArtworkData.ts";
import { catalogQuality } from "./openRouterCatalogRanking.ts";
import type { CatalogModel } from "./catalogTypes";

/**
 * Adds curated models the live catalog is missing, in place. Only companies
 * OpenRouter actually returned are seeded, so a failed fetch still falls back
 * to the whole static roster rather than a half-filled one. A seeded model
 * carries no context length, because no catalog has told us one — the chip
 * simply does not appear until OpenRouter carries the model.
 */
export function seedCuratedModels(byCompany: Map<string, CatalogModel[]>): void {
  for (const group of STATIC_GROUPS) {
    const live = byCompany.get(group.company);
    if (!live) continue;
    const listed = new Set(live.map((model) => model.id));
    for (const model of group.models) {
      if (listed.has(model.id) || !nativeAccountModelSupported(model.company, model.id)) continue;
      live.push({
        ...model,
        contextLength: 0,
        score: catalogQuality(model.id, model.label, false) * 1_000_000_000,
      });
    }
  }
}
