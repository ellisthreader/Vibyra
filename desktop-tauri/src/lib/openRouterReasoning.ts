export type OpenRouterEffort =
  | "none"
  | "minimal"
  | "low"
  | "medium"
  | "high"
  | "xhigh"
  | "max";

export interface RawOpenRouterReasoning {
  mandatory?: boolean;
  supported_efforts?: string[] | null;
  default_effort?: string | null;
}

export interface OpenRouterReasoning {
  efforts: OpenRouterEffort[];
  defaultEffort: OpenRouterEffort | null;
  mandatory: boolean;
}

const EFFORT_ORDER: OpenRouterEffort[] = [
  "none", "minimal", "low", "medium", "high", "xhigh", "max",
];

/** Normalizes OpenRouter's highest-first metadata for an ascending UI slider. */
export function normalizeOpenRouterReasoning(
  reasoning: RawOpenRouterReasoning | undefined,
): OpenRouterReasoning {
  const mandatory = reasoning?.mandatory === true;
  const hasEfforts = reasoning !== undefined && Object.hasOwn(reasoning, "supported_efforts");
  const rawEfforts = hasEfforts ? reasoning.supported_efforts : undefined;
  const accepted = rawEfforts === null
    ? EFFORT_ORDER
    : Array.isArray(rawEfforts) ? rawEfforts : [];
  const efforts = EFFORT_ORDER.filter(
    (effort) => accepted.includes(effort) && !(mandatory && effort === "none"),
  );
  const rawDefault = String(reasoning?.default_effort ?? "");
  const defaultEffort = efforts.includes(rawDefault as OpenRouterEffort)
    ? rawDefault as OpenRouterEffort
    : null;
  return { efforts, defaultEffort, mandatory };
}
