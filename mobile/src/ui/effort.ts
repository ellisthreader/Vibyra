import type { Effort, Reasoning, VibesModel } from '../vibes/types';

// Reasoning effort is OpenRouter's own vocabulary, and every model publishes the
// exact ladder it accepts. The phone never invents a level: an effort the model
// does not list is rejected by the provider, so the picker offers only what the
// catalogue reported. Desktop's `ultra`/`ultracode` are Claude Code / Codex CLI
// launch modes, not API values, so they have no place in a chat that calls the
// OpenRouter API directly. `Effort` and `Reasoning` are wire types, so they live
// beside the rest of the Vibes payload in `vibes/types`.
/** Ascending, so a slider or a list always reads cheapest-to-deepest. */
export const efforts: Effort[] = ['none', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max'];
const known = new Set<string>(efforts);

export interface EffortChoice { value: Effort; label: string; hint: string }
// The labels match Vibyra Desktop word for word so one person reading both
// surfaces sees one ladder. Only the hints differ where a desktop hint describes
// a terminal runner rather than a chat.
const choices: Record<Effort, EffortChoice> = {
  none: { value: 'none', label: 'None', hint: 'Reasoning off' },
  minimal: { value: 'minimal', label: 'Minimal', hint: 'Quick reasoning' },
  low: { value: 'low', label: 'Low', hint: 'Fastest' },
  medium: { value: 'medium', label: 'Medium', hint: 'Balanced' },
  high: { value: 'high', label: 'High', hint: 'Deep reasoning' },
  xhigh: { value: 'xhigh', label: 'X-high', hint: 'Longer, harder problems' },
  max: { value: 'max', label: 'Max', hint: 'Deepest single answer' },
};
export const effortChoice = (value: Effort): EffortChoice => choices[value];
export const effortLabel = (value: Effort | null): string => (value ? choices[value].label : 'Default');

export const noReasoning: Reasoning = { efforts: [], defaultEffort: null, mandatory: false };

/**
 * Normalizes one model's raw OpenRouter reasoning metadata.
 *
 * Three shapes exist in the live catalogue and they mean different things:
 * a missing `supported_efforts` key means reasoning is a switch with no levels,
 * an explicit null means every level is accepted, and an array is the exact
 * ladder. Only the last two can drive a picker, so the first returns no efforts
 * rather than guessing a ladder the provider would reject.
 */
export function normalizeReasoning(raw: unknown): Reasoning {
  if (!raw || typeof raw !== 'object') return noReasoning;
  const value = raw as { mandatory?: unknown; supported_efforts?: unknown; default_effort?: unknown };
  const mandatory = value.mandatory === true;
  const supported = value.supported_efforts;
  const accepted: string[] = supported === null ? efforts
    : Array.isArray(supported) ? supported.filter((item): item is string => typeof item === 'string') : [];
  // A mandatory reasoner cannot be switched off, so "none" is not offered.
  const list = efforts.filter(effort => accepted.includes(effort) && !(mandatory && effort === 'none'));
  const fallback = typeof value.default_effort === 'string' ? value.default_effort : '';
  return { efforts: list, defaultEffort: list.includes(fallback as Effort) ? fallback as Effort : null, mandatory };
}

/** The ladder a model offers, or none at all when it cannot be steered. */
export const effortsFor = (model: VibesModel | undefined): Effort[] => model?.reasoning?.efforts ?? [];
export const supportsEffort = (model: VibesModel | undefined): boolean => effortsFor(model).length > 1;

/**
 * The effort to use for a model. A choice the model supports is kept, so moving
 * between two comparable models does not silently reset it; otherwise the model's
 * own published default wins, and the nearest supported level is the last resort.
 * Returning null means "send no effort at all" and let the provider decide.
 */
export function resolveEffort(model: VibesModel | undefined, current: Effort | null): Effort | null {
  const available = effortsFor(model);
  if (!available.length) return null;
  if (current && available.includes(current)) return current;
  const preferred = model?.reasoning?.defaultEffort;
  if (preferred && available.includes(preferred)) return preferred;
  if (!current) return available[Math.floor((available.length - 1) / 2)] ?? null;
  // Keep the intent of an unsupported choice by stepping to the closest rung.
  // `available` is ascending and ties keep the rung already held, so a choice
  // that sits exactly between two levels settles on the cheaper one: an effort
  // this model never offered must not quietly cost more than the one asked for.
  const wanted = efforts.indexOf(current);
  return available.reduce((best, effort) =>
    Math.abs(efforts.indexOf(effort) - wanted) < Math.abs(efforts.indexOf(best) - wanted) ? effort : best);
}

/** Guards a value that arrived from storage or the network. */
export const asEffort = (value: unknown): Effort | null =>
  (typeof value === 'string' && known.has(value) ? value as Effort : null);
