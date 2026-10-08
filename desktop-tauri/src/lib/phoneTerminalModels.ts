import { accountModelFor, type AccountModel } from './phoneAccountModels.ts';
import type { CompanyGroup } from "./catalogTypes";
import type { ResolvedAgent } from "../types";
import { planRunner } from "./modelRunners.ts";
import { modelEffortOptions, resolvedModelEffort } from "./modelEffort.ts";

export type PhoneTerminalRunner = "codex" | "claude" | "gemini" | "qwen" | "aider" | "opencode" | "copilot" | "amp" | "crush" | "continue";
const RUNNERS = new Set<string>(["codex", "claude", "gemini", "qwen", "aider", "opencode", "copilot", "amp", "crush", "continue"]);

export interface PhoneTerminalModel {
  id: string;
  name: string;
  kind: PhoneTerminalRunner;
  model: string;
  isNew: boolean;
  effort: string | null;
  efforts?: string[];
}

/** Same catalogue and integration gates as the Mac picker, no phone allowlist. */
export function phoneTerminalModels(groups: CompanyGroup[], agents: ResolvedAgent[], enabled: string[], accountModels?: Partial<Record<PhoneTerminalRunner, AccountModel[]>>): PhoneTerminalModel[] {
  const models = groups.flatMap(group => group.models.flatMap(model => {
    if (/^(?:~?typesafe\/jev|openrouter\/(?:auto|free|bodybuilder)(?:$|:))/i.test(model.id)) return [];
    const plan = planRunner(model, agents, enabled);
    const kind = plan.runner?.id;
    if (!kind || !RUNNERS.has(kind) || !plan.launchModel) return [];
    // Claude uses the shared chat route; fast variants are a CLI setting,
    // not a model ID accepted by that conversation account.
    if (kind === "claude" && plan.launchModel.endsWith("-fast")) return [];
    const advertised = accountModels?.[kind as PhoneTerminalRunner];
    const offered = advertised ? accountModelFor(plan.launchModel, advertised) : undefined;
    if (advertised && !offered) return [];
    const liveEfforts = offered?.supportedReasoningEfforts?.map(option => option.reasoningEffort).filter(effort => effort !== 'none');
    const preferred = model.defaultReasoningEffort ?? (kind === "claude" ? "high" : "medium");
    const available = liveEfforts ?? modelEffortOptions(model, kind).map(option => option.value);
    const effort = resolvedModelEffort(model, kind, preferred);
    return [{ id: model.id, name: model.label, kind: kind as PhoneTerminalRunner, model: plan.launchModel,
      isNew: model.isNew, efforts: available,
      effort: available.length ? effort !== null && available.includes(effort) ? effort : available[0] : null }];
  }));
  // These CLIs choose their model through their own sign-in/configuration. This
  // launches their actual default, rather than inventing model support for them.
  const defaults: PhoneTerminalModel[] = agents.filter(agent =>
    ["copilot", "amp", "crush", "continue"].includes(agent.id) && agent.installed && enabled.includes(agent.id))
    .map(agent => ({ id: `runner:${agent.id}`, name: `${agent.name} · CLI default`, kind: agent.id as PhoneTerminalRunner,
      model: '', isNew: false, effort: null, efforts: [] }));
  return [...models, ...defaults];
}
