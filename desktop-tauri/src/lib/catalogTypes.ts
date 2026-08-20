import type { OpenRouterEffort } from "./openRouterReasoning";

export interface CatalogModel {
  id: string;
  label: string;
  company: string;
  contextLength: number;
  tier: "free" | "budget" | "balanced" | "premium";
  isNew: boolean;
  score: number;
  created: number;
  supportsReasoning: boolean;
  reasoningEfforts: OpenRouterEffort[];
  defaultReasoningEffort: OpenRouterEffort | null;
  reasoningMandatory: boolean;
}

export interface CompanyGroup {
  company: string;
  providerKey: string;
  accent: string;
  models: CatalogModel[];
}
